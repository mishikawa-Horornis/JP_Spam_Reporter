(async function(){
  const $ = (id) => document.getElementById(id);

  // ページロード時にストレージから値を取得してフォームに反映
  const saved = await browser.storage.local.get([
    "vtApiKey", "gsbApiKey", "ptAppKey", "toAntiPhishing", "toDekyo", "attachEml"
  ]);

  $("vtApiKey").value = saved.vtApiKey || "";
  $("gsbApiKey").value = saved.gsbApiKey || "";
  $("ptAppKey").value = saved.ptAppKey || "";
  $("toAntiPhishing").value = saved.toAntiPhishing || "info@antiphishing.jp";
  $("toDekyo").value = saved.toDekyo || "report@dekyo.or.jp";
  $("attachEml").checked = saved.attachEml ?? true;

  // 保存ボタン押下時に値を保存
  $("save").addEventListener("click", async () => {
    await browser.storage.local.set({
      vtApiKey: $("vtApiKey").value.trim(),
      gsbApiKey: $("gsbApiKey").value.trim(),
      ptAppKey: $("ptAppKey").value.trim(),
      toAntiPhishing: $("toAntiPhishing").value.trim(),
      toDekyo: $("toDekyo").value.trim(),
      attachEml: $("attachEml").checked,
    });
    $("status").textContent = "保存しました";
    setTimeout(()=> $("status").textContent = "", 1800);
  });
})();
