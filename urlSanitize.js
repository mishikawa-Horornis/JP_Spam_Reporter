// SPDX-License-Identifier: MIT
// urlSanitize.js — URL抽出後の最低限の正規化＆迷彩解除
// ※ 既存の sanitizeUrl が壊れている環境向けに、同名関数を上書きします。

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
      // hxxp / hxxps → http / https
      .replace(/hxxps?:\/\//ig, m => m.replace("xx","tt"))
      // example[.]com → example.com
      .replace(/\[\.\]/g, ".")
      // 「全角コロン＋スラ」など
      .replace(/：\/\//g, "://")
      // 余計な空白
      .replace(/\s+/g, " ");
  }

  function _canonicalize(u){
    try {
      const url = new URL(u);
      // 追跡系クエリの削除
      const del = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"];
      del.forEach(k => url.searchParams.delete(k));
      url.hash = "";
      url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      // 末尾スラの整理（/ のみはそのまま）
      if (url.pathname !== "/" && url.pathname.endsWith("/")) {
        url.pathname = url.pathname.replace(/\/+$/, "/");
      }
        return url.toString();
    } catch {
      return u;
    }
  }

  // 既存があっても安全に上書き
  globalThis.sanitizeUrl = function sanitizeUrl(raw){
    if (raw == null) return "";
    let u = String(raw).trim();
    u = _stripQuotes(u);
    u = _deobfuscate(u);
    // 「example.com」の裸ドメインは URL として扱えないので http を補う（任意）
    if (!/^https?:\/\//i.test(u) && /^[a-z0-9\-\.]+\.[a-z]{2,}(?:\/|$)/i.test(u)) {
      u = "http://" + u;
    }
    return _canonicalize(u);
  };
})();
