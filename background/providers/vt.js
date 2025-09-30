// background/providers/vt.js
(function(){
  async function checkWithVT(url, apiKey, { timeoutMs = 15000 } = {}) {
    if (!apiKey) return { verdict:"unknown", details:{reason:"no_api_key"} };
    const headers = { "x-apikey": apiKey, "Content-Type":"application/x-www-form-urlencoded" };
    const ac = new AbortController(); const to = setTimeout(()=>ac.abort(), timeoutMs);
    try {
      const form = new URLSearchParams({ url });
      const submit = await fetch("https://www.virustotal.com/api/v3/urls", { method:"POST", headers, body: form.toString(), signal: ac.signal });
      const sub = await submit.json(); const id = sub?.data?.id;
      if (!id) return { verdict:"unknown", details:sub };
      for (let i=0;i<12;i++) {
        const r = await fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, { headers, signal: ac.signal });
        const j = await r.json(); const s = j?.data?.attributes?.status;
        if (s === "completed") {
          const stats = j?.data?.attributes?.stats || {};
          const listed = (stats.malicious > 0 || stats.suspicious > 0);
          return { verdict: listed ? "listed" : "clean", details: stats };
        }
        await new Promise(rs=>setTimeout(rs,1000));
      }
      return { verdict:"unknown" };
    } finally { clearTimeout(to); }
  }
  globalThis.checkWithVT = checkWithVT;
})();
