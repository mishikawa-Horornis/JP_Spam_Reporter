// SPDX-License-Identifier: MIT
(async function(){
  const $ = (id) => document.getElementById(id);
  const { vtApiKey, toAntiPhishing, toDekyo, attachEml } = await browser.storage.local.get({
    vtApiKey: "",
    toAntiPhishing: "info@antiphishing.jp",
    toDekyo: "report@dekyo.or.jp",
    attachEml: true,
  });
  $("vtApiKey").value = vtApiKey;
  $("toAntiPhishing").value = toAntiPhishing;
  $("toDekyo").value = toDekyo;
  $("attachEml").checked = attachEml;

  $("save").addEventListener("click", async () => {
    await browser.storage.local.set({
      vtApiKey: $("vtApiKey").value.trim(),
      toAntiPhishing: $("toAntiPhishing").value.trim(),
      toDekyo: $("toDekyo").value.trim(),
      attachEml: $("attachEml").checked,
    });
    $("status").textContent = "保存しました";
    setTimeout(()=> $("status").textContent = "", 1800);
  });
})();
