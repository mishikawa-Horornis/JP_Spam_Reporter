// background.js（最小安定版）

// ====== 設定切替（必要なら） ======
const DEFAULT_MODE = "vt"; // vt | gsb | pt
const STORAGE_KEY = "checkMode";
let currentCheck = DEFAULT_MODE;

async function loadMode() {
  try {
    const obj = await browser.storage.local.get({ [STORAGE_KEY]: DEFAULT_MODE });
    const m = obj[STORAGE_KEY];
    currentCheck = (m === "vt" || m === "gsb" || m === "pt") ? m : DEFAULT_MODE;
    console.log("[JP Spam Reporter] mode:", currentCheck);
  } catch (e) {
    console.error("loadMode failed:", e);
    currentCheck = DEFAULT_MODE;
  }
}
browser.runtime.onStartup?.addListener(loadMode);
browser.runtime.onInstalled?.addListener(loadMode);
loadMode();

// ====== チェック関数（あなたの関数を呼ぶ） ======
async function runVT(tab)  { return runCheck_VirusTotal?.(tab); }
async function runGSB(tab) { return runCheck_SafeBrowsing?.(tab); }
async function runPT(tab)  { return runCheck_PhishTank?.(tab); }

const checkMap = { vt: runVT, gsb: runGSB, pt: runPT };

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

