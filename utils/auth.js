// utils/auth.js  (MV2向け・即時関数でグローバル公開)
(function () {
  const DEFAULTS = {
    mode: "gsb",                  // "gsb" | "pt" | "vt"
    vtApiKey: "",                 // VT v3 API key
    gsbApiKey: "",                // Google Safe Browsing API key
    ptAppKey: "",                 // PhishTank App Key（任意）
    minSuspiciousToReport: 1,     // レポート閾値（使っているなら）
    whitelist: ""                 // 改行区切りの許可ドメイン文字列
  };

  // 1件
  globalThis.getSetting = async function getSetting(key) {
    try {
      const obj = await browser.storage.local.get(key);
      return (key in obj) ? obj[key] : DEFAULTS[key];
    } catch (e) {
      console.warn("getSetting error:", e);
      return DEFAULTS[key];
    }
  };

  globalThis.setSetting = async function setSetting(key, value) {
    try {
      await browser.storage.local.set({ [key]: value });
      return true;
    } catch (e) {
      console.warn("setSetting error:", e);
      return false;
    }
  };

  // 複数
  globalThis.getSettings = async function getSettings(keys) {
    try {
      const obj = await browser.storage.local.get(keys);
      // デフォルトで埋める
      if (Array.isArray(keys)) {
        for (const k of keys) if (!(k in obj)) obj[k] = DEFAULTS[k];
      } else {
        for (const k of Object.keys(DEFAULTS)) if (!(k in obj)) obj[k] = DEFAULTS[k];
      }
      return obj;
    } catch (e) {
      console.warn("getSettings error:", e);
      // 要求キーだけデフォルト返す
      const out = {};
      const src = Array.isArray(keys) ? keys : Object.keys(DEFAULTS);
      for (const k of src) out[k] = DEFAULTS[k];
      return out;
    }
  };

  globalThis.setSettings = async function setSettings(obj) {
    try {
      await browser.storage.local.set(obj);
      return true;
    } catch (e) {
      console.warn("setSettings error:", e);
      return false;
    }
  };

  // よく使うショートカット
  globalThis.getMode = () => getSetting("mode");
  globalThis.setMode = (m) => setSetting("mode", m);

  // 初期化（初回だけデフォルト補完）
  globalThis.ensureDefaultSettings = async function ensureDefaultSettings() {
    try {
      const existing = await browser.storage.local.get(null);
      const patch = {};
      for (const [k, v] of Object.entries(DEFAULTS)) {
        if (!(k in existing)) patch[k] = v;
      }
      if (Object.keys(patch).length) await browser.storage.local.set(patch);
    } catch (e) {
      console.warn("ensureDefaultSettings error:", e);
    }
  };
})();
