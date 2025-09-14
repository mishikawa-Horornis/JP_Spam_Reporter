(async function () {
  const $ = (id) => document.getElementById(id);
  // Chrome/Firefox 両対応
  const storage = (typeof chrome !== "undefined" ? chrome.storage : browser.storage);

  // 1) 既存値の読込
  const saved = await storage.local.get([
    "vtApiKey", "gsbApiKey", "ptAppKey", "toAntiPhishing", "toDekyo", "attachEml"
  ]);

  // 2) UIへ反映（未設定はデフォルト）
  $("vtApiKey").value       = saved.vtApiKey ?? "";
  $("gsbApiKey").value      = saved.gsbApiKey ?? "";
  $("ptAppKey").value       = saved.ptAppKey ?? "";
  $("toAntiPhishing").value = saved.toAntiPhishing ?? "info@antiphishing.jp";
  $("toDekyo").value        = saved.toDekyo ?? "meiwaku@dekyo.or.jp"; // ←修正ポイント
  $("attachEml").checked    = saved.attachEml ?? true;

  // 3) 保存
  $("save").addEventListener("click", async () => {
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
  });
})();
