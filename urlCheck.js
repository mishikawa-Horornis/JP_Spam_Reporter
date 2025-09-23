globalThis.vtCheckUrl = async function (apiKey, url) {
  // urlCheck.js の POST 部分
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
    try {
      const j = await res.json();
      const m = j?.error?.message || j?.error?.code || j?.message;
      if (m) msg += ` – ${m}`;
    } catch {}
    throw new Error(msg);
  }
  if (!res.ok) throw new Error("VT analyze failed: " + res.status);
  const { data } = await res.json();
  const id = data.id;

  let verdict = "unknown", details = {};
  for (let i = 0; i < 10; i++) {                // 10回に増やす
    await new Promise(r => setTimeout(r, i ? 1500 : 0));
    const r = await fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
      headers: { "x-apikey": apiKey }
    });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 2000)); continue; }
    if (!r.ok) continue;

    const j = await r.json();
    const attr = j.data?.attributes;
    const stats = attr?.stats || {};
    details = { stats, status: attr?.status };

    const mal = +stats.malicious || 0, sus = +stats.suspicious || 0, ok = +stats.harmless || 0;
    if (mal > 0) { verdict = "malicious"; break; }
    if (sus > 0) { verdict = "suspicious"; break; }
    if (ok > 0 && mal === 0 && sus === 0 && attr?.status === "completed") {
      verdict = "harmless"; break;
    }
  }
  return { verdict, details };
};
