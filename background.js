/// background.js（関数未定義に強い、安全版）

const DEFAULT_MODE = "vt";           // vt | gsb | pt
const STORAGE_KEY  = "checkMode";

let currentCheck = DEFAULT_MODE;

// 起動時にモードを読み込む
async function loadMode() {
  try {
    const obj = await browser.storage.local.get({ [STORAGE_KEY]: DEFAULT_MODE });
    const m = obj[STORAGE_KEY];
    currentCheck = (m === "vt" || m === "gsb" || m === "pt") ? m : DEFAULT_MODE;
    console.log("[JP Mail Check] mode:", currentCheck);
  } catch (e) {
    console.error(e);
    currentCheck = DEFAULT_MODE;
  }
}
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

// モード→関数のマップ（gsb に統一）
const checkMap = {
  vt:  runCheckVT,
  gsb: runCheckGSB,
  pt:  runCheckPT,
};

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
