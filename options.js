// options.js
const DEFAULT_MODE = "vt"; // "vt" | "sb" | "pt"
const key = "checkMode";

function $(sel) { return document.querySelector(sel); }

async function load() {
  try {
    const obj = await browser.storage.local.get({ [key]: DEFAULT_MODE });
    const mode = obj[key] || DEFAULT_MODE;
    const el = document.querySelector(`input[name="checkMode"][value="${mode}"]`);
    if (el) el.checked = true;
  } catch (e) {
    console.error("load options failed:", e);
  }
}

async function save(mode) {
  await browser.storage.local.set({ [key]: mode });
}

document.addEventListener("DOMContentLoaded", () => {
  load();

  $("#form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const checked = document.querySelector('input[name="checkMode"]:checked');
    const mode = checked ? checked.value : DEFAULT_MODE;

    try {
      await save(mode);
      const s = $("#status");
      s.textContent = "保存しました。";
      s.className = "hint ok";
      setTimeout(() => { s.textContent = ""; s.className = "hint"; }, 1500);
    } catch (e) {
      const s = $("#status");
      s.textContent = "保存に失敗しました。";
      s.className = "hint err";
      console.error(e);
    }
  });

  $("#reset").addEventListener("click", async () => {
    try {
      await save(DEFAULT_MODE);
      await load();
      const s = $("#status");
      s.textContent = "デフォルト（VirusTotal）に戻しました。";
      s.className = "hint ok";
      setTimeout(() => { s.textContent = ""; s.className = "hint"; }, 1500);
    } catch (e) {
      const s = $("#status");
      s.textContent = "リセットに失敗しました。";
      s.className = "hint err";
      console.error(e);
    }
  });
});