// SPDX-License-Identifier: MIT
// どこからでも呼べるように globalThis に公開
globalThis.vtCheckUrl = async function (apiKey, url) {
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
  const id = data.data.id;

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
};
