// utils/phishing-detect.js
// フィッシングURLの兆候を検出する（強化版）

(function() {
  // 危険なUnicode文字（見た目が似ている文字）
  const SUSPICIOUS_CHARS = {
    '\u2215': '/',  // DIVISION SLASH
    '\u2044': '/',  // FRACTION SLASH
    '\uff0f': '/',  // FULLWIDTH SOLIDUS
    '\u29f8': '/',  // BIG SOLIDUS
    '\u0435': 'e',  // CYRILLIC SMALL LETTER IE
    '\u0430': 'a',  // CYRILLIC SMALL LETTER A
    '\u043e': 'o',  // CYRILLIC SMALL LETTER O
    '\u0440': 'p',  // CYRILLIC SMALL LETTER ER
    '\u0441': 'c',  // CYRILLIC SMALL LETTER ES
    '\u0455': 's',  // CYRILLIC SMALL LETTER DZE
    '\uff0e': '.',  // FULLWIDTH FULL STOP
    '\u2024': '.',  // ONE DOT LEADER
    '\uff1a': ':',  // FULLWIDTH COLON
    '\u02d0': ':',  // MODIFIER LETTER TRIANGULAR COLON
  };

  // 既知の危険ドメイン（中国の無料ホスティングなど）
  const SUSPICIOUS_TLDS = [
    '.cn', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.top', '.xyz', '.icu'
  ];

  // 正規ドメインと似ているドメイン（typosquatting）
  const LEGITIMATE_DOMAINS = {
    'tokyo-gas.co.jp': ['tokyo-gas', 'tokyogas', 'tokyo_gas'],
    'rakuten-card.co.jp': ['rakuten-card', 'rakutencard', 'rakuten_card'],
    'rakuten.co.jp': ['rakuten'],
    'amazon.co.jp': ['amazon', 'amzn', 'amazn'],
    'yahoo.co.jp': ['yahoo', 'yahoо'],
    'google.com': ['google', 'gmail', 'googlе'],
    'microsoft.com': ['microsoft', 'outlook', 'office365'],
    'apple.com': ['apple', 'icloud', 'applе'],
    'nifty.com': ['nifty', 'nifty-serve'],
    'au.com': ['au', 'kddi'],
    'docomo.ne.jp': ['docomo', 'nttdocomo'],
    'softbank.jp': ['softbank'],
    'sagawa-exp.co.jp': ['sagawa', 'sagawa-exp'],
    'yamato-transport.co.jp': ['yamato', 'kuroneko'],
    'post.japanpost.jp': ['japanpost', 'yuubin'],
  };

  /**
   * URLにフィッシングの兆候があるかチェック
   * @param {string} url - チェックするURL
   * @param {Object} emailMeta - メールのメタデータ（オプション）
   * @param {string[]} customWhitelist - ユーザー定義のホワイトリスト（オプション）
   * @returns {Object} { suspicious: boolean, reasons: string[], actualDomain: string, confidence: string, trusted: boolean }
   */
  globalThis.detectPhishing = function detectPhishing(url, emailMeta, customWhitelist = []) {
    const reasons = [];
    let suspicious = false;
    let actualDomain = '';
    let trustedDomain = false;

    // URLの検証
    if (!url || typeof url !== 'string') {
      console.warn('[PhishingDetect] Invalid URL provided:', url);
      return {
        suspicious: false,
        reasons: ['URLが無効です'],
        actualDomain: '',
        confidence: 'low',
        trusted: false
      };
    }

    try {
      // 1. Unicode難読化文字のチェック
      const suspiciousChars = [];
      for (const [char, ascii] of Object.entries(SUSPICIOUS_CHARS)) {
        if (url.includes(char)) {
          suspiciousChars.push(`'${char}' (本来は '${ascii}')`);
          suspicious = true;
        }
      }
      if (suspiciousChars.length > 0) {
        reasons.push(`Unicode難読化文字を使用: ${suspiciousChars.join(', ')}`);
      }

      // 2. @記号によるドメイン偽装のチェック
      const atIndex = url.indexOf('@');
      if (atIndex !== -1) {
        const schemeEndIndex = url.indexOf('://');
        if (schemeEndIndex !== -1 && atIndex > schemeEndIndex + 3) {
          suspicious = true;
          const beforeAt = url.substring(schemeEndIndex + 3, atIndex);
          const afterAt = url.substring(atIndex + 1);
          const domainMatch = afterAt.match(/^([^/]+)/);
          if (domainMatch) {
            actualDomain = domainMatch[1];
            reasons.push(`ドメイン偽装: 見せかけ「${beforeAt}」、実際は「${actualDomain}」`);
          }
        }
      }

      // 3. URLをパースして実際のドメインを取得
      const cleanUrl = url.replace(/[\r\n\t]/g, '');
      const parsed = new URL(cleanUrl);
      const hostname = parsed.hostname.toLowerCase();
      
      if (!actualDomain) {
        actualDomain = hostname;
      }

      // 3.5. 信頼できるドメインかチェック（新機能）
      // trustedDomains.js が読み込まれている場合のみチェック
      if (typeof globalThis.isDomainTrusted === 'function') {
        const trustCheck = globalThis.isDomainTrusted(actualDomain, customWhitelist);
        if (trustCheck.trusted) {
          trustedDomain = true;
          // 信頼できるドメインの場合、フィッシングの疑いを大幅に軽減
          console.log(`[PhishingDetect] Trusted domain detected: ${actualDomain}`, trustCheck);
          
          // 信頼できるドメインでも、明らかな異常がある場合は警告を出す
          if (reasons.length > 0) {
            console.warn(`[PhishingDetect] Trusted domain but has suspicious indicators: ${actualDomain}`, reasons);
          } else {
            // 信頼できるドメインで異常がない場合は、チェックをスキップ
            return {
              suspicious: false,
              reasons: [`信頼できるドメイン: ${trustCheck.info?.name || actualDomain}`],
              actualDomain,
              confidence: 'low',
              trusted: true,
              trustInfo: trustCheck.info
            };
          }
        }
      }

      // 4. 疑わしいTLDのチェック
      for (const tld of SUSPICIOUS_TLDS) {
        if (hostname.endsWith(tld)) {
          suspicious = true;
          reasons.push(`疑わしいTLD: ${tld}`);
          break;
        }
      }

      // 5. Typosquattingのチェック（有名ブランドの模倣）
      for (const [legitimate, patterns] of Object.entries(LEGITIMATE_DOMAINS)) {
        for (const pattern of patterns) {
          if (hostname.includes(pattern) && hostname !== legitimate) {
            const distance = levenshteinDistance(hostname, legitimate);
            if (distance > 0 && distance < 5) {
              suspicious = true;
              reasons.push(`ブランド名の偽装: 「${hostname}」は「${legitimate}」に類似`);
            }
          }
        }
      }

      // 6. 表示名とドメインの不一致をチェック（新機能）
      if (emailMeta && emailMeta.sender) {
        const displayNameCheck = checkDisplayNameMismatch(emailMeta.sender, emailMeta.senderDomain, hostname);
        if (displayNameCheck.suspicious) {
          suspicious = true;
          reasons.push(...displayNameCheck.reasons);
        }
      }

      // 7. 異常に長いドメイン名
      if (hostname.length > 50) {
        suspicious = true;
        reasons.push(`異常に長いドメイン名: ${hostname.length}文字`);
      }

      // 8. サブドメインの異常な深さ
      const parts = hostname.split('.');
      if (parts.length > 5) {
        suspicious = true;
        reasons.push(`サブドメインが深すぎる: ${parts.length}階層`);
      }

      // 9. IPアドレスの使用
      if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        suspicious = true;
        reasons.push('IPアドレスを直接使用');
      }

      // 10. ポート番号の使用（標準以外）
      if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
        suspicious = true;
        reasons.push(`非標準ポート: ${parsed.port}`);
      }

    } catch (e) {
      console.error('[PhishingDetect] Error:', e);
      reasons.push(`URL解析エラー: ${e.message}`);
    }

    return {
      suspicious,
      reasons,
      actualDomain: actualDomain || url,
      confidence: suspicious ? (reasons.length >= 2 ? 'high' : 'medium') : 'low',
      trusted: trustedDomain
    };
  };

  /**
   * 表示名とドメインの不一致をチェック（新機能）
   * @param {string} sender - 送信者の表示名（例: "楽天カード株式会社"）
   * @param {string} senderDomain - 送信者のドメイン（例: "keowmq.com"）
   * @param {string} urlDomain - URLのドメイン（例: "bthoym.com"）
   * @returns {Object} { suspicious: boolean, reasons: string[] }
   */
  function checkDisplayNameMismatch(sender, senderDomain, urlDomain) {
    const reasons = [];
    let suspicious = false;

    // 有名な企業名のリスト
    const wellKnownCompanies = {
      '楽天': ['rakuten.co.jp', 'rakuten-card.co.jp'],
      '東京ガス': ['tokyo-gas.co.jp'],
      'Amazon': ['amazon.co.jp', 'amazon.com'],
      'Yahoo': ['yahoo.co.jp'],
      'Google': ['google.com', 'gmail.com'],
      'Microsoft': ['microsoft.com', 'outlook.com', 'office365.com'],
      'Apple': ['apple.com', 'icloud.com'],
      'au': ['au.com', 'kddi.com'],
      'docomo': ['docomo.ne.jp', 'nttdocomo.co.jp'],
      'Softbank': ['softbank.jp'],
      '佐川': ['sagawa-exp.co.jp'],
      '佐川急便': ['sagawa-exp.co.jp'],
      'ヤマト': ['yamato-transport.co.jp', 'kuronekoyamato.co.jp'],
      'ヤマト運輸': ['yamato-transport.co.jp', 'kuronekoyamato.co.jp'],
      '日本郵便': ['post.japanpost.jp', 'japanpost.jp'],
    };

    // 送信者表示名に有名企業名が含まれているかチェック
    for (const [company, expectedDomains] of Object.entries(wellKnownCompanies)) {
      if (sender.includes(company)) {
        // 送信者ドメインが期待されるドメインではない
        if (!expectedDomains.some(domain => senderDomain.includes(domain))) {
          suspicious = true;
          reasons.push(`表示名「${company}」とドメイン「${senderDomain}」が不一致`);
        }

        // URLドメインも期待されるドメインではない
        if (!expectedDomains.some(domain => urlDomain.includes(domain))) {
          suspicious = true;
          reasons.push(`表示名「${company}」とリンク先「${urlDomain}」が不一致`);
        }
      }
    }

    return { suspicious, reasons };
  }

  /**
   * 混在URLをチェック（新機能）
   * @param {string[]} urls - 全てのURL
   * @param {string} expectedDomain - 期待されるドメイン（メール送信者のドメインなど）
   * @returns {Object} { hasMixedDomains: boolean, externalUrls: string[] }
   */
  globalThis.checkMixedDomains = function checkMixedDomains(urls, expectedDomain) {
    const externalUrls = [];
    let hasMixedDomains = false;

    if (!expectedDomain) {
      return { hasMixedDomains: false, externalUrls: [] };
    }

    try {
      for (const url of urls) {
        const cleanUrl = url.replace(/[\r\n\t]/g, '');
        const parsed = new URL(cleanUrl);
        const hostname = parsed.hostname.toLowerCase();

        // 期待されるドメインと一致しない場合
        if (!hostname.includes(expectedDomain.toLowerCase())) {
          externalUrls.push(url);
          hasMixedDomains = true;
        }
      }
    } catch (e) {
      console.error('[MixedDomains] Error:', e);
    }

    return {
      hasMixedDomains,
      externalUrls,
      count: externalUrls.length,
      total: urls.length
    };
  };

  /**
   * Levenshtein距離を計算（文字列の類似度）
   */
  function levenshteinDistance(s1, s2) {
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[len1][len2];
  }

  console.log('[PhishingDetect] Module loaded');
})();
