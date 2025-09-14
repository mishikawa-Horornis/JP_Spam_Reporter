// SPDX-License-Identifier: MIT
// background.js （auth 取得箇所）
const full = await browser.messages.getFull(msg.id);
const auth = (typeof parseAuthResults === "function")
  ? parseAuthResults(full)
  : { spf: "unknown", dkim: "unknown", dmarc: "unknown" };


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

// 連打ガード用フラグ
let runningScan = false;

async function handleCheckAndMaybeReport(tab) {
  try {
    if (runningScan) {
      await notify("すでにスキャン中です…");
      return;
    }
    runningScan = true;
    const msg = tab?._messageId
      ? await browser.messages.get(tab._messageId)
      : await browser.messageDisplay.getDisplayedMessage(tab.id);
    if (!msg) return notify("メッセージが取得できませんでした。");

    const full = await browser.messages.getFull(msg.id);
    const auth = parseAuthResults(full);   // { spf, dkim, dmarc }
    const raw  = await browser.messages.getRaw(msg.id);

    const items0 = extractUrlsFromFull(full); // [{url, ...}]
    // 短縮URL展開
    const items = [];
    for (const it of items0) {
      const finalUrl = await expandUrl(it.url);
      items.push({ ...it, finalUrl });
    }
    if (items.length === 0) return notify("URLは見つかりませんでした。");

    const vtKey = await getVTKey();
    const { gsbApiKey = "", ptAppKey = "" } = await browser.storage.local.get(["gsbApiKey","ptAppKey"]);
    if (!vtKey) return notify("VirusTotal APIキーを設定してください（アドオン設定）。");

    // 進捗通知を作成
    const total = items.length;
    const prog = await createProgress(`スキャン中… (0/${total})`, 0, total);

    const results = [];
    // 先に GSB をまとめて照会（高速）
    const gsbMap = await gsbCheckBatch(items.map(x => x.finalUrl), gsbApiKey);

     // こう直す（index を使う）
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
       try {
        const r = await vtCheckUrl(vtKey, it.finalUrl);
        let verdict = r.verdict;

        // Google Safe Browsing
        const gsb = gsbMap[it.finalUrl] || "unknown";
        if (gsb === "listed" && verdict === "harmless") verdict = "suspicious";

        // PhishTank（任意）
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

    const bad = results.filter(r => r.verdict === "malicious" || r.verdict === "suspicious");
    await showResultPanel(results); // サマリ通知

    if (bad.length > 0) {
      await createReportDraft(msg, raw, results, { auth });
      notify("危険判定あり：報告メールの下書きを作成しました。");
    } else {
      notify("危険判定は見つかりませんでした。");
    }
  } catch (e) {
    console.error(e);
    notify("処理中にエラー：" + e.message);
  } finally {
    runningScan = false;
  }
}
// 進捗通知（Thunderbirdは`progress`タイプが使えない環境もあるので文字更新でフォールバック）
async function createProgress(title, value, max) {
  const id = `jp-scan-${Date.now()}`;
  try {
    // progressタイプが通る環境ならこちら（通らない場合は例外→下のbasicに）
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
async function showResultPanel(results) {
  // 判定結果の集計
  const counts = results.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] || 0) + 1;
    return acc;
  }, {});

  // まとめて通知
  const summary = Object.entries(counts)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  await notify(`判定: ${summary}`);
}
