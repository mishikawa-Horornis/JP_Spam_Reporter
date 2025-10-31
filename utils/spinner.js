// utils/spinner.js
// SPDX-License-Identifier: MIT
(function() {
  globalThis.startActionSpinner = function() {
    const spinner = document.getElementById("spinner");
    if (spinner) spinner.style.display = "inline-block";
    const btn = globalThis._scanBtn || document.getElementById("checkAndReport");
    if (btn) btn.disabled = true;
  };

  globalThis.stopActionSpinner = function() {
    const spinner = document.getElementById("spinner");
    if (spinner) spinner.style.display = "none";
    const btn = globalThis._scanBtn || document.getElementById("checkAndReport");
    if (btn) btn.disabled = false;
  };
  
  console.log("[Spinner] Module loaded");
})();
