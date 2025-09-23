// =========================
// JP Mail Check – background
// =========================

// ---- モード・設定 ----
const DEFAULT_MODE = "vt";                              // "vt" | "gsb" | "pt"
const STORAGE_KEY  = "checkMode";
const VALID_MODES  = new Set(["vt", "gsb", "pt"]);
let currentCheck   = DEFAULT_MODE;

function notify(message) {
  return browser.notifications.create({
    type: "basic",
    title: "JP Spam Reporter",
    message,
  });
}
async function setTitle(title, tabId) {
  try { await browser.messageDisplayAction.setTitle({ title, tabId }); } catch {}
}

async function loadMode() {
  try {
    const obj = await browser.storage.local.get({ [STORAGE_KEY]: DEFAULT_MODE });
    currentCheck = VALID_MODES.has(obj[STORAGE_KEY]) ? obj[STORAGE_KEY] : DEFAULT_MODE;
    console.log("[JP Mail Check] mode:", currentCheck);
  } catch (e) {
    console.error("loadMode failed", e);
    currentCheck = DEFAULT_MODE;
  }
}
browser.runtime.onStartup?.addListener(loadMode);
browser.runtime.onInstalled?.addListener(loadMode);
loadMode();

browser.storage.onChanged.addListener((chg, area) => {
  if (area === "local" && chg[STORAGE_KEY]) {
    const v = chg[STORAGE_KEY].newValue;
    if (VALID_MODES.has(v)) currentCheck = v;
  }
});

async function loadSettings() {
  // 旧キー名にも一応対応（vtKey/gsbKey/ptKey があれば拾う）
  const st = await browser.storage.local.get(null);
  const vtApiKey  = st.vtApiKey  ?? st.vtKey  ?? "";
  const gsbApiKey = st.gsbApiKey ?? st.gsbKey ?? "";
  const ptAppKey  = st.ptAppKey  ?? st.ptKey  ?? "";
  const toAntiPhishing = st.toAntiPhishing || "info@antiphishing.jp";
  const toDekyo        = st.toDekyo        || "meiwaku@dekyo.or.jp";
  const attachEml      = st.attachEml !== false;
  return { vtApiKey, gsbApiKey, ptAppKey, toAntiPhishing, toDekyo, attachEml };
}

// ---- URL サニタイズ ----
function sanitizeUrl(raw) {
  if (!raw) return "";
  let u = String(raw).trim();

  // 包囲文字
  if ((u.startsWith("<") && u.endsWith(">")) ||
      (u.startsWith('"') && u.endsWith('"')) ||
      (u.startsWith("'") && u.endsWith("'"))) {
    u = u.slice(1, -1);
  }

  // 迷彩解除
  u = u
    .replace(/hxxps?:\/\//i, m => m.replace("xx", "tt"))
    .replace(/\[\.\]/g, ".")
    .replace(/\(dot\)/gi, ".")
    .replace(/\\+/g, "/");

  // ゼロ幅/空白・改行
  u = u.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "");

  // スキーム補正
  if (/^\/\//.test(u)) u = "https:" + u;
  if (!/^https?:\/\//i.test(u)) return "";

  // フラグメント除去
  const hashIdx = u.indexOf("#");
  if (hashIdx > -1) u = u.slice(0, hashIdx);

  try {
    const urlObj = new URL(u);
    urlObj.pathname = encodeURI(decodeURI(urlObj.pathname));
    urlObj.search   = urlObj.search ? "?" + new URLSearchParams(urlObj.search.slice(1)).toString() : "";
    return urlObj.toString();
  } catch {
    return "";
  }
}

// ---- メールから URL 抽出 ----
async function getDisplayedMessage(tabId) {
  try {
    const msg = await browser.messageDisplay.getDisplayedMessage(tabId);
    if (msg) return msg;
  } catch {}
  return null;
}

function collectTextParts(part, out) {
  if (!part) return;
  if (part.body && (part.contentType?.startsWith("text/plain") || part.contentType?.startsWith("text/html"))) {
    out.push(part.body);
  }
  if (Array.isArray(part.parts)) {
    for (const p of part.parts) collectTextParts(p, out);
  }
}

function extractUrlsFromText(text) {
  const out = [];
  if (!text) return out;
  // href=… と http(s)://… の両方をざっくり拾う
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = hrefRe.exec(text))) out.push(m[1]);
  const urlRe = /\bhttps?:\/\/[^\s<>"')]+/gi;
  while ((m = urlRe.exec(text))) out.push(m[0]);
  return out;
}

async function extractUrlsFromMail(tab) {
  const urls = new Set();
  const msg = await getDisplayedMessage(tab?.id);
  if (!msg) return [];

  // メール全文（構造化）取得
  let full;
  try {
    full = await browser.messages.getFull(msg.id);
  } catch (e) {
    console.error("getFull failed", e);
  }

  const texts = [];
  if (full) collectTextParts(full, texts);

  // フォールバック：プレーン本文
  try {
    const body = await browser.messages.getRaw(msg.id);
    if (body) texts.push(body);
  } catch {}

  for (const t of texts) {
    for (const u of extractUrlsFromText(t)) {
      const cleaned = sanitizeUrl(u);
      if (cleaned) urls.add(cleaned);
    }
  }
  return Array.from(urls);
}
// ===== 並列キュー（同時実行数を制限） =====
async function withConcurrency(items, limit, worker, onProgress) {
  const results = new Array(items.length);
  let inFlight = 0, next = 0, done = 0;

  return await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < limit && next < items.length) {
        const idx = next++, it = items[idx];
        inFlight++;
        Promise.resolve(worker(it, idx))
          .then((r) => { results[idx] = r; })
          .catch((e) => { results[idx] = { error: e?.message || String(e) }; })
          .finally(() => {
            inFlight--; done++; if (onProgress) onProgress(done, items.length);
            if (done === items.length) resolve(results);
            else launch();
          });
      }
    };
    if (items.length === 0) resolve([]);
    else launch();
  });
}

// ===== 1 走査内だけの結果キャッシュ（重複URLを即時参照） =====
const scanCache = {
  vt:  new Map(),  // url -> { verdict, details }
  pt:  new Map(),
  gsb: new Map(),  // url -> "malicious" | "suspicious" | "harmless" | "unknown"
};

// 進捗を時々だけ表示（過剰通知を防ぐ）
function makeProgressReporter(prefix) {
  let last = 0;
  return async (done, total) => {
    const now = Date.now();
    if (done === total || now - last > 1200) {
      last = now;
      await setTitle(`${prefix}… ${done}/${total}`, undefined);
    }
  };
}

// === VT：同時4本で実行、失敗は unknown として集計 ===
async function runVT(urls, apiKey) {
  if (!apiKey) { await notify("VirusTotal API Key が未設定です。"); return { summary: { total: 0 } }; }
  if (typeof vtCheckUrl !== "function") throw new Error("vtCheckUrl is not defined");

  const uniq = Array.from(new Set(urls));
  const uncached = uniq.filter(u => !scanCache.vt.has(u));
  const prog = makeProgressReporter("VT スキャン");

  // 同時4本で処理
  const resList = await withConcurrency(
    uncached,
    4,
    async (u) => {
      try { const r = await vtCheckUrl(apiKey, u); scanCache.vt.set(u, r); return r; }
      catch (e) { scanCache.vt.set(u, { verdict: "unknown", details: { error: e?.message } }); return scanCache.vt.get(u); }
    },
    prog
  );

  // 集計（キャッシュ＋今回分）
  let summary = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0, total: 0 };
  for (const u of uniq) {
    const r = scanCache.vt.get(u);
    summary.total++;
    if (r?.verdict === "malicious") summary.malicious++;
    else if (r?.verdict === "suspicious") summary.suspicious++;
    else if (r?.verdict === "harmless") summary.harmless++;
    else summary.unknown++;
  }
  return { summary, details: Object.fromEntries(uniq.map(u => [u, scanCache.vt.get(u)])) };
}

// === GSB：API が “複数URLまとめ” を受ける想定なのでチャンク分割で高速化 ===
async function runGSB(urls, apiKey) {
  if (!apiKey) { await notify("Google Safe Browsing API Key が未設定です。"); return { summary: { total: 0 } }; }
  if (typeof gsbCheckBatch !== "function") throw new Error("gsbCheckBatch is not defined");

  const uniq = Array.from(new Set(urls));
  const uncached = uniq.filter(u => !scanCache.gsb.has(u));
  const CHUNK = 30;                           // まとめ送信のチャンクサイズ
  const prog = makeProgressReporter("GSB 照会");

  for (let i = 0; i < uncached.length; i += CHUNK) {
    const chunk = uncached.slice(i, i + CHUNK);
    try {
      const map = await gsbCheckBatch(chunk, apiKey);   // riskCheck.js（複数URL引数）
      for (const u of chunk) scanCache.gsb.set(u, map[u] || "unknown");
    } catch (e) {
      console.error("GSB chunk error:", e);
      for (const u of chunk) scanCache.gsb.set(u, "unknown");
    }
    await prog(Math.min(i + CHUNK, uncached.length), uncached.length);
  }

  let summary = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0, total: 0 };
  const details = {};
  for (const u of uniq) {
    const v = scanCache.gsb.get(u) || "unknown";
    details[u] = v;
    summary.total++;
    if (v === "malicious") summary.malicious++;
    else if (v === "suspicious") summary.suspicious++;
    else if (v === "harmless") summary.harmless++;
    else summary.unknown++;
  }
  return { summary, details };
}

// === PhishTank：同時6本で実行（無料APIは応答が遅いこと多い） ===
async function runPT(urls, appKey) {
  if (typeof phishTankCheck !== "function") throw new Error("phishTankCheck is not defined");

  const uniq = Array.from(new Set(urls));
  const uncached = uniq.filter(u => !scanCache.pt.has(u));
  const prog = makeProgressReporter("PT 照会");

  await withConcurrency(
    uncached,
    6,
    async (u) => {
      try { const v = await phishTankCheck(u, appKey || ""); scanCache.pt.set(u, v); }
      catch (e) { console.warn("PT err:", e); scanCache.pt.set(u, "unknown"); }
    },
    prog
  );

  let summary = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0, total: 0 };
  for (const u of uniq) {
    const v = scanCache.pt.get(u) || "unknown";
    summary.total++;
    if (v === "malicious") summary.malicious++;
    else if (v === "suspicious") summary.suspicious++;
    else if (v === "harmless") summary.harmless++;
    else summary.unknown++;
  }
  return { summary, details: Object.fromEntries(uniq.map(u => [u, scanCache.pt.get(u)])) };
}

// ---- 実行本体 ----
async function handleCheck(tab) {
  const tabId = tab?.id;
  await setTitle("Scanning…", tabId);

  try {
    await loadMode();
    const settings = await loadSettings();
    const { vtApiKey, gsbApiKey, ptAppKey, toAntiPhishing, toDekyo, attachEml } = settings;
    const urls = await extractUrlsFromMail(tab);

    if (!urls.length) {
      await notify("メール内にURLが見つかりませんでした。");
      return;
    }

    await notify(`チェック開始（${currentCheck}）：対象 ${urls.length} 件`);

    let out;
    if (currentCheck === "vt") {
      out = await runVT(urls, vtApiKey);
    } else if (currentCheck === "gsb") {
      out = await runGSB(urls, gsbApiKey);
    } else {
      out = await runPT(urls, ptAppKey);
    }

    const s = out.summary || { total: 0 };
    await notify(`チェック完了：危険 ${s.malicious||0} / 疑い ${s.suspicious||0} / 安全 ${s.harmless||0} / 不明 ${s.unknown||0}（計 ${s.total}）`);

    // ★ 下書き作成：try の中で、変数が生きているうちに呼ぶ
    await createReportDraftFromResult({
      urls,
      summary: out.summary,
      settings: { toAntiPhishing, toDekyo, attachEml },
      tab
    });

  } catch (e) {
    console.error(e);
    await notify("エラー: " + (e.message || e));
  } finally {
    // 例外の有無にかかわらず戻す
    await setTitle("Check & Report", tabId);
  }
}

// ---- UI ハンドラ ----
browser.messageDisplayAction.onClicked.addListener((tab) => {
  handleCheck(tab).catch(console.error);
});

// ツールメニュー（任意）
browser.menus.create({
  id: "jp-check-report",
  title: "このメールをチェック＆報告下書き",
  contexts: ["tools_menu", "message_display_action_menu", "message_list"],
});
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "jp-check-report") return;
  handleCheck(tab).catch(console.error);
});
// === report helpers ===

// 下書き本文（テキスト）を作る
function buildReportBody({ urls, summary }) {
  const s = summary || {};
  return [
    "以下のURLを含むメールを報告します。",
    "",
    "検出結果:",
    `  危険: ${s.malicious || 0}`,
    `  疑い: ${s.suspicious || 0}`,
    `  安全: ${s.harmless || 0}`,
    `  不明: ${s.unknown || 0}`,
    "",
    "URL一覧:",
    ...(urls && urls.length ? urls : ["(URL なし)"]),
    "",
    "※ 本メールは Thunderbird 拡張 JP Mail Check Extension で作成されました。"
  ].join("\n");
}

// ① beginNew戻り値 → 数値tabIdに正規化
function normalizeComposeTabId(ret) {
  if (typeof ret === "number") return ret;
  if (ret && typeof ret.id === "number") return ret.id;
  if (ret && typeof ret.tabId === "number") return ret.tabId;
  throw new Error("compose.beginNew returned unexpected value");
}

// ② .eml を File として作成
async function makeEmlFile(msgId) {
  const raw = await browser.messages.getRaw(msgId); // requires messagesRead
  return new File([raw], "original.eml", { type: "message/rfc822" });
}

// ③ 添付（File / {file: File} の順で試す）
async function addEmlAttachment(tabRet, msgId) {
  const tabId = normalizeComposeTabId(tabRet);
  const file  = await makeEmlFile(msgId);

  // 少し待つと安定するTBがある
  await new Promise(r => setTimeout(r, 50));

  // a) File をそのまま
  try {
    await browser.compose.addAttachment(tabId, file);
    return true;
  } catch (e1) {
    console.warn("addAttachment(File) failed:", e1);
  }

  // b) {file: File}
  try {
    await browser.compose.addAttachment(tabId, { file }); // ← 他プロパティは付けない
    return true;
  } catch (e2) {
    console.warn("addAttachment({file}) failed:", e2);
  }

  return false;
}

// ④ 下書き作成側（beginNew → addAttachment）
async function openReportDraft({ to1, to2, body, attachEml, msgId }) {
  const ret = await browser.compose.beginNew({
    to: [to1, to2].filter(Boolean),
    subject: "[報告] フィッシング/迷惑メールの可能性あり",
    body,
  });

  if (attachEml && msgId) {
    const ok = await addEmlAttachment(ret, msgId);
    if (!ok) {
      await notify("注意: .eml の添付に失敗しました（本文は作成済み）");
    }
  }
}

async function createReportDraftFromResult({ urls, summary, settings, tab }) {
  const { toAntiPhishing, toDekyo, attachEml } = settings || {};
  // 表示中メッセージ
  let msgId = null;
  try {
    const m = await browser.messageDisplay.getDisplayedMessage(tab?.id);
    msgId = m?.id ?? null;
  } catch {}

  const body = buildReportBody({ urls, summary });
  await openReportDraft({
    to1: toAntiPhishing || "info@antiphishing.jp",
    to2: toDekyo || "meiwaku@dekyo.or.jp",
    body,
    attachEml: attachEml !== false,   // 既定: 添付する
    msgId
  });

  return false;
}
