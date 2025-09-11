// SPDX-License-Identifier: MIT

// 右上ボタン
browser.messageDisplayAction.onClicked.addListener(async (tab) => {
  await handleCheckAndMaybeReport(tab);
});

// 右クリック/ツールメニュー
browser.menus.create({
  id: "jp-spam-check",
  title: "このメールをチェック＆報告下書き",
  contexts: ["message_display_action_menu", "message_list", "tools_menu"],
});

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "jp-spam-check") return;
  if (info.selectedMessages && info.selectedMessages.messages?.length) {
    for (const m of info.selectedMessages.messages) {
      await handleCheckAndMaybeReport({ id: tab?.id, _messageId: m.id });
    }
  } else {
    await handleCheckAndMaybeReport(tab);
  }
});

async function handleCheckAndMaybeReport(tab) {
  try {
    const msg = tab?._messageId
      ? await browser.messages.get(tab._messageId)
      : await browser.messageDisplay.getDisplayedMessage(tab.id);
    if (!msg) return notify("メッセージが取得できませんでした。");

    const full = await browser.messages.getFull(msg.id);
    const raw  = await browser.messages.getRaw(msg.id);

    const items = extractUrlsFromFull(full); // [{url, anchorText, source}, ...]
    if (items.length === 0) return notify("URLは見つかりませんでした。");

    const vtKey = await getVTKey();
    if (!vtKey) return notify("VirusTotal APIキーを設定してください（アドオン設定）。");

    const results = [];
    for (const it of items) {
      try {
        const r = await vtCheckUrl(vtKey, it.url);

        results.push({ ...it, verdict: r.verdict, details: r.details });
      } catch (e) {
        results.push({ ...it, verdict: "error", details: String(e) });
      }
    }


    const bad = results.filter(r => r.verdict === "malicious" || r.verdict === "suspicious");
    await showResultPanel(results);

    if (bad.length > 0) {
      await createReportDraft(msg, raw, results);
      notify("危険判定あり：報告メールの下書きを作成しました。");
    } else {
      notify("危険判定は見つかりませんでした。");
    }
  } catch (e) {
    console.error(e);
    notify("処理中にエラー：" + e.message);
  }
}

function notify(text) {
  return browser.notifications.create({
    type: "basic",
    title: "JP Spam Reporter",
    message: text,
  });

}

async function getVTKey() {
  const { vtApiKey } = await browser.storage.local.get("vtApiKey");
  return vtApiKey || "";
}

/* ===== URL抽出（HTML優先）===== */
function extractFromHtml(html) {
  const out = [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");

    const links = [...doc.querySelectorAll("a[href], area[href]")];
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (!/^https?:/i.test(href)) continue;
      const text = (a.textContent || "").trim().slice(0, 200);
      out.push({ url: href, anchorText: text, source: "html" });
    }

    const text = doc.body?.innerText || "";
    out.push(...extractFromPlain(text).map(u => ({ url: u, anchorText: "", source: "html-text" })));
  } catch {}
  return out;
}

function extractFromPlain(text) {
  const urlRe = /(https?:\/\/[^\s"'<>]+)/gi;
  const set = new Set();
  let m;
  while ((m = urlRe.exec(text)) !== null) set.add(m[1].replace(/[.,]$/, ""));
  return Array.from(set);
}

function extractUrlsFromFull(full) {
  const texts = [];
  const htmls = [];
  (function walk(p) {
    if (!p) return;
    if (/^text\/html/i.test(p.contentType) && p.body) htmls.push(p.body);
    else if (p.body) texts.push(p.body);
    if (p.parts) for (const c of p.parts) walk(c);
  })(full);

  const list = [];
  for (const h of htmls) list.push(...extractFromHtml(h));
  for (const t of texts) list.push(...extractFromPlain(t).map(u => ({ url: u, anchorText: "", source: "plain" })));
 
  const uniq = new Map();
  for (const it of list) if (!uniq.has(it.url)) uniq.set(it.url, it);
  return Array.from(uniq.values());
}

/* ===== 参考：アンカー表示名とリンク先の不一致検出（report.js側と同義）===== */
function flagIndicators(items) {
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
}
