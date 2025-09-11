// SPDX-License-Identifier: MIT
globalThis.createReportDraft = async function (originalMsg, rawEml, results) {
  const {
    toAntiPhishing = "info@antiphishing.jp",
    toDekyo = "report@dekyo.or.jp",
    attachEml = true,
  } = await browser.storage.local.get(["toAntiPhishing", "toDekyo", "attachEml"]);

  const to = [toAntiPhishing, toDekyo].filter(Boolean);
  const subject = `【報告】疑わしいメール: ${originalMsg.subject || "(件名なし)"}`;

  const lines = [];
  lines.push("以下、拡張機能による自動生成の報告下書きです。");
  lines.push("");
  lines.push(`受信日時: ${new Date(originalMsg.date).toLocaleString()}`);
  lines.push(`差出人: ${originalMsg.author}`);
  lines.push(`宛先: ${(originalMsg.recipients || []).join(", ")}`);
  lines.push(`件名: ${originalMsg.subject || ""}`);
  lines.push("");
  lines.push("URL 判定結果:");
  for (const r of results) lines.push(`- ${r.url} => ${r.verdict}`);
  lines.push("");
  lines.push("原本 .eml を添付しています。");

  const tab = await browser.compose.beginNew({
    to,
    subject,
    body: lines.join("\n"),
    isPlainText: true,
  });

  if (attachEml && rawEml) {
    const emlBlob = new Blob([rawEml], { type: "message/rfc822" });
    const url = URL.createObjectURL(emlBlob);
    await browser.compose.addAttachment(tab.id, {
      file: url,
      name: (originalMsg.subject || "message") + ".eml",
    });
  }
};
