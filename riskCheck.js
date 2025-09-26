// SPDX-License-Identifier: MIT
// ==== SPF / DKIM / DMARC パース ====
globalThis.parseAuthResults = function(full) {
  const headers = (full.headers || []).reduce((m, h) => (m[h.name.toLowerCase()] = h.value, m), {});
  const ar = (headers["authentication-results"] || "").toLowerCase();
  const spf   = /spf=(pass|fail|softfail|neutral|temperror|permerror)/.exec(ar)?.[1] || "unknown";
  const dkim  = /dkim=(pass|fail|none|temperror|permerror)/.exec(ar)?.[1] || "unknown";
  const dmarc = /dmarc=(pass|fail|bestguesspass|none)/.exec(ar)?.[1] || "unknown";
  const receivedSpf = /^(pass|fail|softfail|neutral|permerror|temperror)/.exec((headers["received-spf"]||"").toLowerCase())?.[1];
  return { spf: receivedSpf || spf, dkim, dmarc };
};

// ==== 短縮URL展開（最大3ホップ）====
globalThis.expandUrl = async function(url, maxHops = 3) {
  let current = url;
  for (let i=0;i<maxHops;i++) {
    try {
      const resp = await fetch(current, { redirect: "follow", method: "GET" });
      const next = resp.url || current;
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
};

globalThis.gsbCheckBatch = async function(urls, apiKey) {
  if (!apiKey || urls.length === 0) return {};
  const body = {
    client: { clientId: "jp-spam-checker", clientVersion: "2.0.0" },
    threatInfo: {
      threatTypes: [
        "MALWARE",
        "SOCIAL_ENGINEERING",
        "UNWANTED_SOFTWARE",
        "POTENTIALLY_HARMFUL_APPLICATION"
      ],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: urls.map(u => ({ url: u }))  // まとめて照会
    }
  };
  try {
    const r = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "content-type":"application/json" }, body: JSON.stringify(body)
    });
    if (!r.ok) {
      let msg = `GSB ${r.status}`;
      try { const j = await r.json(); msg += j?.error?.message ? ` – ${j.error.message}` : ""; } catch {}
      console.warn("[GSB] request failed:", msg);
      return {};
    }
    const j = await r.json();
    const set = new Set((j.matches||[]).map(m => m.threat?.url));
    const out = {};
    for (const u of urls) out[u] = set.has(u) ? "listed" : "clean";
    return out;
  } catch (e) {
    console.warn("[GSB] fetch error:", e);
    return {};
  }
};

// ==== PhishTank 照会（任意。CORS通らない環境では自動でスキップ）====
globalThis.phishTankCheck = async function(url, appKey) {
  if (!appKey) return "unknown";
  try {
    const form = new URLSearchParams({ url, format: "json", app_key: appKey });
    const r = await fetch("https://checkurl.phishtank.com/checkurl/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form
    });
    if (!r.ok) return "unknown";
    const j = await r.json();
    const verified = j?.results?.valid || false;
    return verified ? "listed" : "clean";
  } catch { return "unknown"; }
};

// ==== ドメイン年齢（VirusTotal ドメイン情報を利用）====
globalThis.domainAgeDaysViaVT = async function(domain, vtKey) {
  try {
    const r = await fetch(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`, {
      headers: { "x-apikey": vtKey }
    });
    if (!r.ok) return null;
    const j = await r.json();
    const ts = j.data?.attributes?.creation_date || j.data?.attributes?.whois_date;
    if (!ts) return null;
    const days = Math.floor((Date.now()/1000 - ts) / 86400);
    return days;
  } catch { return null; }
};

// ==== 便利関数 ====
globalThis.getDomain = (u) => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ""; } };