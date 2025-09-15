// options.js 置き換え（DOMContentLoaded 後に実行）
window.addEventListener("DOMContentLoaded", () => void initOptions());

async function initOptions() {
  const $ = (id) => document.getElementById(id);

  // Promise 統一（Thunderbird で chrome.storage がコールバック式でもOK）
  const storage = (typeof browser !== "undefined" && browser.storage)
    ? browser.storage
    : {
        local: {
          get: (keys) => new Promise((resolve, reject) => {
            try { chrome.storage.local.get(keys, (v) => resolve(v || {})); }
            catch (e) { reject(e); }
          }),
          set: (obj) => new Promise((resolve, reject) => {
            try { chrome.storage.local.set(obj, () => resolve()); }
            catch (e) { reject(e); }
          }),
        },
      };

  // 読み込み（未設定は既定値）
  let saved = {};
  try {
    saved = await storage.local.get([
      "vtApiKey","gsbApiKey","ptAppKey","toAntiPhishing","toDekyo","attachEml"
    ]);
  } catch (e) {
    console.error("[options] storage.get error:", e);
    $("#status").textContent = "設定の読み込みに失敗しました";
  }

  $("#vtApiKey").value       = saved.vtApiKey ?? "";
  $("#gsbApiKey").value      = saved.gsbApiKey ?? "";
  $("#ptAppKey").value       = saved.ptAppKey ?? ""; // ←空でもOK
  $("#toAntiPhishing").value = saved.toAntiPhishing ?? "info@antiphishing.jp";
  $("#toDekyo").value        = saved.toDekyo ?? "meiwaku@dekyo.or.jp";
  $("#attachEml").checked    = saved.attachEml ?? true;

  // 保存
  $("#save").addEventListener("click", async () => {
    const payload = {
      vtApiKey: $("#vtApiKey").value.trim(),
      gsbApiKey: $("#gsbApiKey").value.trim(),
      ptAppKey:  $("#ptAppKey").value.trim(),               // 空文字可
      toAntiPhishing: $("#toAntiPhishing").value.trim(),
      toDekyo: $("#toDekyo").value.trim(),
      attachEml: $("#attachEml").checked,
    };
    try {
      await storage.local.set(payload);
      $("#status").textContent = "保存しました";
      console.log("[options] saved:", payload);
    } catch (e) {
      console.error("[options] storage.set error:", e);
      $("#status").textContent = "保存に失敗しました";
    } finally {
      setTimeout(() => $("#status").textContent = "", 2000);
    }
  });
}
