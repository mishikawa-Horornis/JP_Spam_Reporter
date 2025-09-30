// background/extract.js
(function(){
  async function extractUrlsFromMessage(messageId) {
    const full = await browser.messages.getFull(messageId).catch(()=>null);
    if (!full?.parts) return [];
    const urls = new Set(), stack = [...full.parts];
    while (stack.length) {
      const p = stack.pop(); if (!p) continue;
      if (p.parts?.length) { stack.push(...p.parts); continue; }
      const ct = (p.contentType||"").toLowerCase(); const body = p.body || "";
      if (ct.includes("text/html")) {
        try {
          const doc = new DOMParser().parseFromString(body, "text/html");
          doc.querySelectorAll("a[href]").forEach(a => urls.add(a.getAttribute("href")));
          (doc.body.textContent.match(/https?:\/\/[^\s<>"']+/gi)||[]).forEach(u => urls.add(u));
          (doc.body.textContent.match(/\b[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?/gi)||[])
            .forEach(u => { if(!/^https?:\/\//i.test(u)) urls.add("http://"+u); });
        } catch {}
      } else {
        (body.match(/https?:\/\/[^\s<>"']+/gi)||[]).forEach(u => urls.add(u));
      }
    }
    const out = [];
    for (const raw of urls) {
      const s = (globalThis.sanitizeUrl ? globalThis.sanitizeUrl(raw) : String(raw||"").trim());
      if (s && /^https?:\/\//i.test(s)) out.push(s);
    }
    return out;
  }
  globalThis.extractUrlsFromMessage = extractUrlsFromMessage;
})();
