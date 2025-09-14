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
