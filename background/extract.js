// background/extract.js
// メールからURL抽出 & メタデータ抽出（正しいURL処理版）

(function() {
  /**
   * quoted-printableの継続（行末の=）と通常の改行を処理
   * @param {string} text - 処理対象のテキスト
   * @returns {string} - 処理後のテキスト
   */
  function unquoteQuotedPrintable(text) {
    // quoted-printableの行継続（=\r\n または =\n）を削除
    let result = text.replace(/=\r?\n/g, '');
    // HTMLのhref内の通常の改行も削除（URLが複数行にまたがっている場合）
    result = result.replace(/href\s*=\s*["']([^"']*?)["']/gi, (match, url) => {
      // URL内の改行とスペースを削除
      const cleanUrl = url.replace(/\r?\n/g, '').replace(/\s+/g, '');
      return `href="${cleanUrl}"`;
    });
    return result;
  }

  /**
   * quoted-printableエンコーディングをデコード（=XX形式）
   * @param {string} text - デコード対象のテキスト
   * @returns {string} - デコード後のテキスト
   */
  function decodeQuotedPrintable(text) {
    if (!text) return '';
    
    try {
      // quoted-printableエンコーディング（=3D など）をデコード
      let decoded = text.replace(/=([0-9A-F]{2})/gi, (_, hex) => {
        const charCode = parseInt(hex, 16);
        return String.fromCharCode(charCode);
      });
      
      return decoded;
    } catch (e) {
      console.error('[Extract] Error decoding quoted-printable:', e);
      return text;
    }
  }

  /**
   * URLエンコーディングをデコード（%XX形式）
   * @param {string} text - デコード対象のテキスト
   * @returns {string} - デコード後のテキスト
   */
  function decodeUrlEncoding(text) {
    if (!text) return '';
    
    try {
      // %E2%88%95 のようなUTF-8バイトシーケンスをデコード
      let decoded = text;
      
      // UTF-8の3バイトシーケンスを手動でデコード
      // %E2%88%95 は "∕"（division slash, U+2215）
      decoded = decoded.replace(/%E2%88%95/gi, '/');
      
      // その他の一般的なエンコーディング
      decoded = decoded.replace(/%2F/gi, '/');   // スラッシュ
      decoded = decoded.replace(/%3A/gi, ':');   // コロン
      decoded = decoded.replace(/%3F/gi, '?');   // クエスチョンマーク
      decoded = decoded.replace(/%3D/gi, '=');   // イコール
      decoded = decoded.replace(/%26/gi, '&');   // アンパサンド
      
      // 残りのエンコーディングを試みる（エラーが出ても続行）
      try {
        decoded = decodeURIComponent(decoded);
      } catch (e) {
        // 不正なURLエンコーディングの場合はスキップ
        console.warn('[Extract] Could not fully decode URL encoding:', e.message);
      }
      
      return decoded;
    } catch (e) {
      console.error('[Extract] Error decoding URL encoding:', e);
      return text;
    }
  }

  /**
   * 特殊文字を正規化
   * @param {string} text - 正規化対象のテキスト
   * @returns {string} - 正規化後のテキスト
   */
  function normalizeSpecialChars(text) {
    if (!text) return '';
    
    // Unicode の除算スラッシュやその他のスラッシュ類を通常のスラッシュに変換
    let normalized = text;
    
    // 様々なスラッシュを通常のスラッシュに統一
    normalized = normalized.replace(/∕/g, '/');    // U+2215 Division Slash
    normalized = normalized.replace(/⁄/g, '/');    // U+2044 Fraction Slash
    normalized = normalized.replace(/／/g, '/');   // U+FF0F Fullwidth Solidus
    normalized = normalized.replace(/＼/g, '/');   // U+FF3C Fullwidth Reverse Solidus
    
    return normalized;
  }

  /**
   * @を含むURLから実際のアクセス先ドメインを抽出
   * @param {string} url - 解析対象のURL
   * @returns {Object} { fullUrl, actualDomain, isDangerous, warning }
   */
  function analyzeAtInUrl(url) {
    if (!url || !url.includes('@')) {
      return { fullUrl: url, actualDomain: null, isDangerous: false, warning: null };
    }

    try {
      // URLの @ の位置を特定
      // https://fake.com/path@real.com/more の形式
      const atIndex = url.indexOf('@');
      const beforeAt = url.substring(0, atIndex);
      const afterAt = url.substring(atIndex + 1);
      
      // @の後からドメイン部分を抽出
      // real.com/more → real.com
      const domainMatch = afterAt.match(/^([^\/\?#:]+)/);
      const actualDomain = domainMatch ? domainMatch[1] : afterAt;
      
      // @の前の部分からドメインを抽出（偽装されている可能性）
      const fakeUrlMatch = beforeAt.match(/^https?:\/\/([^\/]+)/);
      const fakeDomain = fakeUrlMatch ? fakeUrlMatch[1] : null;
      
      console.log('[Extract] Analyzing @ in URL:');
      console.log('[Extract] - Full URL:', url);
      console.log('[Extract] - Before @:', beforeAt);
      console.log('[Extract] - After @:', afterAt);
      console.log('[Extract] - Fake domain (display):', fakeDomain);
      console.log('[Extract] - Actual domain (access):', actualDomain);
      
      // 警告メッセージ
      const warning = fakeDomain 
        ? `⚠️ 偽装URL検出: 表示は「${fakeDomain}」ですが、実際のアクセス先は「${actualDomain}」です`
        : `⚠️ @記号を含むURL: 実際のアクセス先は「${actualDomain}」です`;
      
      return {
        fullUrl: url,
        actualDomain: actualDomain,
        fakeDomain: fakeDomain,
        isDangerous: true,
        warning: warning
      };
    } catch (e) {
      console.error('[Extract] Error analyzing @ in URL:', e);
      return {
        fullUrl: url,
        actualDomain: null,
        isDangerous: true,
        warning: '⚠️ 不正な形式のURLです'
      };
    }
  }

  /**
   * URLをクリーンアップ（デコードと基本的な整形のみ）
   * @param {string} url - クリーンアップ対象のURL
   * @returns {string} - クリーンアップ後のURL
   */
  function cleanupUrl(url) {
    if (!url) return '';
    
    try {
      console.log('[Extract] Cleaning URL:', url.substring(0, 100));
      
      // ステップ1: quoted-printableをデコード
      let cleaned = decodeQuotedPrintable(url);
      console.log('[Extract] After quoted-printable decode:', cleaned.substring(0, 100));
      
      // ステップ2: URLエンコーディングをデコード
      cleaned = decodeUrlEncoding(cleaned);
      console.log('[Extract] After URL decode:', cleaned.substring(0, 100));
      
      // ステップ3: 特殊文字を正規化
      cleaned = normalizeSpecialChars(cleaned);
      console.log('[Extract] After normalize:', cleaned.substring(0, 100));
      
      // ステップ4: 改行やスペースを削除
      cleaned = cleaned.replace(/\r?\n/g, '').replace(/\s+/g, '');
      
      // ステップ5: 3D という文字列を = に変換（quoted-printableの残骸）
      cleaned = cleaned.replace(/3D=/g, '=');
      cleaned = cleaned.replace(/=3D/g, '=');
      
      // ステップ6: 末尾の不要な文字を削除
      cleaned = cleaned.replace(/[<>"{}|\\^`\s]+$/g, '');
      
      // ★重要: @を含むURLはそのまま保持（削除しない）
      console.log('[Extract] Final cleaned URL:', cleaned);
      
      return cleaned;
    } catch (e) {
      console.error('[Extract] Error cleaning URL:', e);
      return url;
    }
  }

  /**
   * HTMLからURLを抽出（改善版）
   * @param {string} html - HTMLテキスト
   * @returns {Array<Object>} - 抽出されたURLオブジェクトの配列
   */
  function extractUrlsFromHtml(html) {
    const urls = [];
    
    try {
      // まず改行を処理
      const processedHtml = unquoteQuotedPrintable(html);
      
      console.log('[Extract] Processing HTML for URLs...');
      
      // href属性からURLを抽出（quoted-printableを考慮）
      // href="..." または href='...' または href=3D"..." の形式に対応
      const hrefPattern = /href\s*=\s*(?:3D)?["']([^"']+)["']/gi;
      let match;
      let matchCount = 0;
      
      while ((match = hrefPattern.exec(processedHtml)) !== null) {
        matchCount++;
        let url = match[1];
        
        console.log(`[Extract] Found href match ${matchCount}:`, url.substring(0, 100));
        
        // URLをクリーンアップ
        url = cleanupUrl(url);
        
        console.log(`[Extract] After cleanup:`, url.substring(0, 100));
        
        // http:// または https:// で始まるURLのみを抽出
        if (url.match(/^https?:\/\//i)) {
          // @を含むURLの分析
          const analysis = analyzeAtInUrl(url);
          urls.push(analysis);
          console.log('[Extract] ✓ Valid URL added');
        } else {
          console.log('[Extract] ✗ Invalid URL (no http/https), skipped');
        }
      }
      
      console.log(`[Extract] Found ${urls.length} URLs in HTML`);
    } catch (e) {
      console.error('[Extract] Error extracting URLs from HTML:', e);
    }
    
    return urls;
  }

  /**
   * メールメッセージからURLを抽出（改良版）
   */
  globalThis.extractUrlsFromMessage = async function(messageId) {
    console.log('[Extract] ==========================================');
    console.log('[Extract] Starting URL extraction for message:', messageId);
    
    try {
      const full = await browser.messages.getFull(messageId);
      const urlObjects = []; // URLオブジェクトの配列
      
      function walk(part, depth = 0) {
        const indent = '  '.repeat(depth);
        console.log(`${indent}[Extract] Processing part:`, part.contentType);
        
        if (part.contentType && part.contentType.startsWith("text/")) {
          let body = part.body || "";
          console.log(`${indent}[Extract] Body length:`, body.length);
          
          // HTMLの場合はhref属性からも抽出（改行を含むURLに対応）
          if (part.contentType.includes("html")) {
            console.log(`${indent}[Extract] Processing HTML content...`);
            const htmlUrlObjs = extractUrlsFromHtml(body);
            console.log(`${indent}[Extract] Found ${htmlUrlObjs.length} URLs in HTML`);
            urlObjects.push(...htmlUrlObjs);
          }
          
          // quoted-printableの継続を処理
          body = unquoteQuotedPrintable(body);
          
          // 通常のURLパターンにマッチ（改行を考慮）
          const cleanBody = body.replace(/\r?\n/g, ' ');
          const pattern = /https?:\/\/[^\s<>"]+/gi;
          const found = cleanBody.match(pattern) || [];
          console.log(`${indent}[Extract] Found ${found.length} URLs with pattern matching`);
          
          // パターンマッチで見つかったURLもクリーンアップして分析
          found.forEach(u => {
            const cleaned = cleanupUrl(u);
            const analysis = analyzeAtInUrl(cleaned);
            urlObjects.push(analysis);
          });
        }
        
        if (part.parts) {
          console.log(`${indent}[Extract] Processing ${part.parts.length} sub-parts...`);
          part.parts.forEach((subPart, index) => {
            walk(subPart, depth + 1);
          });
        }
      }
      
      walk(full);
      
      console.log('[Extract] Total URL objects found before deduplication:', urlObjects.length);
      
      // 重複除去（fullUrlベース）
      const seen = new Set();
      const uniqueUrlObjects = urlObjects.filter(obj => {
        if (!obj || !obj.fullUrl) return false;
        
        // sanitizeUrlがあれば使用
        let url = obj.fullUrl;
        if (typeof globalThis.sanitizeUrl === "function") {
          url = globalThis.sanitizeUrl(url);
          obj.fullUrl = url;
        }
        
        // 短すぎるURLをスキップ
        if (url.length < 10) {
          console.log('[Extract] ✗ URL is too short, skipped:', url);
          return false;
        }
        
        // URL形式の検証
        try {
          new URL(url);
        } catch (e) {
          console.log('[Extract] ✗ Invalid URL format, skipped:', url);
          return false;
        }
        
        // 重複チェック
        if (seen.has(url)) {
          return false;
        }
        seen.add(url);
        
        return true;
      });
      
      console.log('[Extract] ==========================================');
      console.log('[Extract] Final result: Extracted', uniqueUrlObjects.length, 'unique valid URLs');
      uniqueUrlObjects.forEach((obj, index) => {
        console.log(`[Extract] ${index + 1}: ${obj.fullUrl}`);
        if (obj.isDangerous) {
          console.log(`[Extract]    ${obj.warning}`);
          console.log(`[Extract]    実際のアクセス先: ${obj.actualDomain}`);
        }
      });
      console.log('[Extract] ==========================================');
      
      // 従来の互換性のため、URLの文字列配列を返す
      // ただし、警告情報も保持するため、グローバル変数に保存
      globalThis._lastExtractedUrlDetails = uniqueUrlObjects;
      
      return uniqueUrlObjects.map(obj => obj.fullUrl);
    } catch (e) {
      console.error("[Extract] Error extracting URLs:", e);
      console.error("[Extract] Error stack:", e.stack);
      return [];
    }
  };

  /**
   * 最後に抽出したURLの詳細情報を取得
   * @returns {Array<Object>} URLオブジェクトの配列
   */
  globalThis.getLastExtractedUrlDetails = function() {
    return globalThis._lastExtractedUrlDetails || [];
  };

  /**
   * メールメッセージからメタデータを抽出（新機能）
   * @param {number} messageId - メッセージID
   * @returns {Object} { sender, senderDomain, senderEmail, subject, date, headers }
   */
  globalThis.getMessageMetadata = async function(messageId) {
    try {
      const msg = await browser.messages.get(messageId);
      const full = await browser.messages.getFull(messageId);
      
      // 送信者情報を解析
      const author = msg.author || '';
      let sender = '';
      let senderEmail = '';
      let senderDomain = '';
      
      // "表示名 <email@domain.com>" 形式を解析
      const match = author.match(/^(.+?)\s*<([^>]+)>$/);
      if (match) {
        sender = match[1].trim();
        senderEmail = match[2].trim();
      } else {
        senderEmail = author.trim();
      }
      
      // ドメインを抽出
      const emailMatch = senderEmail.match(/@([^@]+)$/);
      if (emailMatch) {
        senderDomain = emailMatch[1].toLowerCase();
      }
      
      // Return-Pathからも確認
      const returnPath = full.headers && full.headers['return-path'] ? full.headers['return-path'][0] : '';
      let returnPathDomain = '';
      if (returnPath) {
        const rpMatch = returnPath.match(/@([^>]+)>?$/);
        if (rpMatch) {
          returnPathDomain = rpMatch[1].toLowerCase();
        }
      }
      
      return {
        sender: sender || senderEmail,
        senderEmail: senderEmail,
        senderDomain: senderDomain,
        returnPathDomain: returnPathDomain,
        subject: msg.subject || '',
        date: msg.date || null,
        headers: full.headers || {}
      };
    } catch (e) {
      console.error("[Extract] Error extracting metadata:", e);
      return {
        sender: '',
        senderEmail: '',
        senderDomain: '',
        returnPathDomain: '',
        subject: '',
        date: null,
        headers: {}
      };
    }
  };

  /**
   * メッセージの生データを取得（タイムアウト付き）
   * @param {number} messageId - メッセージID
   * @returns {Object} {success: boolean, raw: string|null, error: string|null}
   */
  globalThis.getMessageRaw = async function(messageId) {
    try {
      console.log("[Extract] Getting raw message data for ID:", messageId);
      
      // タイムアウト処理を追加（20秒）
      const timeout = 20000;
      const raw = await Promise.race([
        browser.messages.getRaw(messageId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getRaw() timeout after 20 seconds')), timeout)
        )
      ]);
      
      console.log("[Extract] Raw message data retrieved, size:", raw.length, "bytes");
      
      // サイズチェック（警告のみ）
      const maxRecommendedSize = 10 * 1024 * 1024; // 10MB
      if (raw.length > maxRecommendedSize) {
        const sizeMB = (raw.length / 1024 / 1024).toFixed(2);
        console.warn("[Extract] WARNING: Large message detected:", sizeMB, "MB");
      }
      
      return { success: true, raw: raw };
    } catch (e) {
      console.error("[Extract] Error getting raw message:", e);
      return { 
        success: false, 
        raw: null, 
        error: String(e),
        isTimeout: e.message && e.message.includes('timeout')
      };
    }
  };

  console.log("[Extract] Module loaded with correct @ handling and URL encoding support");
})();
