// SPDX-License-Identifier: MIT
// options.js — 単一実装クリーン版

// 取得ユーティリティ
function $id(id){ const el=document.getElementById(id); if(!el) console.warn("[options] missing id:",id); return el; }
function $v(id){ return ($id(id)?.value ?? "").trim(); }
function $checked(id){ return !!$id(id)?.checked; }

// 既定値（background.js と整合）
const DEFAULTS = {
  checkMode: "pt",
  vtApiKey: "", gsbApiKey: "", ptAppKey: "",
  toAntiPhishing: "info@antiphishing.jp",
  toDekyo: "meiwaku@dekyo.or.jp",
  attachEml: true,
  minSuspiciousToReport: 2,
  allowlistDomains: [],
};

// 行末コメント対応の許可リストパーサ
function parseAllowlist(text){
  return (text||"")
    .split(/\r?\n/)
    .map(l => l.replace(/\s+#.*$/,"").replace(/\s+\/\/.*$/,"").trim())
    .filter(Boolean);
}

// 画面へ反映
async function loadOptions(){
  const st = await browser.storage.local.get(DEFAULTS);

  // ラジオ（チェック方式）
  const r = document.querySelector(`input[name="checkMode"][value="${st.checkMode}"]`);
  if (r) r.checked = true;

  // 入力
  $id("vtApiKey")?.setAttribute("value", st.vtApiKey || "");
  $id("gsbApiKey")?.setAttribute("value", st.gsbApiKey || "");
  $id("ptAppKey")?.setAttribute("value", st.ptAppKey || "");
  if ($id("vtApiKey"))  $id("vtApiKey").value  = st.vtApiKey || "";
  if ($id("gsbApiKey")) $id("gsbApiKey").value = st.gsbApiKey || "";
  if ($id("ptAppKey"))  $id("ptAppKey").value  = st.ptAppKey || "";

  if ($id("toAntiPhishing")) $id("toAntiPhishing").value = st.toAntiPhishing || "";
  if ($id("toDekyo"))        $id("toDekyo").value        = st.toDekyo || "";

  if ($id("attachEml")) $id("attachEml").checked = !!st.attachEml;

  if ($id("allowlistDomains")) $id("allowlistDomains").value = (st.allowlistDomains||[]).join("\n");
  if ($id("minSuspiciousToReport")) $id("minSuspiciousToReport").value = st.minSuspiciousToReport ?? 2;
}

// ステータス表示
function showStatus(text, type="ok"){
  const el=$id("saveStatus"); if(!el) return;
  el.textContent=text; el.style.display="block";
  el.style.borderColor= type==="error" ? "#e35d5d" : "#58a55c";
  el.style.background= type==="error" ? "rgba(227,93,93,.10)" : "rgba(88,165,92,.10)";
  el.style.color     = type==="error" ? "#e35d5d" : "inherit";
  clearTimeout(showStatus._t);
  showStatus._t=setTimeout(()=>{ el.style.display="none"; },1800);
}

// 保存
async function saveOptions(){
  try{
    const data = {
      checkMode: document.querySelector('input[name="checkMode"]:checked')?.value || "vt",
      vtApiKey:  $v("vtApiKey"),
      gsbApiKey: $v("gsbApiKey"),
      ptAppKey:  $v("ptAppKey"),
      toAntiPhishing: $v("toAntiPhishing"),
      toDekyo:        $v("toDekyo"),
      attachEml:      $checked("attachEml"),
      allowlistDomains: parseAllowlist($v("allowlistDomains")),
      minSuspiciousToReport: Math.max(1, parseInt($v("minSuspiciousToReport") || "2", 10)),
    };
    await browser.storage.local.set({ ...DEFAULTS, ...data }); // キー欠落も既定で補完
    showStatus("保存しました ✅","ok");
  }catch(e){
    console.error(e);
    showStatus("保存に失敗しました…","error");
  }
}

// 初期化：フォーム送信を止めて保存に一本化
document.addEventListener("DOMContentLoaded", ()=>{
  // フォーム submit を抑止して click と二重発火しないように
  $id("form")?.addEventListener("submit",(e)=>{ e.preventDefault(); saveOptions(); });
  $id("save")?.addEventListener("click",(e)=>{ e.preventDefault(); saveOptions(); });
  $id("reset")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await browser.storage.local.set(DEFAULTS);
    await loadOptions();
    showStatus("デフォルトに戻しました","ok");
  });

  loadOptions().catch(console.error);
});
// 通知ユーティリティ
function notify(title, message) {
  if (!browser?.notifications?.create) return;
  const t = String(title ?? '通知');
  const m = String(message ?? '');
  const icon = browser.runtime?.getURL?.('icons/icon-48.png') || 'icons/icon-48.png';

  try {
    return browser.notifications.create({
      type: 'basic',
      iconUrl: icon,
      title: t,
      message: m
    }).catch(()=>{});
  } catch(e) { console.warn('notify error', e); }
}
