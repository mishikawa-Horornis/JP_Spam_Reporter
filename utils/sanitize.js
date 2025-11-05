// utils/sanitize.js
(function() {
  globalThis.sanitizeUrl = function(url) {
    let clean = url.trim();
    clean = clean.replace(/[\r\n\t]+/g, '');
    clean = clean.replace(/^<|>$/g, '');
    return clean;
  };
  
  console.log("[Sanitize] Module loaded");
})();
