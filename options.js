// SPDX-License-Identifier: MIT
(async function(){
  const $ = (id) => document.getElementById(id);
  // options.js 保存時に追加
  await browser.storage.local.set({
    vtApiKey: $("#vtApiKey").value.trim(),
    gsbApiKey: $("#gsbApiKey").value.trim(),
    ptAppKey:  $("#ptAppKey").value.trim(),
    toAntiPhishing: $("#toAntiPhishing").value.trim(),
    toDekyo: $("#toDekyo").value.trim(),
    attachEml: $("#attachEml").checked
  });
  $("vtApiKey").value = vtApiKey;
  $("gsbApiKey").value = gsbApiKey;
  $("ptAppKey").value = ptAppKey;
  $("toAntiPhishing").value = toAntiPhishing;
  $("toDekyo").value = toDekyo;
  $("attachEml").checked = attachEml;

  
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
