// utils/spinner.js (MV2向け)
(function(){
  if (typeof globalThis._spin === "undefined") globalThis._spin = null;
  globalThis.startActionSpinner = function(){
    const s = globalThis._spin; if (!s) return;
    if (typeof s.show === "function") s.show();
    else if (s.style) s.style.display = "";
  };
  globalThis.stopActionSpinner = function(){
    const s = globalThis._spin; if (!s) return;
    if (typeof s.hide === "function") s.hide();
    else if (s.style) s.style.display = "none";
  };
})();
