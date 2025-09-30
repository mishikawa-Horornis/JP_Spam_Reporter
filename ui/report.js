// ui/report.js
import { startActionSpinner, stopActionSpinner } from "../utils/spinner.js";
import { notify } from "../util/notify.js";

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("spinner");
  if (el) window._spin = el; // spinner util が参照
});

async function runCheckFlow() {
  try {
    startActionSpinner();
    const msg = await browser.messageDisplay.getDisplayedMessage().catch(()=>null);
    if (!msg) { notify("JP Mail Check","メールを開いてください"); return; }

    const urls = await browser.runtime.sendMessage({ type:"extract-urls", messageId: msg.id });
    if (!urls || urls.length === 0) { notify("JP Mail Check","メール内にURLが見つかりませんでした。"); return; }

    const mode = await getSetting("mode"); // "gsb" | "pt" | "vt"
    const target = urls[0]; // とりあえず先頭で
    let res;

    if (mode === "gsb") {
      res = await browser.runtime.sendMessage({ type:"check-gsb", url: target, apiKey: await getSetting("gsbApiKey") });
    } else if (mode === "pt") {
      res = await browser.runtime.sendMessage({ type:"check-pt", url: target, appKey: await getSetting("ptAppKey") });
      if (window.showDiagTrace && res?.trace) showDiagTrace("PhishTank", res.trace);
    } else if (mode === "vt") {
      res = await browser.runtime.sendMessage({ type:"check-vt", url: target, apiKey: await getSetting("vtApiKey") });
    }

    const v = res?.verdict || "unknown";
    notify("チェック結果", `${v.toUpperCase()} - ${target}`);
  } catch (e) {
    console.error(e);
    notify("JP Mail Check", "チェックに失敗しました");
  } finally {
    stopActionSpinner();
  }
}

document.getElementById("checkAndReport")?.addEventListener("click", runCheckFlow);
