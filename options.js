// options.js
const DEFAULTS = {
  checkMode: "vt",
  vtApiKey: "",
  gsbApiKey: "",
  ptAppKey: "",
  vtApiKey: "", gsbApiKey: "", ptAppKey: "",
  toAntiPhishing: "info@antiphishing.jp",
  toDekyo: "meiwaku@dekyo.or.jp",
  minSuspiciousToReport: 2,
  allowlistDomains: [],
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
function hostFrom(u){ try { return new URL(u).host.replace(/^www\./,''); } catch { return "";} }

// 許可ルール：
//  - "example.com" / ".example.com" / "*.example.com" → 末尾一致（サブドメイン含む）
//  - "https://safe.example.com/path" → そのURLでプレフィックス一致（始まりが同じなら許可）
//  - "/正規表現/" 形式は正規表現マッチ（任意）
function isAllowlisted(url, rules) {
  const h = hostFrom(url);
  for (const raw of rules || []) {
    const s = String(raw).trim();
    if (!s) continue;

    // 正規表現 /.../
    if (s.startsWith("/") && s.endsWith("/") && s.length > 2) {
      try { if (new RegExp(s.slice(1, -1)).test(url)) return true; } catch {}
      continue;
    }

    // 完全 URL → プレフィックス一致
    if (/^https?:\/\//i.test(s)) {
      if (url.startsWith(s)) return true;
      continue;
    }

    // ドメイン指定
    const d = s.replace(/^\*\.\s*/,"").replace(/^\./,"").toLowerCase();
    if (!d) continue;
    const hd = h.toLowerCase();
    if (hd === d || hd.endsWith("." + d)) return true;
  }
  return false;
}

function parseAllowlist(text) {
  return text
    .split(/\r?\n/)                    // 行ごとに分割
    .map(line => {
      // 行末の # または // コメントを削除
      let s = line.replace(/\s+#.*$/, '').replace(/\s+\/\/.*$/, '');
      return s.trim();
    })
    .filter(s => s.length > 0);        // 空行は除外
}

async function loadOptions() {
  const st = await browser.storage.local.get({
    allowlistDomains: [],
    minSuspiciousToReport: 2,
  });
  document.getElementById("allowlistDomains").value = (st.allowlistDomains || []).join("\n");
  document.getElementById("minSuspiciousToReport").value = st.minSuspiciousToReport ?? 2;
}

async function saveOptions() {
  const allow = parseAllowlist(document.getElementById("allowlistDomains").value);
  const minS = Math.max(1, parseInt(document.getElementById("minSuspiciousToReport").value || "2", 10));
  await browser.storage.local.set({
    allowlistDomains: allow,
    minSuspiciousToReport: minS,
  });
  alert("保存しました");
}

document.getElementById("saveBtn").addEventListener("click", saveOptions);
document.addEventListener("DOMContentLoaded", loadOptions);

// 既存の load/save 処理に足すユーティリティ
function showStatus(text, type = "info") {
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
  const saveBtn = document.getElementById("save");
  try {
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中…";

    const allow = parseAllowlist(document.getElementById("allowlistDomains")?.value || "");
    const minS  = document.getElementById("minSuspiciousToReport") ? 
                  Math.max(1, parseInt(document.getElementById("minSuspiciousToReport").value || "2", 10)) : 2;

    const data = {
      checkMode: document.querySelector('input[name="checkMode"]:checked')?.value || "vt",
      vtApiKey:  document.getElementById("vtApiKey")?.value || "",
      gsbApiKey: document.getElementById("gsbApiKey")?.value || "",
      ptAppKey:  document.getElementById("ptAppKey")?.value || "",
      toAntiPhishing: document.getElementById("toAntiPhishing")?.value || "info@antiphishing.jp",
      toDekyo:        document.getElementById("toDekyo")?.value || "meiwaku@dekyo.or.jp",
      attachEml:      !!document.getElementById("attachEml")?.checked,
      allowlistDomains: allow,
      minSuspiciousToReport: minS,
    };

    await browser.storage.local.set(data);
    showStatus("保存しました ✅", "ok");
  } catch (e) {
    console.error(e);
    showStatus("保存に失敗しました…", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "保存";
  }
}

function parseAllowlist(text) {
  return (text || "")
    .split(/\r?\n/)
    .map(line => line.replace(/\s+#.*$/, '').replace(/\s+\/\/.*$/, '').trim())
    .filter(Boolean);
}

// 起動時の読み込み（既存の load() に統合してOK）
document.addEventListener("DOMContentLoaded", () => {
  // 既存の load() を呼んだ後でイベントを設定
  document.getElementById("save")?.addEventListener("click", (e) => {
    e.preventDefault();
    saveOptions();
  });
  document.getElementById("reset")?.addEventListener("click", async (e) => {
    e.preventDefault();
    // 既定値に戻すあなたの処理…
    showStatus("デフォルトに戻しました", "ok");
  });
});
