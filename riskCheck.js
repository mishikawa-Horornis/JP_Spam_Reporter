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
// === PhishTank: 診断＆フォールバック強化版 ===
(function(){
  function _tryParseJson(text){
    try { return JSON.parse(text); } catch {}
    // HTML等で返るケースに備え、最初の { ... } を強引に抽出
    const i = text.indexOf("{"); const j = text.lastIndexOf("}");
    if (i !== -1 && j !== -1 && j > i) {
      try { return JSON.parse(text.slice(i, j+1)); } catch {}
    }
    return {};
  }

  async function _ptPost(url, appKey, abortSignal){
    const form = new URLSearchParams();
    form.set("url", url);
    form.set("format", "json");
    if (appKey) form.set("app_key", appKey);
    const res = await fetch("https://checkurl.phishtank.com/checkurl/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: abortSignal
    });
    const text = await res.text();
    const json = _tryParseJson(text);
    const r = json?.results || {};
    let verdict = "unknown";
    if (r.in_database === true) {
      if (r.verified === true && r.valid === true) verdict = "phish";
      else if (r.verified === true && r.valid === false) verdict = "safe";
      else verdict = "unknown";
    }
    return { verdict, raw: { status: res.status, ct: res.headers.get("content-type")||"", text }, parsed: r };
  }

  function _flipScheme(u){
    try{
      const x = new URL(u);
      x.protocol = (x.protocol === "https:") ? "http:" : "https:";
      return x.toString();
    }catch{ return u; }
  }
  function _noQuery(u){
    try{ const x = new URL(u); x.search=""; return x.toString(); }catch{ return u; }
  }
  function _peelPaths(u){
     const out = [];
     try{
       const x = new URL(u);
       const parts = x.pathname.split("/").filter(Boolean);
       while(parts.length>0){
         parts.pop();
         x.pathname = "/" + parts.join("/") + (parts.length?"/":"");
         x.search = "";
         out.push(x.toString());
       }
       // ルート
       x.pathname = "/";
       out.push(x.toString());
     }catch{}
     return out;
   }
   function _domainOnly(u){
     try{ const x = new URL(u); return x.origin + "/"; }catch{ return u; }
   }

   // 強化版ルックアップ：ステップごとの trace を返す
   async function ptLookupDiagnose(url, appKey, { timeoutMs = 10000 } = {}){
     const trace = [];
     const ac = new AbortController();
     const to = setTimeout(() => ac.abort(), timeoutMs);
     try{
       const tryOne = async (label, target) => {
         const r = await _ptPost(target, appKey, ac.signal);
         trace.push({ step: label, url: target, verdict: r.verdict, sample: {
           in_database: r.parsed?.in_database, verified: r.parsed?.verified, valid: r.parsed?.valid, phish_id: r.parsed?.phish_id
         }, http: r.raw.status, ct: r.raw.ct });
         return r.verdict;
       };

       // 1) そのまま
       let v = await tryOne("as-is", url);
       if (v !== "unknown") return { verdict: v, trace };

       // 2) https⇄http
       const flipped = _flipScheme(url);
       if (flipped !== url){
         v = await tryOne("flip-scheme", flipped);
         if (v !== "unknown") return { verdict: v, trace };
       }

       // 3) クエリ除去
       const noq = _noQuery(url);
       if (noq !== url){
         v = await tryOne("no-query", noq);
         if (v !== "unknown") return { verdict: v, trace };
       }

       // 4) パス段階的短縮
       for (const cand of _peelPaths(url)){
         v = await tryOne("peel-path", cand);
         if (v !== "unknown") return { verdict: v, trace };
       }

       // 5) ドメイン直
       const dom = _domainOnly(url);
       if (dom !== url){
         v = await tryOne("domain-root", dom);
         if (v !== "unknown") return { verdict: v, trace };
       }

       return { verdict: "unknown", trace };
     } finally {
       clearTimeout(to);
     }
   }

   // 既存公開名に合わせたラッパも提供（後方互換）
   if (typeof globalThis.ptLookupMinimal !== "function") {
     globalThis.ptLookupMinimal = async (u, key, opts) => {
       const r = await ptLookupDiagnose(u, key, opts);
       return { verdict: r.verdict, detail: r.trace?.[r.trace.length-1]?.sample || {} };
     };
   }
   // 診断版を直接使えるよう公開
   globalThis.ptLookupDiagnose = ptLookupDiagnose;
})();
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
// ===== PhishTank 互換ラッパ（旧API名とのブリッジ） =====
// 既存コードが phishTankCheck(url, appKey) を呼ぶ前提の互換関数。
// 戻り値は { verdict: "phish"|"safe"|"unknown", trace? } に統一。
// もし呼び出し側が「文字列だけ」を期待しているなら、下の return を r.verdict に変えてもOK。
(function () {
  if (typeof globalThis.phishTankCheck !== "function") {
    globalThis.phishTankCheck = async function (url, appKey, opts = {}) {
      // まず診断付きがあれば使う
      if (typeof globalThis.ptLookupDiagnose === "function") {
        const r = await globalThis.ptLookupDiagnose(url, appKey, opts);
        return { verdict: r.verdict, trace: r.trace };
      }
      // 最小実装にフォールバック
      if (typeof globalThis.ptLookupMinimal === "function") {
        const r = await globalThis.ptLookupMinimal(url, appKey, opts);
        // ptLookupMinimal は { verdict, detail } を返す想定
        return { verdict: r.verdict, trace: r.detail ? [{ step: "minimal", verdict: r.verdict, sample: r.detail, url }] : [] };
      }
      // どれも無ければ unknown
      return { verdict: "unknown", trace: [] };
    };
  }
})();
