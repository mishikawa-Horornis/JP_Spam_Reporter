// background.js（最小安定版）

// ====== 設定切替（必要なら） ======

const DEFAULT_MODE = "vt";
const STORAGE_KEY  = "checkMode";

// ✅ 有効モードを gsb 含めて定義
const VALID_MODES = new Set(["vt", "gsb", "pt"]);
let currentCheck = DEFAULT_MODE;

// 読み込み時のバリデーションも gsb に対応
async function loadMode() {
  try {
    const obj  = await browser.storage.local.get({ [STORAGE_KEY]: DEFAULT_MODE });
    const mode = obj[STORAGE_KEY];
    currentCheck = VALID_MODES.has(mode) ? mode : DEFAULT_MODE;
    console.log("[JP Spam Reporter] check mode:", currentCheck);
  } catch (e) {
    console.error("loadMode failed:", e);
    currentCheck = DEFAULT_MODE;
  }
}

// ✅ マッピングキーを gsb に
async function runVirusTotal(tab){ return runCheck_VirusTotal?.(tab); }
async function runSafeBrowsing(tab){ return runCheck_SafeBrowsing?.(tab); }
async function runPhishTank(tab){ return runCheck_PhishTank?.(tab); }

const checkMap = {
  vt:  runVirusTotal,
  gsb: runSafeBrowsing,
  pt:  runPhishTank,
};

// ✅ メニューの表示名/ID も gsb に
const MENU_ROOT = "jp-mode-root";
const MENU_MODES = {
  vt:  "VirusTotal",
  gsb: "Safe Browsing",
  pt:  "PhishTank",
};
// ====== チェック関数（あなたの関数を呼ぶ） ======
async function runVT(tab)  { return runCheck_VirusTotal?.(tab); }
async function runGSB(tab) { return runCheck_SafeBrowsing?.(tab); }
async function runPT(tab)  { return runCheck_PhishTank?.(tab); }

// ====== 疑似ステータス表示ユーティリティ ======
function notify(text) {
  return browser.notifications.create({ type: "basic", title: "JP Spam Reporter", message: text });
}
async function setTitle(title, tabId) {
  try { await browser.messageDisplayAction.setTitle({ title, tabId }); } catch {}
}

// ====== 本体 ======
async function handleCheckAndMaybeReport(tab) {
  try {
    await setTitle("Scanning…", tab?.id);
    await notify("チェックを開始します");

    const fn = checkMap[currentCheck] || checkMap[DEFAULT_MODE];
    const result = await fn(tab); // ← あなたの既存処理

    // ここで result を見て要約を出す
    await notify("チェック完了：危険なし（例）");
  } catch (e) {
    console.error(e);
    await notify("エラー: " + (e.message || e));
  } finally {
    await setTitle("Check & Report", tab?.id);
  }
}

// ====== クリック/メニュー ======
browser.messageDisplayAction.onClicked.addListener((tab) => {
  handleCheckAndMaybeReport(tab).catch(console.error);
});


browser.menus.create({
  id: "jp-spam-check",
  title: "このメールをチェック＆報告下書き",
  contexts: ["message_display_action_menu", "message_list", "tools_menu"],
});

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "jp-spam-check") return;
  (async () => {
    if (info.selectedMessages?.messages?.length) {
      for (const m of info.selectedMessages.messages) {
        await handleCheckAndMaybeReport({ id: tab?.id, _messageId: m.id });
      }
    } else {
      await handleCheckAndMaybeReport(tab);
    }
  })().catch(console.error);
});

