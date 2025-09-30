// ui/report.js
import { startActionSpinner, stopActionSpinner } from "../utils/spinner.js";
import { notify } from "../util/notify.js";

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("spinner");
  if (el) window._spin = el; // spinner util が参照
});

document.getElementById("checkAndReport")?.addEventListener("click", runCheckFlow);
document.addEventListener("DOMContentLoaded", () => {
  const sp = document.getElementById("spinner");
  if (sp) globalThis._spin = sp;

  const btn = document.getElementById("checkAndReport");
  if (btn) globalThis._scanBtn = btn;

  if (btn) {
    btn.addEventListener("click", async () => {
      startActionSpinner();
      try {
        // ここで background/api.js にチェック依頼を送る
        const msg = await browser.messageDisplay.getDisplayedMessage().catch(() => null);
        if (!msg) { notify?.("JP Spam Reporter", "メールを開いてください"); return; }

        const urls = await browser.runtime.sendMessage({ type: "extract-urls", messageId: msg.id });
        if (!urls || urls.length === 0) { notify?.("JP Spam Reporter", "URL が見つかりません"); return; }

        const mode = await getSetting("mode");
        const target = urls[0];
        let res = { verdict: "unknown" };

        if (mode === "gsb") {
          res = await browser.runtime.sendMessage({ type: "check-gsb", url: target, apiKey: await getSetting("gsbApiKey") });
        } else if (mode === "pt") {
          res = await browser.runtime.sendMessage({ type: "check-pt", url: target, appKey: await getSetting("ptAppKey") });
        } else if (mode === "vt") {
          res = await browser.runtime.sendMessage({ type: "check-vt", url: target, apiKey: await getSetting("vtApiKey") });
        }

        notify?.("チェック結果", `${(res.verdict || "unknown").toUpperCase()} - ${target}`);
      } catch (e) {
        console.error(e);
        notify?.("JP Spam Reporter", "チェックに失敗しました");
      } finally {
        stopActionSpinner();
      }
    });
  }
});
