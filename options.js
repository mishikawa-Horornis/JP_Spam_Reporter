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

// options.js
const DEFAULTS = {
  checkMode: "vt",
  vtKey: "",
  sbKey: "",
  ptKey: "",
  toDekyo: "info@antiphishing.jp",
  toAntiPhishing: "meiwaku@dekyo.or.jp",
  attachEml: true,
};

async function load() {
  const obj = await browser.storage.local.get(DEFAULTS);

  // ラジオボタン
  document.querySelector(`input[name="checkMode"][value="${obj.checkMode}"]`).checked = true;

  // テキスト入力
  document.getElementById("vtKey").value = obj.vtKey;
  document.getElementById("gsbKey").value = obj.gsbKey;
  document.getElementById("ptKey").value = obj.ptKey;
  document.getElementById("toDekyo").value = obj.reportAddr1;
  document.getElementById("toAntiPhishing").value = obj.reportAddr2;

  // チェックボックス
  document.getElementById("attachEml").checked = obj.attachEml;
}

async function save() {
  const data = {
    checkMode: document.querySelector('input[name="checkMode"]:checked').value,
    vtKey: document.getElementById("vtKey").value,
    gsbKey: document.getElementById("gsbKey").value,
    ptKey: document.getElementById("ptKey").value,
    reportAddr1: document.getElementById("toDekyo").value,
    reportAddr2: document.getElementById("toAntiPhishing").value,
    attachEml: document.getElementById("attachEml").checked,
  };

  await browser.storage.local.set(data);
  console.log("[JP Mail Check] 保存しました", data);
}

document.addEventListener("DOMContentLoaded", () => {
  load();

  document.getElementById("save").addEventListener("click", async (e) => {
    e.preventDefault();
    await save();
    alert("保存しました");
  });

  document.getElementById("reset").addEventListener("click", async (e) => {
    e.preventDefault();
    await browser.storage.local.set(DEFAULTS);
    await load();
    alert("デフォルトに戻しました");
  });
});
