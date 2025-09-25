// options.js
// --- 安全な取得ユーティリティ
function $id(id) {
  const el = document.getElementById(id);
  if (!el) console.warn("[options] missing element id:", id);
  return el;
}
function $v(id) { return ($id(id)?.value ?? "").trim(); }
function $checked(id) { return !!$id(id)?.checked; }

// 既定値（必要に応じて調整）
const DEFAULTS = {
  checkMode: "vt",
  vtApiKey: "", gsbApiKey: "", ptAppKey: "",
  toAntiPhishing: "info@antiphishing.jp",
  toDekyo: "meiwaku@dekyo.or.jp",
  attachEml: true,
  minSuspiciousToReport: 2,
  allowlistDomains: [],
};

// 行末コメントを許可
function parseAllowlist(text) {
  return (text || "")
    .split(/\r?\n/)
    .map(line => line.replace(/\s+#.*$/, "").replace(/\s+\/\/.*$/, "").trim())
    .filter(Boolean);
}

async function loadOptions() {
  const st = await browser.storage.local.get(DEFAULTS);

  // チェック方式（name="checkMode" のラジオ）
  const r = document.querySelector(`input[name="checkMode"][value="${st.checkMode}"]`);
  if (r) r.checked = true; else console.warn("[options] no radio for checkMode:", st.checkMode);

  // 各入力（ID が無くてもエラーにならない）
  if ($id("vtApiKey"))  $id("vtApiKey").value  = st.vtApiKey || "";
  if ($id("gsbApiKey")) $id("gsbApiKey").value = st.gsbApiKey || "";
  if ($id("ptAppKey"))  $id("ptAppKey").value  = st.ptAppKey || "";

  if ($id("toAntiPhishing")) $id("toAntiPhishing").value = st.toAntiPhishing || "";
  if ($id("toDekyo"))        $id("toDekyo").value        = st.toDekyo || "";

  if ($id("attachEml")) $id("attachEml").checked = !!st.attachEml;

  if ($id("allowlistDomains")) $id("allowlistDomains").value = (st.allowlistDomains || []).join("\n");
  if ($id("minSuspiciousToReport")) $id("minSuspiciousToReport").value = st.minSuspiciousToReport ?? 2;
}

function showStatus(text, type = "ok") {
  const el = $id("saveStatus");
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
  el.style.borderColor = type === "error" ? "#e35d5d" : "#58a55c";
  el.style.background = type === "error" ? "rgba(227,93,93,.10)" : "rgba(88,165,92,.10)";
  el.style.color = type === "error" ? "#e35d5d" : "inherit";
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => { el.style.display = "none"; }, 1800);
}

async function saveOptions() {
  try {
    const data = {
      checkMode: document.querySelector('input[name="checkMode"]:checked')?.value || "vt",
      vtApiKey:  $v("vtApiKey")  || $v("vtKey"),   // 旧IDフォールバックも可
      gsbApiKey: $v("gsbApiKey") || $v("gsbKey"),
      ptAppKey:  $v("ptAppKey")  || $v("ptKey"),

      toAntiPhishing: $v("toAntiPhishing"),
      toDekyo:        $v("toDekyo"),
      attachEml:      $checked("attachEml"),

      allowlistDomains: parseAllowlist($v("allowlistDomains")),
      minSuspiciousToReport: Math.max(1, parseInt($v("minSuspiciousToReport") || "2", 10)),
    };

    await browser.storage.local.set({ ...DEFAULTS, ...data });
    showStatus("保存しました ✅", "ok");
  } catch (e) {
    console.error(e);
    showStatus("保存に失敗しました…", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadOptions().catch(console.error);
  $id("save")?.addEventListener("click", (e) => { e.preventDefault(); saveOptions(); });
  $id("reset")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await browser.storage.local.set(DEFAULTS);
    await loadOptions();
    showStatus("デフォルトに戻しました", "ok");
  });
});

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

document.getElementById("save").addEventListener("click", saveOptions);
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

function on(id, type, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(type, handler);
  return !!el;
}

async function initOptions() {
  try {
    await loadOptions();
  } catch (e) {
    console.error("Load error:", e);
  }

  // 保存ボタン
  on("save", "click", (e) => {
    e.preventDefault();
    saveOptions();
  });

  // リセットボタン
  on("reset", "click", async (e) => {
    e.preventDefault();
    await browser.storage.local.set(DEFAULTS);
    await loadOptions();
    showStatus("デフォルトに戻しました", "ok");
  });
}

// DOM が構築されたら初期化
document.addEventListener("DOMContentLoaded", initOptions);
