// background/api.js
(function(){
  browser.runtime.onMessage.addListener(async (msg) => {
    try {
      switch (msg?.type) {
        case "extract-urls":
          return await globalThis.extractUrlsFromMessage(msg.messageId);
        case "check-gsb":
          return await globalThis.checkWithGSB(msg.url, msg.apiKey);
        case "check-pt":
          return await globalThis.checkWithPT(msg.url, msg.appKey);
        case "check-vt":
          return await globalThis.checkWithVT(msg.url, msg.apiKey);
        default:
          return { verdict: "unknown", error: "unknown message" };
      }
    } catch (e) {
      console.error("api error:", e);
      return { verdict: "unknown", error: String(e) };
    }
  });
})();
