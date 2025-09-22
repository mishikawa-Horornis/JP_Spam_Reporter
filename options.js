// options.js
const DEFAULTS = {
  checkMode: "vt",
  vtApiKey: "",
  gsbApiKey: "",
  ptAppKey: "",
  toAntiPhishing: "info@antiphishing.jp",
  toDekyo: "meiwaku@dekyo.or.jp",
  attachEml: true,
};

async function load() {
  const obj = await browser.storage.local.get(DEFAULTS);

  // チェック方式
  const r = document.querySelector(`input[name="checkMode"][value="${obj.checkMode}"]`);
  if (r) r.checked = true;

  // APIキー
  document.getElementById("vtApiKey").value = obj.vtApiKey;
  document.getElementById("gsbApiKey").value = obj.gsbApiKey;
  document.getElementById("ptAppKey").value = obj.ptAppKey;

  // 報告先
  document.getElementById("toAntiPhishing").value = obj.toAntiPhishing;
  document.getElementById("toDekyo").value = obj.toDekyo;

  // 添付
  document.getElementById("attachEml").checked = obj.attachEml;
}

async function save() {
  const data = {
    checkMode: document.querySelector('input[name="checkMode"]:checked').value,
    vtApiKey: document.getElementById("vtApiKey").value,
    gsbApiKey: document.getElementById("gsbApiKey").value,
    ptAppKey: document.getElementById("ptAppKey").value,
    toAntiPhishing: document.getElementById("toAntiPhishing").value,
    toDekyo: document.getElementById("toDekyo").value,
    attachEml: document.getElementById("attachEml").checked,
  };
  await browser.storage.local.set(data);
  const s = document.getElementById("status");
  s.textContent = "保存しました。";
  setTimeout(() => (s.textContent = ""), 1500);
}

document.addEventListener("DOMContentLoaded", () => {
  load();

  document.getElementById("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await save();
  });

  document.getElementById("reset").addEventListener("click", async () => {
    await browser.storage.local.set(DEFAULTS);
    await load();
    const s = document.getElementById("status");
    s.textContent = "デフォルトに戻しました。";
    setTimeout(() => (s.textContent = ""), 1500);
  });
});
