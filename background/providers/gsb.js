// background/providers/gsb.js
(function(){
  async function checkWithGSB(url, apiKey, { timeoutMs = 10000 } = {}) {
    if (!apiKey) return { verdict: "unknown", details:{reason:"no_api_key"} };
    const body = {
      client: { clientId: "jp-spam-checker", clientVersion: "2.0.0" },
      threatInfo: {
        threatTypes: ["MALWARE","SOCIAL_ENGINEERING","UNWANTED_SOFTWARE","POTENTIALLY_HARMFUL_APPLICATION"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }]
      }
    };
    const ac = new AbortController(); const to = setTimeout(()=>ac.abort(), timeoutMs);
    try {
      const r = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal
      });
      const j = await r.json().catch(()=> ({}));
      const listed = Array.isArray(j?.matches) && j.matches.length > 0;
      return { verdict: listed ? "listed" : "clean", details: j };
    } finally { clearTimeout(to); }
  }
  globalThis.checkWithGSB = checkWithGSB;
})();
