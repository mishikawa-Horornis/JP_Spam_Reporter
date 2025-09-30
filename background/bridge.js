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
})();
