// SPDX-License-Identifier: MIT

// 1) flagIndicators（必要なら他ファイル不在時のフォールバック）
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

// 2) 診断トレース（PhishTank 等の可視化：存在すれば使われます）
(function(){
  if (globalThis.showDiagTrace) return;
  globalThis.showDiagTrace = function showDiagTrace(name, trace = []) {
    try {
      const old = document.getElementById('diag-trace');
      if (old) old.remove();

      const wrap = document.createElement('details');
      wrap.id = 'diag-trace';
      wrap.open = false;

      const sum = document.createElement('summary');
      sum.textContent = `診断トレース（${name}）`;
      wrap.appendChild(sum);

      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr><th>step</th><th>verdict</th><th>HTTP</th><th>in_db</th><th>verified</th><th>valid</th><th>url</th></tr>
        </thead>
        <tbody></tbody>`;
      const tbody = table.querySelector('tbody');

      (trace || []).forEach(t => {
        const tr = document.createElement('tr');
        const td = v => { const x=document.createElement('td'); x.textContent = (v ?? '').toString(); return x; };
        tr.appendChild(td(t.step));
        tr.appendChild(td(t.verdict));
        tr.appendChild(td(t.http));
        tr.appendChild(td(t.sample?.in_database));
        tr.appendChild(td(t.sample?.verified));
        tr.appendChild(td(t.sample?.valid));
        tr.appendChild(td(t.url));
        tbody.appendChild(tr);
      });

      wrap.appendChild(table);
      (document.getElementById('status') || document.body).appendChild(wrap);
    } catch(e){ console.warn('showDiagTrace error:', e); }
  };
})();

// 3) DOM 準備：ボタン/スピナー/ステータス紐付け
document.addEventListener("DOMContentLoaded", () => {
  const sp = document.getElementById("spinner");
  const btn = document.getElementById("checkAndReport");
  const st  = document.getElementById("status");
  if (sp) globalThis._spin = sp;
  if (btn) globalThis._scanBtn = btn;
  if (st)  globalThis._scanStatus = st;

  btn?.addEventListener("click", runCheckAndReport);
});

// 4) メイン：Scan & Report
async function runCheckAndReport() {
  startActionSpinner?.();

  try {
    // (A) 対象メール
    const msg = await browser.messageDisplay.getDisplayedMessage().catch(()=>null);
    if (!msg) { setStatus("メールを開いてください"); notify?.("JP Spam Reporter","メールを開いてください"); return; }

    // (B) 抽出
    setStatus("URL を抽出中…");
    const urls = await browser.runtime.sendMessage({ type: "extract-urls", messageId: msg.id });
    if (!urls || urls.length === 0) { setStatus("メール内にURLが見つかりませんでした。", true); notify?.("JP Spam Reporter","URL が見つかりません"); return; }

    // (C) モードとキー
    const mode = (typeof getSetting === "function") ? (await getSetting("mode")) : "gsb"; // "gsb"|"pt"|"vt"
    const target = urls[0];

    setStatus(`スキャン実行中（${mode.toUpperCase()}）…`);

    let res = { verdict: "unknown" };
    if (mode === "gsb") {
      res = await browser.runtime.sendMessage({ type:"check-gsb", url: target, apiKey: await getSetting("gsbApiKey") });
    } else if (mode === "pt") {
      res = await browser.runtime.sendMessage({ type:"check-pt",  url: target, appKey: await getSetting("ptAppKey") });
      if (res?.trace && typeof showDiagTrace === "function") showDiagTrace("PhishTank", res.trace);
    } else if (mode === "vt") {
      res = await browser.runtime.sendMessage({ type:"check-vt",  url: target, apiKey: await getSetting("vtApiKey") });
    }

    const v = (res?.verdict || "unknown").toUpperCase();
    setStatus(`結果: ${v} — ${target}`, true);
    notify?.("チェック結果", `${v} - ${target}`);
  } catch (e) {
    console.error(e);
    setStatus("チェックに失敗しました。", true);
    notify?.("JP Spam Reporter","チェックに失敗しました");
  } finally {
    stopActionSpinner?.();
  }
}

// 5) ちょい便利：ステータス表示
function setStatus(text, pin = false) {
  const el = globalThis._scanStatus;
  if (!el) return;
  el.textContent = text || "";
  if (pin) el.dataset.pinned = "1"; else delete el.dataset.pinned;
}
