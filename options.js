// options.js 置き換え
(async function () {
  const $ = (id) => document.getElementById(id);

  // ✅ browser.storage を優先。chrome しか無い環境は Promise ラップ。
  const storage = (typeof browser !== "undefined" && browser.storage)
    ? browser.storage
    : {
        local: {
          get: (keys) => new Promise((resolve, reject) =>
            chrome.storage.local.get(keys, (res) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve(res);
            })
          ),
          set: (obj) => new Promise((resolve, reject) =>
            chrome.storage.local.set(obj, () => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve();
            })
          ),
        },
      };

  try {
    // 既存値の読込
    const saved = await storage.local.get([
      "vtApiKey", "gsbApiKey", "ptAppKey", "toAntiPhishing", "toDekyo", "attachEml"
    ]);

    // UIへ反映（未設定はデフォルト）
    $("vtApiKey").value       = saved.vtApiKey ?? "";
    $("gsbApiKey").value      = saved.gsbApiKey ?? "";
    $("ptAppKey").value       = saved.ptAppKey ?? "";
    $("toAntiPhishing").value = saved.toAntiPhishing ?? "info@antiphishing.jp";
    $("toDekyo").value        = saved.toDekyo ?? "meiwaku@dekyo.or.jp";
    $("attachEml").checked    = saved.attachEml ?? true;
  } catch (e) {
    console.error(e);
    $("#status").textContent = "読込エラー: " + e.message;
  }
  $("save").addEventListener("click", async () => {
    try {
      await storage.local.set({
        vtApiKey: $("vtApiKey").value.trim(),
        gsbApiKey: $("gsbApiKey").value.trim(),
        ptAppKey: $("ptAppKey").value.trim(),
        toAntiPhishing: $("toAntiPhishing").value.trim(),
        toDekyo: $("toDekyo").value.trim(),
        attachEml: $("attachEml").checked,
      });
      $("status").textContent = "保存しました";
      setTimeout(() => $("status").textContent = "", 1800);
    } catch (e) {
      console.error(e);
      $("status").textContent = "保存エラー: " + e.message;
    }
  });
})();
