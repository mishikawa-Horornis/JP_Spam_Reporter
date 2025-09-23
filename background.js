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

// ---- チェック実装（存在確認つきラッパ）----
async function runVT(urls, apiKey) {
  if (!apiKey) { await notify("VirusTotal API Key が未設定です。"); return { summary: { total: 0 } }; }
  if (typeof vtCheckUrl !== "function") throw new Error("vtCheckUrl is not defined");

  let res = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0, total: 0 };
  for (const u of urls) {
    try {
      const r = await vtCheckUrl(apiKey, u);  // urlCheck.js
      res.total++;
      if (r?.verdict === "malicious") res.malicious++;
      else if (r?.verdict === "suspicious") res.suspicious++;
      else if (r?.verdict === "harmless") res.harmless++;
      else res.unknown++;
    } catch (e) {
      console.error("VT error", u, e);
      res.total++;
      res.unknown++;
    }
  }
  return { summary: res };
}

async function runGSB(urls, apiKey) {
  if (!apiKey) { await notify("Google Safe Browsing API Key が未設定です。"); return { summary: { total: 0 } }; }
  if (typeof gsbCheckBatch !== "function") throw new Error("gsbCheckBatch is not defined");

  let map;
  try {
    map = await gsbCheckBatch(urls, apiKey); // エラー時はthrowされる実装に
  } catch (e) {
    console.error("GSB error", e);
    await notify("GSBエラー: " + (e.message || e));
    // ここで即returnして “全部unknown” にしない
    return { summary: { total: 0 } };
  }

  let res = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0, total: 0 };
  for (const u of urls) {
    const v = map[u] || "unknown";
    res.total++;
    if (v === "malicious") res.malicious++;
    else if (v === "suspicious") res.suspicious++;
    else if (v === "harmless") res.harmless++;
    else res.unknown++;
  }
  return { summary: res, details: map };
}

async function runPT(urls, appKey) {
  if (typeof phishTankCheck !== "function") throw new Error("phishTankCheck is not defined");

  let res = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0, total: 0 };
  for (const u of urls) {
    try {
      const v = await phishTankCheck(u, appKey || ""); // riskCheck.js
      res.total++;
      if (v === "malicious") res.malicious++;
      else if (v === "suspicious") res.suspicious++;
      else if (v === "harmless") res.harmless++;
      else res.unknown++;
    } catch (e) {
      console.error("PT error", u, e);
      res.total++;
      res.unknown++;
    }
  }
  return { summary: res };
}

// ---- 実行本体 ----
async function handleCheck(tab) {
  const tabId = tab?.id;
  await setTitle("Scanning…", tabId);

  try {
    await loadMode();
    const { vtApiKey, gsbApiKey, ptAppKey } = await loadSettings();

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
    await createReportDraftFromResult({ urls, summary: out.summary, settings: { vtApiKey, gsbApiKey, ptAppKey, toAntiPhishing, toDekyo, attachEml }, tab });

  } catch (e) {
    console.error(e);
    await notify("エラー: " + (e.message || e));
  } finally {
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

// 表示中メッセージの .eml を File 化（添付用）
async function makeEmlAttachment(msgId) {
  try {
    const raw = await browser.messages.getRaw(msgId);            // 要 permissions: messagesRead
    const blob = new Blob([raw], { type: "message/rfc822" });
    return new File([blob], "original.eml", { type: "message/rfc822" });
  } catch (e) {
    console.error("makeEmlAttachment failed", e);
    return null;
  }
}

// 下書きを開く（compose.beginNew）
async function openReportDraft({ to1, to2, body, attachEml, msgId }) {
  const attachments = [];
  if (attachEml && msgId) {
    const f = await makeEmlAttachment(msgId);
    if (f) attachments.push(f);
  }
  await browser.compose.beginNew({                          // 要 permissions: compose
    to: [to1, to2].filter(Boolean),
    subject: "[報告] フィッシング/迷惑メールの可能性あり",
    body,
    attachments
  });
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
}
