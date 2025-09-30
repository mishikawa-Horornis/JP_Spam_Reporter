// utils/sanitize.js (MV2: グローバル公開)
(function(){
  function _stripQuotes(u){
    if (!u || typeof u !== "string") return u;
    u = u.trim();
    if ((u.startsWith("<") && u.endsWith(">")) ||
        (u.startsWith('"') && u.endsWith('"')) ||
        (u.startsWith("'") && u.endsWith("'"))) {
      return u.slice(1, -1);
    }
    return u;
  }
  function _deobfuscate(u){
    return u
      .replace(/hxxps?:\/\//ig, m => m.replace("xx","tt"))
      .replace(/\[\.\]/g, ".")
      .replace(/：\/\//g, "://")
      .replace(/\s+/g, " ");
  }
  function _canonicalize(u){
    try {
      const url = new URL(u);
      const del = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"];
      del.forEach(k => url.searchParams.delete(k));
      url.hash = "";
      url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      if (url.pathname !== "/" && url.pathname.endsWith("/")) {
        url.pathname = url.pathname.replace(/\/+$/, "/");
      }
      return url.toString();
    } catch { return u; }
  }
  globalThis.sanitizeUrl = function sanitizeUrl(raw){
    if (raw == null) return "";
    let u = String(raw).trim();
    u = _stripQuotes(u);
    u = _deobfuscate(u);
    if (!/^https?:\/\//i.test(u) && /^[a-z0-9\-\.]+\.[a-z]{2,}(?:\/|$)/i.test(u)) {
      u = "http://" + u;
    }
    return _canonicalize(u);
  };
})();
