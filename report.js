// SPDX-License-Identifier: MIT

// もし他ファイルで flagIndicators を公開していない場合は、この定義を使う
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

globalThis.createReportDraft = async function (originalMsg, rawEml, results) {
  const {
    toAntiPhishing = "info@antiphishing.jp",
    toDekyo = "report@dekyo.or.jp",
    attachEml = true,
  } = await browser.storage.local.get(["toAntiPhishing", "toDekyo", "attachEml"]);

  const to = [toAntiPhishing, toDekyo].filter(Boolean);
  const subject = `【報告】疑わしいメール: ${originalMsg.subject || "(件名なし)"}`;

  // resultsにフラグ付け → 本文生成（HTML優先、なければプレーン）
  const resultItems = flagIndicators(results);
  const bodies = buildBodies(originalMsg, resultItems);

  const params = { to, subject };
  if (bodies.usePlain) {
    params.isPlainText = true;
    params.plainTextBody = bodies.text;  // ← プレーン時は plainTextBody 必須
  } else {
    params.body = bodies.html;
  }
  const tab = await browser.compose.beginNew(params);

  if (attachEml && rawEml) {
    try {
      // 1) compose画面の初期化が終わるのを少し待つ（環境により必要）
      await new Promise(r => setTimeout(r, 150));

      // 2) ArrayBuffer/Uint8Array を File にする（ThunderbirdはFileが安定）
      const bytes = rawEml instanceof ArrayBuffer ? rawEml
                 : ArrayBuffer.isView(rawEml)      ? rawEml.buffer
                 : new TextEncoder().encode(String(rawEml)).buffer;

      const filename = (originalMsg.subject || "message") + ".eml";
      const emlFile = new File([bytes], filename, { type: "message/rfc822" });

      // 3) 添付
      await browser.compose.addAttachment(tab.id, { file: emlFile });
    } catch (e) {
      console.error("attach .eml failed:", e);
      await browser.notifications.create({
        type: "basic",
        title: "JP Spam Reporter",
        message: "注意：.eml の添付に失敗しました（手動で添付してください）。"
      });
    }
  };
}
function buildBodies(msg, verdicts) {
  const lines = [];
  lines.push("以下、拡張機能による自動生成の報告下書きです。");
  lines.push("");
  lines.push(`受信日時: ${new Date(msg.date).toLocaleString()}`);
  lines.push(`差出人: ${msg.author}`);
  lines.push(`宛先: ${(msg.recipients || []).join(", ")}`);
  lines.push(`件名: ${msg.subject || ""}`);
  lines.push("");

  // HTMLパートが1つでもあればHTML本文で作成
  const anyHtml = verdicts.some(v => (v.source || "").startsWith("html"));
  if (!anyHtml) {
    lines.push("URL 判定結果:");
    for (const v of verdicts) {
      const notes = [
        v.mismatch ? "表示名とドメイン不一致" : "",
        v.shortener ? "短縮URL" : "",
        v.source === "plain" ? "本文(プレーン)検出" : ""
      ].filter(Boolean).join(", ");
      lines.push(`- ${v.url} => ${v.verdict}${notes ? ` [${notes}]` : ""}`);
    }
    return { usePlain: true, text: lines.join("\n") };
  }

  const rows = verdicts.map(v => {
    const notes = [
      v.mismatch ? "⚠︎表示名≠リンク先" : "",
      v.shortener ? "短縮URL" : "",
      v.source === "html-text" ? "裸URL" : "アンカー"
    ].filter(Boolean).join(" / ");
    const safeText = (v.anchorText || "").replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]));
    // URLはそのまま a[href] に入れる（報告用下書きなのでOK）
    return `<tr>
      <td style="word-break:break-all;"><a href="${v.url}" rel="noreferrer noopener">${v.url}</a></td>
      <td>${safeText}</td>
      <td>${v.domain}</td>
      <td>${v.verdict}</td>
      <td>${notes}</td>
    </tr>`;
  }).join("");

  const html = [
    `<p>${lines.map(s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;')).join("<br>")}</p>`,
    `<table border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>URL</th><th>表示文字</th><th>ドメイン</th><th>判定</th><th>メモ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
  ].join("\n");

  return { usePlain: false, html };
}
// --- Diagnosis Trace UI (PT/GSB兼用) ---
window.showDiagTrace = function showDiagTrace(name, trace = []) {
  try {
    // 既存があれば一度消す
    const old = document.getElementById('diag-trace');
    if (old) old.remove();

    // コンテナ
    const wrap = document.createElement('details');
    wrap.id = 'diag-trace';
    wrap.open = false;

    // サマリー
    const summary = document.createElement('summary');
    summary.textContent = `診断トレース（${name}）`;
    wrap.appendChild(summary);

    // テーブル
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '8px';

    const head = document.createElement('thead');
    head.innerHTML = `
      <tr>
        <th style="text-align:left;padding:6px;border-bottom:1px solid #888;">step</th>
        <th style="text-align:left;padding:6px;border-bottom:1px solid #888;">verdict</th>
        <th style="text-align:left;padding:6px;border-bottom:1px solid #888;">HTTP</th>
        <th style="text-align:left;padding:6px;border-bottom:1px solid #888;">in_db</th>
        <th style="text-align:left;padding:6px;border-bottom:1px solid #888;">verified</th>
        <th style="text-align:left;padding:6px;border-bottom:1px solid #888;">valid</th>
        <th style="text-align:left;padding:6px;border-bottom:1px solid #888;">url</th>
      </tr>`;
    table.appendChild(head);

    const body = document.createElement('tbody');
    (trace || []).forEach(t => {
      const tr = document.createElement('tr');
      const cell = (v) => {
        const td = document.createElement('td');
        td.style.padding = '6px';
        td.style.verticalAlign = 'top';
        td.textContent = (v ?? '').toString();
        return td;
      };
      tr.appendChild(cell(t.step));
      tr.appendChild(cell(t.verdict));
      tr.appendChild(cell(t.http));
      tr.appendChild(cell(t.sample?.in_database));
      tr.appendChild(cell(t.sample?.verified));
      tr.appendChild(cell(t.sample?.valid));
      tr.appendChild(cell(t.url));
      body.appendChild(tr);
    });
    table.appendChild(body);

    wrap.appendChild(table);

    // どこに差すか：結果セクションの直後 / なければ末尾
    const anchor =
      document.getElementById('result') ||
      document.querySelector('.results') ||
      document.body;

    anchor.appendChild(wrap);
  } catch (e) {
    console.error('showDiagTrace error:', e);
  }
};
/* =========================
 * Diagnosis Trace UI (PT/GSB兼用)
 * 末尾にそのまま追記してください
 * ========================= */
(function(){
  // 既存があれば上書きしない
  if (window.showDiagTrace) return;

  // 軽いスタイル（不要なら削除可）
  const style = `
    #diag-trace { margin-top: 12px; border: 1px solid var(--border, #3a3a3a); border-radius: 8px; padding: 8px; }
    #diag-trace summary { font-weight: 600; cursor: pointer; }
    #diag-trace table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    #diag-trace th, #diag-trace td { text-align: left; padding: 6px; border-bottom: 1px solid #888; font-size: 12.5px; vertical-align: top; }
  `;
  try {
    const s = document.createElement('style');
    s.textContent = style;
    document.head.appendChild(s);
  } catch {}

  // 表示ヘルパ
  window.showDiagTrace = function showDiagTrace(name, trace = []) {
    try {
      // 既存があれば消す
      const old = document.getElementById('diag-trace');
      if (old) old.remove();

      // コンテナ
      const wrap = document.createElement('details');
      wrap.id = 'diag-trace';
      wrap.open = false;

      // サマリー
      const summary = document.createElement('summary');
      summary.textContent = `診断トレース（${name}）`;
      wrap.appendChild(summary);

      // テーブル
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>step</th>
          <th>verdict</th>
          <th>HTTP</th>
          <th>in_db</th>
          <th>verified</th>
          <th>valid</th>
          <th>url</th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      (trace || []).forEach(t => {
        const tr = document.createElement('tr');
        const td = (v) => { const x = document.createElement('td'); x.textContent = (v ?? '').toString(); return x; };
        tr.appendChild(td(t.step));
        tr.appendChild(td(t.verdict));
        tr.appendChild(td(t.http));
        tr.appendChild(td(t.sample?.in_database));
        tr.appendChild(td(t.sample?.verified));
        tr.appendChild(td(t.sample?.valid));
        tr.appendChild(td(t.url));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);

      // 差し込み先：結果表示あたり（なければ body 末尾）
      const anchor =
        document.getElementById('result') ||
        document.querySelector('.results') ||
        document.body;

      anchor.appendChild(wrap);
    } catch (e) {
      console.error('showDiagTrace error:', e);
    }
  };
})();
