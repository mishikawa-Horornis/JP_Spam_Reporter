// --- options.js（簡潔版）---
const DEFAULTS = {
  checkMode: "vt",
  vtApiKey: "", gsbApiKey: "", ptAppKey: "",
  toAntiPhishing: "info@antiphishing.jp",
  toDekyo: "meiwaku@dekyo.or.jp",
  attachEml: true,
  minSuspiciousToReport: 2,
  allowlistDomains: [],
};

function parseAllowlist(text) {
  return (text || "")
    .split(/\r?\n/)
    .map(line => line.replace(/\s+#.*$/, '').replace(/\s+\/\/.*$/, '').trim())
    .filter(Boolean);
}

async function loadOptions() {
  const st = await browser.storage.local.get(DEFAULTS);
  // mode
  const r = document.querySelector(`input[name="checkMode"][value="${st.checkMode}"]`);
  if (r) r.checked = true;
  // keys
  document.getElementById("vtApiKey").value = st.vtApiKey;
  document.getElementById("gsbApiKey").value = st.gsbApiKey;
  document.getElementById("ptAppKey").value = st.ptAppKey;
  // recipients
  document.getElementById("toAntiPhishing").value = st.toAntiPhishing;
  document.getElementById("toDekyo").value = st.toDekyo;
  // attach
  document.getElementById("attachEml").checked = !!st.attachEml;
  // allowlist & threshold
  document.getElementById("allowlistDomains").value = (st.allowlistDomains || []).join("\n");
  document.getElementById("minSuspiciousToReport").value = st.minSuspiciousToReport ?? 2;
}

function showStatus(text, type = "ok") {
  const el = document.getElementById("saveStatus");
  el.textContent = text;
  el.style.display = "block";
  el.style.borderColor = type === "error" ? "#e35d5d" : "#58a55c";
  el.style.background = type === "error" ? "rgba(227,93,93,.10)" : "rgba(88,165,92,.10)";
  el.style.color = type === "error" ? "#e35d5d" : "inherit";
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => { el.style.display = "none"; }, 1800);
}

async function saveOptions() {
  const data = {
    checkMode: document.querySelector('input[name="checkMode"]:checked')?.value || "vt",
    vtApiKey:  document.getElementById("vtApiKey").value.trim(),
    gsbApiKey: document.getElementById("gsbApiKey").value.trim(),
    ptAppKey:  document.getElementById("ptAppKey").value.trim(),
    toAntiPhishing: document.getElementById("toAntiPhishing").value.trim(),
    toDekyo:        document.getElementById("toDekyo").value.trim(),
    attachEml:      !!document.getElementById("attachEml").checked,
    allowlistDomains: parseAllowlist(document.getElementById("allowlistDomains").value),
    minSuspiciousToReport: Math.max(1, parseInt(document.getElementById("minSuspiciousToReport").value || "2", 10)),
  };
  await browser.storage.local.set(data);
  showStatus("保存しました ✅", "ok");
}

document.addEventListener("DOMContentLoaded", () => {
  loadOptions().catch(console.error);
  document.getElementById("save").addEventListener("click", (e) => { e.preventDefault(); saveOptions().catch(console.error); });
  document.getElementById("reset").addEventListener("click", async (e) => {
    e.preventDefault();
    await browser.storage.local.set(DEFAULTS);
    await loadOptions();
    showStatus("デフォルトに戻しました", "ok");
  });
});
