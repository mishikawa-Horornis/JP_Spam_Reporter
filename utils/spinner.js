// utils/spinner.js (MV2 用：グローバル公開)
(function () {
  if (typeof globalThis._spin === "undefined") globalThis._spin = null;
  if (typeof globalThis._scanBtn === "undefined") globalThis._scanBtn = null;
  if (typeof globalThis._scanStatus === "undefined") globalThis._scanStatus = null;

  globalThis.startActionSpinner = function () {
    const s = globalThis._spin;
    const btn = globalThis._scanBtn;
    const st = globalThis._scanStatus;
    if (s) s.style.display = "inline-block";
    if (btn) {
      btn.dataset.origText = btn.innerText;
      btn.innerText = "Scanning…";
      btn.disabled = true;
    }
    if (st) st.textContent = "スキャンを開始しました…";
  };

  globalThis.stopActionSpinner = function () {
    const s = globalThis._spin;
    const btn = globalThis._scanBtn;
    const st = globalThis._scanStatus;
    if (s) s.style.display = "none";
    if (btn) {
      btn.innerText = btn.dataset.origText || "Check & Report";
      btn.disabled = false;
    }
    if (st && !st.dataset.pinned) st.textContent = "";
  };
})();
