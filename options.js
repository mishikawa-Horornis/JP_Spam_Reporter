(async function () {
  const $ = (id) => document.getElementById(id);

  // ✅ storage を Promise ベースで統一
  const storage = (typeof browser !== "undefined" && browser.storage)
    ? browser.storage
    : {
        local: {
          get: (keys) => new Promise((resolve, reject) => {
            try { chrome.storage.local.get(keys, (v) => resolve(v)); }
            catch (e) { reject(e); }
          }),
          set: (obj) => new Promise((resolve, reject) => {
            try { chrome.storage.local.set(obj, () => resolve()); }
            catch (e) { reject(e); }
          }),
        },
      };

  // 既存値の読込（未設定は初期値）
  let saved = {};
  try {
    saved = await storage.local.get([
      "vtApiKey", "gsbApiKey", "ptAppKey", "toAntiPhishing", "toDekyo", "attachEml"
    ]);
  } catch (e) {
    console.error("storage.get error:", e);
    $("#status").textContent = "設定の読み込みに失敗しました";
  }

  // フォームへ反映
  $("#vtApiKey").value       = saved.vtApiKey ?? "";
  $("#gsbApiKey").value      = saved.gsbApiKey ?? "";
  $("#ptAppKey").value       = saved.ptAppKey ?? "";
  $("#toAntiPhishing").value = saved.toAntiPhishing ?? "info@antiphishing.jp";
  $("#toDekyo").value        = saved.toDekyo ?? "meiwaku@dekyo.or.jp";
  $("#attachEml").checked    = saved.attachEml ?? true;

  // 保存
  $("#save").addEventListener("click", async () => {
    try {
      await storage.local.set({
        vtApiKey: $("#vtApiKey").value.trim(),
        gsbApiKey: $("#gsbApiKey").value.trim(),
        ptAppKey: $("#ptAppKey").value.trim(),
        toAntiPhishing: $("#toAntiPhishing").value.trim(),
        toDekyo: $("#toDekyo").value.trim(),
        attachEml: $("#attachEml").checked,
      });
      $("#status").textContent = "保存しました";
    } catch (e) {
      console.error("storage.set error:", e);
      $("#status").textContent = "保存に失敗しました";
    } finally {
      setTimeout(() => $("#status").textContent = "", 2000);
    }
  });
})();
