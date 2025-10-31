// utils/url.js
// SPDX-License-Identifier: MIT
(function() {
  globalThis.normalizeUrl = function(u) {
    try {
      const parsed = new URL(u);
      return parsed.href;
    } catch {
      return u;
    }
  };
  
  globalThis.extractDomain = function(u) {
    try {
      const parsed = new URL(u);
      return parsed.hostname.toLowerCase();
    } catch {
      return u;
    }
  };
  
  console.log("[URL] Module loaded");
})();
