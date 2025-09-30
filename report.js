// SPDX-License-Identifier: MIT

// --- (1) flagIndicators: そのまま使えます ---
if (!globalThis.flagIndicators) {
  globalThis.flagIndicators = function (items) {
    const getDomain = (u) => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ""; } };
    return items.map(it => {
      const dom = getDomain(it.url);
      let mismatch = false;
      if (it.anchorText) {
        const inTextDomain = it.anchorText.match(/[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] || "";
        mismatch = inTextDomain && inTextDomain.toLowerCase() !== dom.toLowerCase();
      }
      const shortener = /\b(bit\.ly|t\.co|goo\.gl|is\.gd|buff\.ly|ow\.ly|tinyurl\.com)\b/i.test(dom);
      return { ...it, domain: dom, mismatch, shortener };
    });
  };
}

// --- (2) スピナー紐付け（未初期化でも落ちない util 前提: utils/spinner.js） ---
document.addEventListener("DOMContentLoaded", () => {
  const sp = document.getElementById("spinner");
  if (sp) globalThis._spin = sp;
});

// --- (3) Check & Report の最小ハンドラ（background/api.js に集約した形） ---
async function runCheckAndReport() {
  try {
    // 未初期化でも NO-OP な util 実装前提（startActionSpinner/stopActionSpinner）
    startActionSpinner?.();

    const msg = await browser.messageDisplay.getDisplayedMessage().catch(()=>null);
    if (!msg) { notify?.("JP Mail Check", "メールを開いてください"); return; }

    const urls = await browser.runtime.sendMessage({ type: "extract-urls", messageId: msg.id });
    if (!urls || urls.length === 0) { notify?.("JP Mail Check", "メール内にURLが見つかりませんでした。"); return; }

    const mode = (typeof getSetting === "function") ? (await getSetting("mode")) : "gsb"; // "gsb"|"pt"|"vt"
    const target = urls[0];
    let res = { verdict: "unknown" };

    if (mode === "gsb") {
      res = await browser.runtime.sendMessage({ type: "check-gsb", url: target, apiKey: await getSetting("gsbApiKey") });
    } else if (mode === "pt") {
      res = await browser.runtime.sendMessage({ type: "check-pt",  url: target, appKey: await getSetting("ptAppKey") });
      // 診断トレース（入れていれば可視化）
      if (typeof showDiagTrace === "function" && res?.trace) showDiagTrace("PhishTank", res.trace);
    } else if (mode === "vt") {
      res = await browser.runtime.sendMessage({ type: "check-vt",  url: target, apiKey: await getSetting("vtApiKey") });
    }

    notify?.("チェック結果", `${(res.verdict||"unknown").toUpperCase()} - ${target}`);
  } catch (e) {
    console.error(e);
    notify?.("JP Mail Check", "チェックに失敗しました");
  } finally {
    stopActionSpinner?.();
  }
}

// ボタンがある場合だけ結び付ける（無くても落ちない）
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("checkAndReport");
  if (btn) btn.addEventListener("click", runCheckAndReport);
});
