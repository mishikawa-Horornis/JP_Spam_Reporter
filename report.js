// SPDX-License-Identifier: MIT
async function createReportDraft(originalMsg, rawEml, results) {
    // 宛先（必要に応じて調整）
    const to = [
      // フィッシング対策協議会: 公式サイト記載の報告アドレスを利用
      "info@antiphishing.jp",
      // 迷惑メール相談センター（dekyou）: 公式手順に従って報告
      "report@dekyo.or.jp"
    ];
  
    const subject = `【報告】疑わしいメール: ${originalMsg.subject || "(件名なし)"}`;
  
    const lines = [];
    lines.push("以下、Thunderbird拡張による自動生成の報告下書きです。");
    lines.push("");
    lines.push(`受信日時: ${new Date(originalMsg.date).toLocaleString()}`);
    lines.push(`差出人: ${originalMsg.author}`);
    lines.push(`宛先: ${(originalMsg.recipients||[]).join(', ')}`);
    lines.push(`件名: ${originalMsg.subject}`);
    lines.push("");
    lines.push("URL 判定結果:");
    for (const r of results) {
      lines.push(`- ${r.url} => ${r.verdict}`);
    }
    lines.push("");
    lines.push("原本 .eml を添付しています。");
  
    // 下書きを開く
    const composeDetails = {
      to,
      subject,
      body: lines.join("\n"),
      isPlainText: true
    };
    const tab = await browser.compose.beginNew(composeDetails);
  
    // .eml を添付（Blob → object URL）
    const emlBlob = new Blob([rawEml], { type: "message/rfc822" });
    const url = URL.createObjectURL(emlBlob);
    await browser.compose.addAttachment(tab.id, {
      file: url,
      name: (originalMsg.subject || "message") + ".eml"
    });
  }
  