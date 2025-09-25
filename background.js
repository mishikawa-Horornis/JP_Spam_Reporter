// SPDX-License-Identifier: MIT
// =========================
// JP Mail Check – background
// =========================

// ---- モード・設定 ----
const DEFAULT_MODE = "vt";                              // "vt" | "gsb" | "pt"
const STORAGE_KEY  = "checkMode";
const VALID_MODES  = new Set(["vt", "gsb", "pt"]);
let currentCheck   = DEFAULT_MODE;
const scanningTabs = new Set();

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
  // 既定値
  const defaults = {
    vtApiKey: "", gsbApiKey: "", ptAppKey: "",
    toAntiPhishing: "info@antiphishing.jp",
    toDekyo: "meiwaku@dekyo.or.jp",
    attachEml: true,
    minSuspiciousToReport: 2,
    allowlistDomains: [
      "google.com", "youtu.be", "youtube.com",
      "github.com", "mozilla.org", "thunderbird.net",
      "dropbox.com", "box.com", "bit.ly", "t.co"
    ],
    // 旧キー（存在すれば拾う用）
    vtKey: "", gsbKey: "", ptKey: "",
  };

  // まず取得
  const st = await browser.storage.local.get(defaults);

  // マージ＋旧キーのフォールバック
  const merged = { ...defaults, ...st };
  if (!merged.vtApiKey  && merged.vtKey)  merged.vtApiKey  = merged.vtKey;
  if (!merged.gsbApiKey && merged.gsbKey) merged.gsbApiKey = merged.gsbKey;
  if (!merged.ptAppKey  && merged.ptKey)  merged.ptAppKey  = merged.ptKey;

  // ブール正規化
  merged.attachEml = merged.attachEml !== false;

  return merged;
}

function hostFrom(u){
  try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; }
}
function isAllowlisted(url, allowlist) {
  const h = hostFrom(url);
  return !!allowlist.find(d => h === d || h.endsWith("." + d));
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
    if (done === total || now - last > 700) {   // 更新しすぎ防止
      last = now;
      setActionSpinnerPrefix(`${prefix} ${done}/${total}`);
    }
  };
}

// verdict 正規化（既にあれば流用）
function normalizeVerdict(v) {
  const s = (typeof v === "string" ? v : v?.verdict || "").toLowerCase();
  if (!s) return "unknown";
  if (s === "listed" || s === "malware" || s === "phishing" || s === "malicious") return "malicious";
  if (s === "clean" || s === "harmless" || s === "safe") return "harmless";
  if (s === "suspicious" || s === "gray" || s === "grayware") return "suspicious";
  return "unknown";
}

async function runVT(urls, apiKey) {
  if (!apiKey) { await notify("VirusTotal API Key が未設定です。"); return { summary: { total: 0 }, details: {} }; }
  if (typeof vtCheckUrl !== "function") throw new Error("vtCheckUrl is not defined");

  const uniq = Array.from(new Set(urls));
  const todo = uniq.filter(u => !scanCache.vt.has(u));
  const onProg = makeProgressReporter("VT スキャン");

  await withConcurrency(
    todo,
    4,
    async (u) => {
      try {
        const r = await vtCheckUrl(apiKey, u);
        // 常に同じフォーマットで保存
        scanCache.vt.set(u, { verdict: normalizeVerdict(r), raw: r });
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        scanCache.vt.set(u, { verdict: "unknown", raw: { error: msg } });
      }
    },
    onProg
  );

  // 集計（detailsMap にまとめる：キー衝突回避のため details という変数名は使わない）
  const summary = { malicious:0, suspicious:0, harmless:0, unknown:0, total:0 };
  const detailsMap = {};

  for (const u of uniq) {
    const rec = scanCache.vt.get(u) || { verdict: "unknown" };
    const v   = normalizeVerdict(rec);
    detailsMap[u] = v;              // レポート用には verdict 文字列だけを持たせる
    summary.total++;
    if (v === "malicious") summary.malicious++;
    else if (v === "suspicious") summary.suspicious++;
    else if (v === "harmless") summary.harmless++;
    else summary.unknown++;
  }

  return { summary, details: detailsMap };
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

  const summary = { malicious:0, suspicious:0, harmless:0, unknown:0, total:0 };
  const detailsMap = {};
  for (const u of uniq) {
    const v0 = scanCache.gsb.get(u);           // "listed" / "clean" / undefined
    const v  = normalizeVerdict(v0);           // -> malicious/harmless/unknown
    detailsMap[u] = v;
    summary.total++;
    if (v === "malicious") summary.malicious++;
    else if (v === "suspicious") summary.suspicious++;
    else if (v === "harmless") summary.harmless++;
    else summary.unknown++;
  }
  return { summary, details: detailsMap };
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

  const summary = { malicious:0, suspicious:0, harmless:0, unknown:0, total:0 };
  const detailsMap = {};
  for (const u of uniq) {
    const v  = normalizeVerdict(scanCache.pt.get(u) || "unknown");
    detailsMap[u] = v;
    summary.total++;
    if (v === "malicious") summary.malicious++;
    else if (v === "suspicious") summary.suspicious++;
    else if (v === "harmless") summary.harmless++;
    else summary.unknown++;
  }
  return { summary, details: detailsMap };
}

// ---- 実行本体 ----
async function handleCheck(tab) {
  const tabId = tab?.id;
  if (tabId != null && scanningTabs.has(tabId)) {
    await notify("いまスキャン中です…");
    return;
  }
  // ここからスキャン開始としてマーク
  if (tabId != null) scanningTabs.add(tabId);
  try {
    // ボタンを「無効化」＆スピナー開始（dnf風）
    try { await browser.messageDisplayAction.disable({ tabId }); } catch {}
    await startActionSpinner(tabId, "Scanning");
    await loadMode();
    const settings = await loadSettings();
    console.log("[JP Mail Check] mode=", currentCheck,
      "VT=", settings.vtApiKey ? `set(${settings.vtApiKey.length})` : "unset",
      "GSB=", settings.gsbApiKey ? `set(${settings.gsbApiKey.length})` : "unset",
      "PT=", settings.ptAppKey ? `set(${settings.ptAppKey.length})` : "unset"
    );
    const urls = await extractUrlsFromMail(tab);

    if (!urls.length) {
      await notify("メール内にURLが見つかりませんでした。");
      return; // finally で復帰処理されます
    }

    await notify(`チェック開始（${currentCheck}）：対象 ${urls.length} 件`);

    const { vtApiKey, gsbApiKey, ptAppKey } = settings;   // ★ここで取り出す

    let out;
    if (currentCheck === "vt") {
      out = await runVT(urls, vtApiKey);
    } else if (currentCheck === "gsb") {
      out = await runGSB(urls, gsbApiKey);
    } else {
      out = await runPT(urls, ptAppKey);
    }
    const s = out.summary || { malicious:0, suspicious:0, harmless:0, unknown:0, total:0 };

    // s = out.summary, details = out.details がある前提
    let suspiciousOther = 0, suspiciousAllowed = 0;
    if (out.details) {
      for (const [u, v] of Object.entries(out.details)) {
        const verdict = typeof v === "string" ? v : (v?.verdict || "unknown");
        if (verdict === "suspicious") {
          if (isAllowlisted(u, settings.allowlistDomains)) suspiciousAllowed++;
          else suspiciousOther++;
        }
      }
    } else {
      // detailsを返さない実装の保険
      suspiciousOther = s.suspicious;
    }

    const needReport =
      (s.malicious > 0) ||
      (suspiciousOther >= (settings.minSuspiciousToReport ?? 2));

    if (needReport) {
      const body = buildReportBody({ urls, summary: s });
      await openReportDraft({
        to1: settings.toAntiPhishing,
        to2: settings.toDekyo,
        body,
        attachEml: settings.attachEml !== false,
        msgId: (await browser.messageDisplay.getDisplayedMessage(tab?.id))?.id || null
      });
      await notify(`危険:${s.malicious} / 疑い(許可外):${suspiciousOther} → 下書きを作成しました`);
    } else {
      await notify(`危険なし。疑い(許可外):${suspiciousOther} / 許可内:${suspiciousAllowed} / 安全:${s.harmless} / 不明:${s.unknown}`);
    }
  } catch (e) {
    console.error(e);
    await notify("エラー: " + (e.message || e));
  } finally {
    // スピナー停止・ボタン復帰・ガード解除（必ず実行）
    await stopActionSpinner("Check & Report");
    try { await browser.messageDisplayAction.enable({ tabId }); } catch {}
    if (tabId != null) scanningTabs.delete(tabId);
  }
}

// ---- UI ハンドラ ----
browser.messageDisplayAction.onClicked.addListener(async (tab) => {
  const tabId = tab?.id;
  if (tabId != null && scanningTabs.has(tabId)) {
    // 既にスキャン中なら無視（軽く通知）
    try { await notify("いまスキャン中です…"); } catch {}
    return;
  }
  await handleCheck(tab);
  
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
// ===== Action タイトル用スピナー =====
const _spin = {
  timer: null,
  tabId: null,
  frames: ["-", "\\", "|", "/"],
  i: 0,
  prefix: "Scanning"
};

async function _setActionTitle(title, tabId) {
  try { await browser.messageDisplayAction.setTitle({ title, tabId }); } catch {}
}

async function startActionSpinner(tabId, prefix = "Scanning") {
  await stopActionSpinner();              // 二重起動ガード
  _spin.tabId = tabId;
  _spin.prefix = prefix;
  _spin.i = 0;
  _spin.timer = setInterval(() => {
    const f = _spin.frames[_spin.i++ % _spin.frames.length];
    _setActionTitle(`${_spin.prefix} ${f}`, _spin.tabId);
  }, 120);
  // すぐ1フレーム表示
  _setActionTitle(`${_spin.prefix} ${_spin.frames[0]}`, _spin.tabId);
}

function setActionSpinnerPrefix(prefix) {
  if (_spin.timer) _spin.prefix = prefix;
}

async function stopActionSpinner(finalTitle = "Check & Report") {
  if (_spin.timer) clearInterval(_spin.timer);
  _spin.timer = null;
  if (_spin.tabId != null) await _setActionTitle(finalTitle, _spin.tabId);
  _spin.tabId = null;
}
function normalizeVerdict(v) {
  const s = (typeof v === "string" ? v : v?.verdict || "").toLowerCase();
  if (!s) return "unknown";
  if (s === "listed" || s === "malware" || s === "phishing" || s === "malicious") return "malicious";
  if (s === "clean" || s === "harmless" || s === "safe") return "harmless";
  if (s === "suspicious" || s === "gray" || s === "grayware") return "suspicious";
  return "unknown";
}