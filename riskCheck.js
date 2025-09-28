// SPDX-License-Identifier: MIT
// riskCheck.js — GSB/PT の最小実装を**末尾に追記**して、既存実装が壊れていても動くようにする

(function(){
  // ===== Google Safe Browsing minimal =====
  const _GSB_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find?key=";
  const _GSB_CLIENT = { clientId: "jp-spam-checker", clientVersion: "2.0.0" };

  async function gsbLookupMinimal(urls, apiKey, { timeoutMs = 10000 } = {}) {
    if (!apiKey) throw new Error("GSB API key is empty.");
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    if (list.length === 0) return [];

    const body = {
      client: _GSB_CLIENT,
      threatInfo: {
        threatTypes: [
          "MALWARE",
          "SOCIAL_ENGINEERING",
          "UNWANTED_SOFTWARE",
          "POTENTIALLY_HARMFUL_APPLICATION"
        ],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: list.map(u => ({ url: u }))
      }
    };

    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(_GSB_ENDPOINT + encodeURIComponent(apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`GSB HTTP ${r.status}: ${t}`);
      }
      const j = await r.json().catch(() => ({}));
      return j?.matches ?? []; // 空配列 = 安全
    } finally {
      clearTimeout(to);
    }
   }

   // 既存がある場合でも安全に露出
   if (typeof globalThis.gsbLookupMinimal !== "function") {
     globalThis.gsbLookupMinimal = gsbLookupMinimal;
   }
   if (typeof globalThis.isUrlUnsafeMinimal !== "function") {
     globalThis.isUrlUnsafeMinimal = async (url, apiKey) => (await gsbLookupMinimal(url, apiKey)).length > 0;
   }

   // ===== PhishTank minimal =====
   async function ptLookupMinimal(url, appKey, { timeoutMs = 10000 } = {}) {
     const ac = new AbortController();
     const to = setTimeout(() => ac.abort(), timeoutMs);
     try {
       const form = new URLSearchParams();
       form.set("url", url);
       form.set("format", "json");
       if (appKey) form.set("app_key", appKey);

       const r = await fetch("https://checkurl.phishtank.com/checkurl/", {
         method: "POST",
         headers: { "Content-Type": "application/x-www-form-urlencoded" },
         body: form.toString(),
         signal: ac.signal
       });
       const j = await r.json().catch(() => ({}));
       const res = j?.results || {};
       if (res.in_database === true) {
         if (res.verified === true && res.valid === true) return { verdict: "phish", detail: res };
         if (res.verified === true && res.valid === false) return { verdict: "safe",  detail: res };
         return { verdict: "unknown", detail: res };
       }
       return { verdict: "unknown", detail: res };
     } finally {
       clearTimeout(to);
     }
   }

   if (typeof globalThis.ptLookupMinimal !== "function") {
     globalThis.ptLookupMinimal = ptLookupMinimal;
   }

   // ===== 高レベルヘルパ（sanitize/expand/canonicalize が既存にあれば利用） =====
   globalThis.checkWithPhishTank = async function(rawUrl, appKey, opts = {}) {
     const sanitize = globalThis.sanitizeUrl || (x => String(x||"").trim());
     const expand   = globalThis.expandUrl   || (async x => x);
     const canonize = globalThis.canonicalize || (u => {
       try {
         const url = new URL(u); url.hash = ""; url.hostname = url.hostname.toLowerCase();
         const p = url.searchParams;
         ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach(k => p.delete(k));
         url.search = p.toString() ? "?" + p.toString() : "";
         if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "/");
         return url.toString();
       } catch { return u; }
     });

     const s1 = sanitize(rawUrl);
     const finalUrl = await expand(s1);
     const canon = canonize(finalUrl);

     let r = await ptLookupMinimal(canon, appKey, opts);
     if (r.verdict !== "unknown") return r;

    // ヒット率アップ：クエリ除去
     try {
       const noQ = canon.split("?")[0];
       if (noQ && noQ !== canon) {
         r = await ptLookupMinimal(noQ, appKey, opts);
         if (r.verdict !== "unknown") return r;
       }
     } catch {}

     // パス短縮
     try {
       const u = new URL(canon);
       const parts = u.pathname.split("/").filter(Boolean);
       while (r.verdict === "unknown" && parts.length > 0) {
         parts.pop();
         u.pathname = "/" + parts.join("/") + (parts.length ? "/" : "");
         u.search = "";
         r = await ptLookupMinimal(u.toString(), appKey, opts);
       }
     } catch {}

     return r;
   };
})();