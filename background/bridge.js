// background/bridge.js
// 既存の呼び出し名に互換を持たせる（UI/古いコードからの移行用）
(function(){
  if (typeof globalThis.phishTankCheck !== "function") {
    globalThis.phishTankCheck = (url, appKey) =>
      browser.runtime.sendMessage({ type:"check-pt", url, appKey });
  }
  if (typeof globalThis.gsbLookupMinimal !== "function") {
    globalThis.gsbLookupMinimal = (urls, apiKey) =>
      Promise.all((Array.isArray(urls)?urls:[urls]).map(u => browser.runtime.sendMessage({ type:"check-gsb", url:u, apiKey })))
        .then(list => list.filter(x => x?.verdict==="listed"));
  }
  if (typeof globalThis.vtLookup !== "function") {
    globalThis.vtLookup = (url, apiKey) =>
      browser.runtime.sendMessage({ type:"check-vt", url, apiKey });
  }
  
  // message_display_actionのクリックハンドラー
  if (browser.messageDisplayAction && browser.messageDisplayAction.onClicked) {
    browser.messageDisplayAction.onClicked.addListener(async (tab) => {
      try {
        console.log("[Bridge] Message display action clicked");
        // ui/report.html を開く
        const url = browser.runtime.getURL("ui/report.html");
        await browser.windows.create({
          url: url,
          type: "popup",
          width: 600,
          height: 400
        });
      } catch (e) {
        console.error("[Bridge] Error opening report UI:", e);
        // フォールバック: 通知を表示
        if (globalThis.notify) {
          globalThis.notify("JP Spam Reporter", "UIを開けませんでした。オプションページから設定を確認してください。");
        }
      }
    });
  }
})();
