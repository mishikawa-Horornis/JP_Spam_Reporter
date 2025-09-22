/// background.js（関数未定義に強い、安全版）

// background.js 内

// 1) モード名を gsb で統一
const DEFAULT_MODE = "vt";
const STORAGE_KEY  = "checkMode";
const VALID_MODES  = new Set(["vt", "gsb", "pt"]);
let currentCheck   = DEFAULT_MODE;

async function loadMode() {
  const obj = await browser.storage.local.get({ [STORAGE_KEY]: DEFAULT_MODE });
  currentCheck = VALID_MODES.has(obj[STORAGE_KEY]) ? obj[STORAGE_KEY] : DEFAULT_MODE;
}

// 2) どちらのキー名でも読めるようにする
async function loadKeys() {
  // 新旧キー名の両対応（存在する方を採用）
  const st = await browser.storage.local.get(null);
  const vtApiKey  = st.vtApiKey  ?? st.vtKey  ?? "";
  const gsbApiKey = st.gsbApiKey ?? st.gsbKey ?? "";
  const ptAppKey  = st.ptAppKey  ?? st.ptKey  ?? "";
  return { vtApiKey, gsbApiKey, ptAppKey };
}

// 3) マップも gsb に統一（未定義保護つきラッパ）
async function runVT(tab, set){ if (!set.vtApiKey) return;
  if (typeof vtCheckUrl !== "function") throw new Error("vtCheckUrl is not defined");
  return vtCheckUrl(set.vtApiKey, "https://example"); // ← 実際は展開済み URL を渡す
}
async function runGSB(tab, set){ if (!set.gsbApiKey) return;
  if (typeof gsbCheckBatch !== "function") throw new Error("gsbCheckBatch is not defined");
  return gsbCheckBatch(["https://example"], set.gsbApiKey);
}
async function runPT(tab, set){
  if (typeof phishTankCheck !== "function") throw new Error("phishTankCheck is not defined");
  return phishTankCheck("https://example", set.ptAppKey || "");
}
const checkMap = { vt: runVT, gsb: runGSB, pt: runPT };
browser.runtime.onStartup?.addListener(loadMode);
browser.runtime.onInstalled?.addListener(loadMode);
loadMode();

// 進捗・結果の表示ユーティリティ
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

// ストレージから必要な設定だけ読む
async function loadSettings() {
  const defaults = {
    vtApiKey: "",
    gsbApiKey: "",
    ptAppKey: "",
    toAntiPhishing: "info@antiphishing.jp",
    toDekyo: "meiwaku@dekyo.or.jp",
    attachEml: true,
  };
  return browser.storage.local.get(defaults);
}

// === 実チェック関数の “存在確認つき” ラッパ ===
// ここで “未定義ならエラーを出して止める” ようにする
async function runCheckVT(tab, settings) {
  if (!settings.vtApiKey) {
    await notify("VirusTotal API Key が設定されていません。オプションで設定してください。");
    return;
  }
  if (typeof runCheck_VirusTotal !== "function") {
    throw new Error("runCheck_VirusTotal is not defined");
  }
  return runCheck_VirusTotal(tab, settings);
}
async function runCheckGSB(tab, settings) {
  if (!settings.gsbApiKey) {
    await notify("Google Safe Browsing API Key が設定されていません。オプションで設定してください。");
    return;
  }
  if (typeof runCheck_SafeBrowsing !== "function") {
    throw new Error("runCheck_SafeBrowsing is not defined");
  }
  return runCheck_SafeBrowsing(tab, settings);
}
async function runCheckPT(tab, settings) {
  // PhishTankはキー任意ならチェックしない。任意であればこのまま
  if (typeof runCheck_PhishTank !== "function") {
    throw new Error("runCheck_PhishTank is not defined");
  }
  return runCheck_PhishTank(tab, settings);
}

// メイン実行
async function handleCheck(tab) {
  const tabId = tab?.id;
  try {
    await setTitle("Scanning…", tabId);
    const settings = await loadSettings();

    // モード読込（直前で変わっている可能性に備える）
    await loadMode();
    const fn = checkMap[currentCheck] || checkMap[DEFAULT_MODE];

    await notify(`チェック開始（${currentCheck}）`);
    const result = await fn(tab, settings);

    // ここで result を要約して通知
    await notify("チェック完了");
  } catch (e) {
    console.error(e);
    await notify("エラー: " + (e.message || e));
  } finally {
    await setTitle("Check & Report", tabId);
  }
}

// クリック/メニューから実行
browser.messageDisplayAction.onClicked.addListener((tab) => {
  handleCheck(tab).catch(console.error);
});

// Toolsメニューにも追加（任意）
browser.menus.create({
  id: "jp-check-report",
  title: "このメールをチェック＆報告下書き",
  contexts: ["tools_menu", "message_display_action_menu", "message_list"],
});
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "jp-check-report") return;
  handleCheck(tab).catch(console.error);
});
