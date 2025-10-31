// SPDX-License-Identifier: MIT
// urlCheck.js
// 追加：URLをVTのurl_idにするヘルパ
function vtUrlId(raw) {
  // URLのbase64url
  const b = (typeof atob === "function" ? btoa : (s)=>Buffer.from(s,"utf8").toString("base64"))(raw);
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
}

globalThis.vtCheckUrl = async function (apiKey, url) {
  // 1) 送信
  const res = await fetch("https://www.virustotal.com/api/v3/urls", {
    method: "POST",
    headers: {
      "x-apikey": apiKey,
      "content-type": "application/x-www-form-urlencoded",
      "accept": "application/json"
    },
    body: new URLSearchParams({ url })
  });
  if (!res.ok) {
    let msg = `VT analyze failed: ${res.status}`;
    try { const j = await res.json(); msg += j?.error?.message ? ` – ${j.error.message}` : ""; } catch {}
    throw new Error(msg);
  }
  const { data } = await res.json();
  const analysisId = data?.id;

  // 2) 解析完了を待つ（回数&間隔増やす）
  let verdict = "unknown", details = {};
  for (let i = 0; i < 12; i++) {            // ← 12回
    await new Promise(r => setTimeout(r, i ? 1500 : 0));  // ← 1.5秒刻みで最大~18秒
    const r = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey, "accept": "application/json" }
    });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 2000)); continue; }
    if (!r.ok) continue;

    const j = await r.json();
    const attr = j.data?.attributes;
    const stats = attr?.stats || {};
    const st = attr?.status;   // queued | running | completed
    details = { stats, status: st };

    const mal = +stats.malicious || 0, sus = +stats.suspicious || 0, ok = +stats.harmless || 0;

    if (mal > 0) { verdict = "malicious"; break; }
    if (sus > 0) { verdict = "suspicious"; break; }
    if (st === "completed" && (mal === 0 && sus === 0)) {
      verdict = ok > 0 ? "harmless" : "unknown";   // completedでも票ゼロならunknown
      break;
    }
  }

  // 3) まだunknownなら最後の手段として /urls/{url_id} を1回見る
  if (verdict === "unknown") {
    const id = vtUrlId(url);
    const r2 = await fetch(`https://www.virustotal.com/api/v3/urls/${id}`, {
      headers: { "x-apikey": apiKey, "accept": "application/json" }
    });
    if (r2.ok) {
      const j2 = await r2.json();
      const stats = j2.data?.attributes?.last_analysis_stats || {};
      const mal = +stats.malicious || 0, sus = +stats.suspicious || 0, ok = +stats.harmless || 0;
      if (mal > 0) verdict = "malicious";
      else if (sus > 0) verdict = "suspicious";
      else if (ok > 0) verdict = "harmless";
      details = { stats, status: "fetched-last-analysis" };
    }
  }

  return { verdict, details };
};
