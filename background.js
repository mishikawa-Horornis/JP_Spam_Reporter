// SPDX-License-Identifier: MIT

// 右上のメッセージ表示アクションと、本文右クリックメニューを追加
browser.messageDisplayAction.onClicked.addListener(async (tab) => {
  await handleCheckAndMaybeReport(tab);
});

browser.menus.create({
  id: "jp-spam-check",
  title: "このメールをチェック＆報告下書き",
  contexts: ["message_display", "message_list"]
});

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "jp-spam-check") {
    await handleCheckAndMaybeReport(tab);
  }
});

async function handleCheckAndMaybeReport(tab) {
  try {
    const msg = await browser.messageDisplay.getDisplayedMessage(tab.id);
    if (!msg) {
      return notify("メッセージが取得できませんでした。");
    }
    // メール本文・ヘッダ取得
    const full = await browser.messages.getFull(msg.id);
    const raw = await browser.messages.getRaw(msg.id); // .eml 生成用

    const urls = extractUrlsFromFull(full);
    if (urls.length === 0) {
      return notify("URLは見つかりませんでした。");
    }

    // VirusTotalでチェック
    const vtKey = await getVTKey();
    if (!vtKey) {
      return notify("VirusTotal APIキーを設定してください（アドオン設定）。");
    }

    const results = [];
    for (const url of urls) {
      try {
        const r = await vtCheckUrl(vtKey, url);
        results.push({ url, verdict: r.verdict, details: r.details });
      } catch (e) {
        results.push({ url, verdict: "error", details: String(e) });
      }
    }

    // 危険URLが1つでもあれば報告下書きを作成
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
    message: text
  });
}

function extractUrlsFromFull(full) {
  // parts の text/html と text/plain を連結してから正規表現で抽出
  const texts = [];
  function walk(p) {
    if (!p) return;
    if (p.body) texts.push(p.body);
    if (p.parts) for (const c of p.parts) walk(c);
  }
  walk(full);
  const joined = texts.join("\n");
  const urlRe = /(https?:\/\/[^\s"'<>()]+)/gi;
  const out = new Set();
  let m;
  while ((m = urlRe.exec(joined)) !== null) {
    out.add(m[1].replace(/[\.,]$/, ""));
  }
  return Array.from(out);
}

async function getVTKey() {
  const { vtApiKey } = await browser.storage.local.get("vtApiKey");
  return vtApiKey || "";
}

async function showResultPanel(results) {
  // 簡易：通知に件数のみ。必要なら options_ui で結果ダイアログを作る
  const counts = results.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts).map(([k,v])=>`${k}:${v}`).join(", ");
  await notify(`判定: ${summary}`);
}

async function vtCheckUrl(apiKey, url) {
  // 1) URL を解析キューへ投入
  const analyze = await fetch("https://www.virustotal.com/api/v3/urls", {
    method: "POST",
    headers: {
      "x-apikey": apiKey,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ url })
  });
  if (!analyze.ok) throw new Error("VT analyze failed: " + analyze.status);
  const data = await analyze.json();
  const id = data.data.id; // analysis id

  // 2) 結果取得（数回ポーリング）
  let verdict = "unknown";
  let details = {};
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, i ? 1500 : 0));
    const r = await fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
      headers: { "x-apikey": apiKey }
    });
    if (!r.ok) continue;
    const j = await r.json();
    const stats = j.data?.attributes?.stats || {};
    const malicious = Number(stats.malicious || 0);
    const suspicious = Number(stats.suspicious || 0);
    const harmless = Number(stats.harmless || 0);

    details = { stats, status: j.data?.attributes?.status };
    if (malicious > 0) { verdict = "malicious"; break; }
    if (suspicious > 0) { verdict = "suspicious"; break; }
    if (harmless > 0 && malicious === 0 && suspicious === 0) {
      verdict = "harmless"; break;
    }
  }
  return { verdict, details };
}
