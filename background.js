// background.js
// SPDX-License-Identifier: MIT

// ------- 小ユーティリティ ------- //
function notify(text) {
  return browser.notifications.create({
    type: "basic",
    title: "JP Spam Reporter",
    message: text,
  });
}
function getDomain(u) { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ""; } }

// 進捗通知（Thunderbirdは progress が効かない環境もあるのでフォールバック）
async function createProgress(title, value, max) {
  const id = `jp-scan-${Date.now()}`;
  try {
    await browser.notifications.create(id, {
      type: "progress",
      iconUrl: "icons/icon-48.png",
      title: "JP Spam Reporter",
      message: title,
      progress: Math.floor((value / Math.max(1, max)) * 100),
    });
  } catch {
    await browser.notifications.create(id, {
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: "JP Spam Reporter",
      message: title,
    });
  }
  return id;
}
async function updateProgress(id, title, value, max) {
  const pct = Math.floor((value / Math.max(1, max)) * 100);
  try {
    await browser.notifications.update(id, {
      type: "progress",
      iconUrl: "icons/icon-48.png",
      title: "JP Spam Reporter",
      message: title,
      progress: pct,
    });
  } catch {
    await browser.notifications.update(id, {
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: "JP Spam Reporter",
      message: title,
    });
  }
}
async function getVTKey() {
  const { vtApiKey } = await browser.storage.local.get("vtApiKey");
  return vtApiKey || "";
}

// ------- メニュー・ボタンのリスナー ------- //
browser.messageDisplayAction.onClicked.addListener((tab) => {
  handleCheckAndMaybeReport(tab).catch(console.error);  // <- top-level await を避ける
});


browser.menus.create({
  id: "jp-spam-check",
  title: "このメールをチェック＆報告下書き",
  contexts: ["message_display_action_menu", "message_list", "tools_menu"],
});

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "jp-spam-check") return;
  (async () => {
    if (info.selectedMessages && info.selectedMessages.messages?.length) {
      for (const m of info.selectedMessages.messages) {
        await handleCheckAndMaybeReport({ id: tab?.id, _messageId: m.id });
      }
    } else {
      await handleCheckAndMaybeReport(tab);
    }
  })().catch(console.error);
});

// 連打ガード
let runningScan = false;

// ------- 本体処理 ------- //
async function handleCheckAndMaybeReport(tab) {
  try {
    if (runningScan) { await notify("すでにスキャン中です…"); return; }
    runningScan = true;

    const msg = tab?._messageId
      ? await browser.messages.get(tab._messageId)
      : await browser.messageDisplay.getDisplayedMessage(tab.id);
    if (!msg) return notify("メッセージが取得できませんでした。");

    const full = await browser.messages.getFull(msg.id);
    // utils/auth.js でグローバル公開されている前提。未定義でも落ちないようにガード
    const auth = (typeof parseAuthResults === "function")
      ? parseAuthResults(full)
      : { spf: "unknown", dkim: "unknown", dmarc: "unknown" };

    const raw  = await browser.messages.getRaw(msg.id);

    // URL 抽出
    const items0 = extractUrlsFromFull(full); // [{url, ...}]
    if (!items0.length) return notify("URLは見つかりませんでした。");

    // 短縮URL展開
    const items = [];
    for (const it of items0) {
      const finalUrl = await expandUrl(it.url);
      items.push({ ...it, finalUrl });
    }
    
    const vtKey = await getVTKey();
    const { gsbApiKey = "", ptAppKey = "" } = await browser.storage.local.get(["gsbApiKey","ptAppKey"]);
    if (!vtKey) return notify("VirusTotal APIキーを設定してください（アドオン設定）。");

    // 進捗通知
    const total = items.length;
    const prog = await createProgress(`スキャン中… (0/${total})`, 0, total);

    const results = [];

    // GSB をまとめて照会
    const gsbMap = await gsbCheckBatch(items.map(x => x.finalUrl), gsbApiKey);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const r = await vtCheckUrl(vtKey, it.finalUrl);
        let verdict = r.verdict;

        // Google Safe Browsing
        const gsb = gsbMap[it.finalUrl] || "unknown";
        if (gsb === "listed" && verdict === "harmless") verdict = "suspicious";

        // PhishTank（任意。AppKey 空でも関数内でフォールバック実装にしておく）
        const pt = await phishTankCheck(it.finalUrl, ptAppKey);

        if (pt === "listed" && verdict !== "malicious") verdict = "suspicious";

        // ドメイン年齢（若すぎるなら注意）
        const ageDays = vtKey ? await domainAgeDaysViaVT(getDomain(it.finalUrl), vtKey) : null;
        const young = (ageDays !== null && ageDays <= 30);
        if (young && verdict === "harmless") verdict = "suspicious";

        results.push({
          ...it,
          url: it.finalUrl,
          verdict,
          signals: { gsb, phishtank: pt, domainAgeDays: ageDays },
          details: r.details
        });
      } catch (e) {
        results.push({ ...it, url: it.finalUrl, verdict: "error", details: String(e) });
      }

      await updateProgress(prog, `スキャン中… (${i + 1}/${total})`, i + 1, total);
    }

    const counts = results.reduce((acc, r) => (acc[r.verdict] = (acc[r.verdict]||0)+1, acc), {});
    await notify(`判定: ${Object.entries(counts).map(([k,v])=>`${k}: ${v}`).join(", ")}`);

    const bad = results.filter(r => r.verdict === "malicious" || r.verdict === "suspicious");
    
    if (bad.length > 0) {
      await createReportDraft(msg, raw, results, { auth });
      await notify("危険判定あり：報告メールの下書きを作成しました。");
    } else {
      await notify("危険判定は見つかりませんでした。");
    }
  } catch (e) {
    console.error(e);
    await notify("処理中にエラー：" + e.message);
  } finally {
    runningScan = false;
  }
}

// ------- 本ファイル内の URL 抽出ロジック（そのまま） ------- //
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
  const texts = [], htmls = [];
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


