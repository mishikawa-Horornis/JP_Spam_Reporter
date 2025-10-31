// utils/auth.js
// SPDX-License-Identifier: MIT
(function() {
  globalThis.saveSetting = async function(key, value) {
    const obj = {};
    obj[key] = value;
    await browser.storage.local.set(obj);
    console.log("[Auth] Saved", key);
  };

  globalThis.getSetting = async function(key) {
    const result = await browser.storage.local.get(key);
    return result[key] || null;
  };
  
  console.log("[Auth] Module loaded");
})();
