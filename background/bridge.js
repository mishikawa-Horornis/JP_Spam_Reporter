// background/bridge.js
// SPDX-License-Identifier: MIT
(function() {
  // Content scriptを動的に登録
  if (browser.messageDisplayScripts) {
    browser.messageDisplayScripts.register({
      js: [{ file: "content/message-display.js" }]
    }).then(() => {
      console.log("[Bridge] Message display script registered successfully");
    }).catch((error) => {
      console.error("[Bridge] Failed to register message display script:", error);
    });
  }
  
  // ツールバーボタンがクリックされたときにポップアップを開く
  browser.messageDisplayAction.onClicked.addListener((tab) => {
    console.log("[Bridge] Message display action clicked");
    browser.messageDisplayAction.openPopup();
  });
  
  console.log("[Bridge] Module loaded");
})();
