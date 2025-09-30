// background/providers/pt.js
(function(){
  async function _ptCall(u, appKey, signal) {
    const form = new URLSearchParams({ url: u, format: "json" });
    if (appKey) form.set("app_key", appKey);
    const r = await fetch("https://checkurl.phishtank.com/checkurl/", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(), signal
    });
    const j = await r.json().catch(()=> ({}));
    const res = j?.results || {};
    let verdict = "unknown";
    if (res.in_database === true) {
      verdict = (res.verified === true && res.valid === true) ? "listed"
              : (res.verified === true && res.valid === false) ? "clean" : "unknown";
    }
    return { verdict, sample: res, http: r.status, url: u };
  }
  async function checkWithPT(url, appKey, { timeoutMs = 10000 } = {}) {
    const ac = new AbortController(); const to = setTimeout(()=>ac.abort(), timeoutMs);
    const trace = [];
    try {
      const steps = [];
      const flip = (u)=>{ try{ const x=new URL(u); x.protocol=(x.protocol==="https:")?"http:":"https:"; return x.toString(); }catch{return u;}};
      const noQ  = (u)=>{ try{ const x=new URL(u); x.search=""; return x.toString(); }catch{return u;}};
      const peel = (u)=>{ try{ const x=new URL(u); const out=[]; const parts=x.pathname.split("/").filter(Boolean);
        while(parts.length){ parts.pop(); x.pathname="/"+parts.join("/")+(parts.length?"/":""); x.search=""; out.push(x.toString()); }
        x.pathname="/"; x.search=""; out.push(x.toString()); return out; }catch{return [];} };
      const dom  = (u)=>{ try{ const x=new URL(u); x.pathname="/"; x.search=""; return x.toString(); }catch{return u;} };

      steps.push(url);
      const f = flip(url); if (f!==url) steps.push(f);
      const nq= noQ(url);  if (nq!==url) steps.push(nq);
      steps.push(...peel(url));
      const d = dom(url);  if (d!==url)  steps.push(d);

      for (const u of steps) {
        const r = await _ptCall(u, appKey, ac.signal); trace.push({ step:"pt", ...r });
        if (r.verdict !== "unknown") return { verdict: r.verdict, details: r.sample, trace };
      }
      return { verdict: "unknown", details: trace.at(-1)?.sample, trace };
    } finally { clearTimeout(to); }
  }
  globalThis.checkWithPT = checkWithPT;
})();
