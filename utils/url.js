// ===== 短縮URL展開ユーティリティ =====
// 使い方: const finalUrl = await expandUrl(url);

const _expandCache = new Map();

/**
 * 短縮URLを可能な限り展開して最終URLを返す。
 * - 3xx Location を最大 maxRedirects 回追跡
 * - まず HEAD、必要なら GET(redirect: 'manual') で追跡
 * - 失敗時は元URLを返す（落ちない設計）
 */
async function expandUrl(input, { maxRedirects = 6, timeoutMs = 10000 } = {}) {
  try {
    // 非HTTP(S)はそのまま返す
    const u0 = new URL(input);
    if (!/^https?:$/i.test(u0.protocol)) return input;

    // キャッシュ
    if (_expandCache.has(input)) return _expandCache.get(input);

    let current = input;

    for (let i = 0; i < maxRedirects; i++) {
      // 1) HEAD で Location を見る（多くの短縮系に効く）
      const r1 = await _fetchWithTimeout(current, {
        method: "HEAD",
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }, timeoutMs);

      const loc1 = r1.headers.get("location");
      if (loc1 && r1.status >= 300 && r1.status < 400) {
        const next = new URL(loc1, current).toString();
        if (next === current) break;
        current = next;
        continue;
      }

      // 2) 一部サービスは GET でのみリダイレクト
      const r2 = await _fetchWithTimeout(current, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }, timeoutMs);

      const loc2 = r2.headers.get("location");
      if (loc2 && r2.status >= 300 && r2.status < 400) {
        const next = new URL(loc2, current).toString();
        if (next === current) break;
        current = next;
        continue;
      }

      // 3) ここまで来たら終了（200系等）
      break;
    }

    _expandCache.set(input, current);
    return current;
  } catch (e) {
    console.warn("expandUrl failed:", e);
    return input; // 失敗しても元URLを返す
  }
}

function _fetchWithTimeout(url, opts, ms) {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}
