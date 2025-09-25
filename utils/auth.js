// SPDX-License-Identifier: MIT
// utils/auth.js
// Authentication-Results をざっくり解析して {spf, dkim, dmarc} を返す簡易版
(function (global) {
  function parseAuthResults(full) {
    // Thunderbird messages.getFull() のヘッダから取り出す
    const header = getHeader(full, "authentication-results") || "";
    const pick = (name) =>
      (header.match(new RegExp(`${name}\\s*=\\s*(pass|fail|none|neutral|temperror|permerror)`, "i"))?.[1] || "none").toLowerCase();
    return { spf: pick("spf"), dkim: pick("dkim"), dmarc: pick("dmarc") };
  }

  function getHeader(full, name) {
    try {
      return (full.headers?.[name] ?? full.headers?.[name.toLowerCase()] ?? [])[0] || "";
    } catch { return ""; }
  }

  // 🔴 グローバルへ公開（ここが重要）
  global.parseAuthResults = parseAuthResults;
})(this);
