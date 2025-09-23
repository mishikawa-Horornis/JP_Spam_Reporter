// urlSanitize.js などに置いて、背景で読み込み（manifest の background.scripts に追加）
function sanitizeUrl(raw) {
  if (!raw) return "";

  let u = String(raw).trim();

  // よくある囲い文字・引用符
  if ((u.startsWith("<") && u.endsWith(">")) || (u.startsWith('"') && u.endsWith('"')) || (u.startsWith("'") && u.endsWith("'"))) {
    u = u.slice(1, -1);
  }

  // 迷彩の除去（必要に応じて調整）
  u = u
    .replace(/hxxps?:\/\//i, (m) => m.replace("xx", "tt"))  // hxxp → http
    .replace(/\[\.\]/g, ".")                                // example[.]com → example.com
    .replace(/\(dot\)/gi, ".")
    .replace(/\\+/g, "/");                                  // バックスラッシュ → スラッシュ

  // 周囲/中の空白・改行・ゼロ幅文字
  u = u.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "");

  // スキーム補正（//example.com → https://example.com）
  if (/^\/\//.test(u)) u = "https:" + u;

  // 非 http(s) は対象外
  if (!/^https?:\/\//i.test(u)) return "";

  // フラグメント（#...）は解析に無意味なので切る
  const hashIdx = u.indexOf("#");
  if (hashIdx > -1) u = u.slice(0, hashIdx);

  // URL オブジェクトで正規化（IDNは自動で punycode 化）
  try {
    const urlObj = new URL(u);
    // 余計な空白や未エンコードを encode
    urlObj.pathname = encodeURI(decodeURI(urlObj.pathname));
    urlObj.search   = urlObj.search ? "?" + new URLSearchParams(urlObj.search.slice(1)).toString() : "";
    return urlObj.toString();
  } catch {
    return "";
  }
}
