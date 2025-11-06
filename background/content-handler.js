// background/content-handler.js
// コンテンツスクリプトとの通信を処理（修正版）

// チェック結果を保持
let currentCheckResult = null;

// メールチェック機能
async function performEmailCheck(messageId) {
  console.log('[ContentHandler] Starting email check for message:', messageId);
  
  try {
    // メッセージを取得
    const message = await browser.messages.get(messageId);
    if (!message) {
      throw new Error('メッセージが見つかりません');
    }

    // メールのフルコンテンツを取得
    const fullMessage = await browser.messages.getFull(messageId);
    
    // URLを抽出（グローバル関数を使用）
    let urls = [];
    if (typeof globalThis.extractUrlsFromMessage === 'function') {
      urls = await globalThis.extractUrlsFromMessage(messageId);
    }
    console.log('[ContentHandler] Extracted URLs:', urls.length);

    // メールのメタデータを取得
    const emailMeta = {
      from: message.author,
      subject: message.subject,
      date: message.date,
      displayName: extractDisplayName(message.author),
      fromDomain: extractDomain(message.author),
      returnPath: extractReturnPath(fullMessage),
      spfResult: extractSPFResult(fullMessage),
      dkimResult: extractDKIMResult(fullMessage)
    };

    // 設定を取得
    const checkMode = await getSetting('checkMode') || 'vt';
    const apiKey = await getApiKey(checkMode);
    
    if (!apiKey) {
      throw new Error(`APIキーが設定されていません (${checkMode.toUpperCase()})`);
    }

    // URLチェック実行
    let checkResults = { summary: { malicious: 0, suspicious: 0, harmless: 0, unknown: 0 }, details: [] };
    
    if (urls.length > 0) {
      switch (checkMode) {
        case 'vt':
          checkResults = await checkUrlsWithVirusTotal(urls, apiKey);
          break;
        case 'gsb':
          checkResults = await checkUrlsWithGoogleSafeBrowsing(urls, apiKey);
          break;
        case 'pt':
          checkResults = await checkUrlsWithPhishTank(urls, apiKey);
          break;
      }
    }

    // フィッシング検出（追加チェック）
    const phishingCheck = await analyzePhishingIndicators(emailMeta, urls);

    // 危険判定
    const isDangerous = checkResults.summary.malicious > 0 || 
                        phishingCheck.riskLevel === 'high';
    const isSuspicious = checkResults.summary.suspicious > 0 || 
                         phishingCheck.riskLevel === 'medium';

    // .emlファイルを事前作成
    const emlFile = await makeEmlFile(messageId);

    // 結果を保存
    currentCheckResult = {
      messageId: messageId,
      urls: urls,
      summary: checkResults.summary,
      details: checkResults.details,
      emailMeta: emailMeta,
      phishingCheck: phishingCheck,
      isDangerous: isDangerous,
      isSuspicious: isSuspicious,
      emlFile: emlFile,
      timestamp: new Date().toISOString()
    };

    console.log('[ContentHandler] Check completed:', currentCheckResult);
    return currentCheckResult;

  } catch (error) {
    console.error('[ContentHandler] Check failed:', error);
    throw error;
  }
}

// 報告メール作成機能（修正版）
async function createReportEmail(checkResult) {
  console.log('[ContentHandler] Creating report email');
  
  try {
    if (!checkResult) {
      throw new Error('チェック結果がありません');
    }

    // 報告先を設定から取得
    const reportToAntiPhishing = await getSetting('reportToAntiPhishing') !== false;
    const reportToDekyo = await getSetting('reportToDekyo') !== false;
    const attachEml = await getSetting('attachEml') !== false;

    // 宛先リスト
    const recipients = [];
    if (reportToAntiPhishing) {
      recipients.push('info@antiphishing.jp');
    }
    if (reportToDekyo) {
      recipients.push('meiwaku@dekyo.or.jp');
    }

    if (recipients.length === 0) {
      throw new Error('報告先が選択されていません');
    }

    // 報告メールの本文を作成
    const reportBody = createReportBody(checkResult);

    // Compose APIでメール作成
    const composeDetails = {
      to: recipients,
      subject: `[迷惑メール報告] ${checkResult.emailMeta.subject || '(無題)'}`,
      isPlainText: false,
      body: reportBody
    };

    console.log('[ContentHandler] Creating compose window...');
    
    // まず添付ファイルなしでメールを作成
    const composeTab = await browser.compose.beginNew(composeDetails);
    console.log('[ContentHandler] Compose window created, tab ID:', composeTab.id);
    
    // 添付ファイル付きでメール作成を試行
    if (attachEml && checkResult.emlFile) {
      try {
        const filename = `suspicious_email_${Date.now()}.eml`;
        
        // Compose windowが完全に準備されるまで待機
        console.log('[ContentHandler] Waiting for compose window to be ready...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Compose windowの状態を確認
        let composeReady = false;
        let retries = 0;
        const maxRetries = 5;
        
        while (!composeReady && retries < maxRetries) {
          try {
            await browser.compose.getComposeDetails(composeTab.id);
            console.log('[ContentHandler] Compose window verified (attempt', retries + 1, ')');
            composeReady = true;
          } catch (e) {
            retries++;
            console.warn('[ContentHandler] Compose window not ready (attempt', retries, '):', e.message);
            if (retries < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }
        
        if (!composeReady) {
          throw new Error('Compose windowの準備が完了しませんでした');
        }
        
        // FileオブジェクトまたはBlobを準備
        let attachmentFile;
        if (checkResult.emlFile instanceof File) {
          attachmentFile = checkResult.emlFile;
        } else if (checkResult.emlFile instanceof Blob) {
          attachmentFile = new File([checkResult.emlFile], filename, { 
            type: 'message/rfc822' 
          });
        } else {
          throw new Error('無効なemlファイル形式');
        }
        
        console.log('[ContentHandler] Attempting to add attachment...');
        console.log('[ContentHandler] File size:', attachmentFile.size, 'bytes');
        console.log('[ContentHandler] File name:', attachmentFile.name);
        
        // 添付ファイルを追加（タイムアウト付き）
        await Promise.race([
          browser.compose.addAttachment(composeTab.id, {
            file: attachmentFile,
            name: filename
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('添付処理がタイムアウトしました')), 30000)
          )
        ]);
        
        console.log('[ContentHandler] Attachment added successfully');
        
      } catch (attachError) {
        console.error('[ContentHandler] Failed to add attachment:', attachError);
        console.error('[ContentHandler] Error type:', attachError.name);
        console.error('[ContentHandler] Error message:', attachError.message);
        
        // エラーメッセージを本文に追加
        const errorBody = composeDetails.body + 
          `<br><hr><p style="color: red;"><strong>注意：EMLファイルの添付に失敗しました。</strong></p>` +
          `<p style="color: #666;"><small>エラー: ${escapeHtml(attachError.message)}</small></p>` +
          `<p style="color: #666;"><small>手動でメールを添付してください。</small></p>`;
        
        // 本文を更新
        try {
          await browser.compose.setComposeDetails(composeTab.id, { body: errorBody });
        } catch (updateError) {
          console.error('[ContentHandler] Failed to update compose body:', updateError);
        }
      }
    }
    
    console.log('[ContentHandler] Report email created successfully');
    return { success: true };

  } catch (error) {
    console.error('[ContentHandler] Report creation failed:', error);
    throw error;
  }
}

// 報告メール本文の作成
function createReportBody(checkResult) {
  const now = new Date().toLocaleString('ja-JP');
  
  let body = `<html><body style="font-family: sans-serif;">`;
  body += `<h3>迷惑メール・フィッシングメール報告</h3>`;
  body += `<p>報告日時: ${now}</p>`;
  
  body += `<h4>■ メール情報</h4>`;
  body += `<table border="1" cellpadding="5" cellspacing="0">`;
  body += `<tr><th>送信者</th><td>${escapeHtml(checkResult.emailMeta.from)}</td></tr>`;
  body += `<tr><th>件名</th><td>${escapeHtml(checkResult.emailMeta.subject)}</td></tr>`;
  body += `<tr><th>日時</th><td>${checkResult.emailMeta.date}</td></tr>`;
  body += `</table>`;

  if (checkResult.summary && (checkResult.summary.malicious > 0 || checkResult.summary.suspicious > 0)) {
    body += `<h4>■ 検出結果</h4>`;
    body += `<ul>`;
    if (checkResult.summary.malicious > 0) {
      body += `<li style="color: red;"><strong>悪意のあるURL: ${checkResult.summary.malicious}件</strong></li>`;
    }
    if (checkResult.summary.suspicious > 0) {
      body += `<li style="color: orange;"><strong>疑わしいURL: ${checkResult.summary.suspicious}件</strong></li>`;
    }
    body += `</ul>`;
  }

  if (checkResult.urls && checkResult.urls.length > 0) {
    body += `<h4>■ 検出されたURL</h4>`;
    body += `<ul>`;
    checkResult.urls.slice(0, 10).forEach(url => {
      body += `<li>${escapeHtml(url)}</li>`;
    });
    if (checkResult.urls.length > 10) {
      body += `<li>...他${checkResult.urls.length - 10}件</li>`;
    }
    body += `</ul>`;
  }
  
  // @を含むURLの警告を追加
  const urlDetails = (typeof globalThis.getLastExtractedUrlDetails === 'function') 
    ? globalThis.getLastExtractedUrlDetails() 
    : [];
  const dangerousUrls = urlDetails.filter(d => d.isDangerous);
  
  if (dangerousUrls.length > 0) {
    body += `<h4 style="color: #d32f2f;">■ ⚠️ 偽装URL検出</h4>`;
    body += `<p style="color: #d32f2f;"><strong>${dangerousUrls.length}件の偽装URLが検出されました</strong></p>`;
    body += `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">`;
    body += `<tr style="background: #f5f5f5;"><th>No.</th><th>偽装表示ドメイン</th><th>実際のアクセス先</th></tr>`;
    
    dangerousUrls.forEach((detail, index) => {
      body += `<tr>`;
      body += `<td>${index + 1}</td>`;
      body += `<td style="word-break: break-all;">${escapeHtml(detail.fakeDomain || '（不明）')}</td>`;
      body += `<td style="word-break: break-all; background: #ffebee;"><strong>${escapeHtml(detail.actualDomain || '（不明）')}</strong></td>`;
      body += `</tr>`;
    });
    
    body += `</table>`;
    body += `<p style="font-size: 12px; color: #666; margin-top: 10px;">`;
    body += `<em>注: @記号を含むURLは、@の前の部分が偽装表示で、@の後の部分が実際のアクセス先となります。`;
    body += `ブラウザはこれを認証情報として解釈するため、ユーザーが意図しないサイトにアクセスする危険があります。</em>`;
    body += `</p>`;
  }

  if (checkResult.phishingCheck) {
    body += `<h4>■ フィッシング分析</h4>`;
    body += `<p>リスクレベル: <strong>${checkResult.phishingCheck.riskLevel}</strong></p>`;
    if (checkResult.phishingCheck.indicators && checkResult.phishingCheck.indicators.length > 0) {
      body += `<ul>`;
      checkResult.phishingCheck.indicators.forEach(indicator => {
        body += `<li>${escapeHtml(indicator)}</li>`;
      });
      body += `</ul>`;
    }
  }

  body += `<hr>`;
  body += `<p><small>このメールはJP Spam Reporter Enhancedによって自動生成されました。</small></p>`;
  body += `</body></html>`;

  return body;
}

// HTMLエスケープ（DOM不使用版）
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// メッセージリスナー（修正版 - 明確なPromise返却）
browser.runtime.onMessage.addListener((message, sender) => {
  // actionプロパティがない場合は、他のリスナー（api.js）に処理を任せる
  if (!message || !message.action) {
    return false; // falseを返して、他のリスナーに処理させる
  }
  
  console.log('[ContentHandler] Received message:', message.action);
  
  // 非同期処理を実行してPromiseを返す
  return (async () => {
    try {
      switch (message.action) {
        case 'checkEmail':
          // 現在表示されているメッセージを取得
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tabs || !tabs[0]) {
            throw new Error('アクティブなタブが見つかりません');
          }
          
          const msgList = await browser.messageDisplay.getDisplayedMessages(tabs[0].id);
          if (!msgList || msgList.length === 0) {
            throw new Error('表示されているメッセージがありません');
          }
          
          const result = await performEmailCheck(msgList[0].id);
          return { result: result };
          
        case 'createReport':
          if (!message.checkResult) {
            throw new Error('チェック結果が提供されていません');
          }
          await createReportEmail(message.checkResult);
          return { success: true };
          
        case 'getCheckResult':
          return { result: currentCheckResult };
          
        default:
          return { error: 'Unknown action: ' + message.action };
      }
    } catch (error) {
      console.error('[ContentHandler] Error handling message:', error);
      return { error: error.message };
    }
  })(); // 即座に実行してPromiseを返す
});

// ヘルパー関数群
function extractDisplayName(author) {
  const match = author.match(/^(.+?)\s*</);
  return match ? match[1].trim() : author;
}

function extractDomain(author) {
  const match = author.match(/@([^>]+)/);
  return match ? match[1] : '';
}

function extractReturnPath(fullMessage) {
  // 簡易実装
  return '';
}

function extractSPFResult(fullMessage) {
  // 簡易実装
  return '';
}

function extractDKIMResult(fullMessage) {
  // 簡易実装
  return '';
}

async function analyzePhishingIndicators(emailMeta, urls) {
  // 簡易的なフィッシング分析
  const indicators = [];
  let riskLevel = 'low';
  
  // URLが配列でない場合は空配列に
  const urlList = Array.isArray(urls) ? urls : [];
  
  // ホワイトリストを設定から読み込む
  const settings = await browser.storage.local.get({ domainWhitelist: '' });
  const whitelist = settings.domainWhitelist
    ? settings.domainWhitelist.split('\n').map(d => d.trim()).filter(d => d.length > 0)
    : [];
  
  // 表示名とメールアドレスの不一致チェック
  if (emailMeta.displayName && emailMeta.fromDomain) {
    // 有名ブランドのリスト
    const brandChecks = [
      { name: 'amazon', domain: 'amazon' },
      { name: '楽天', domain: 'rakuten' },
      { name: 'yahoo', domain: 'yahoo' },
      { name: 'google', domain: 'google' },
      { name: 'microsoft', domain: 'microsoft' },
      { name: '佐川', domain: 'sagawa' },
      { name: 'ヤマト', domain: 'yamato' },
      { name: '東京ガス', domain: 'tokyo-gas' },
      { name: 'tokyogas', domain: 'tokyo-gas' },
    ];
    
    for (const brand of brandChecks) {
      if (emailMeta.displayName.toLowerCase().includes(brand.name) && 
          !emailMeta.fromDomain.toLowerCase().includes(brand.domain)) {
        indicators.push(`表示名とドメインが一致しません（${brand.name}偽装の疑い）`);
        riskLevel = 'high';
        break;
      }
    }
  }
  
  // 短縮URLチェック
  const shorteners = ['bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 't.co'];
  urlList.forEach(url => {
    if (url && typeof url === 'string') {
      shorteners.forEach(shortener => {
        if (url.includes(shortener)) {
          indicators.push(`短縮URL使用: ${shortener}`);
          if (riskLevel === 'low') riskLevel = 'medium';
        }
      });
    }
  });
  
  // グローバルのフィッシング検出関数を使用（利用可能な場合）
  if (typeof globalThis.detectPhishing === 'function' && urlList.length > 0) {
    for (const url of urlList.slice(0, 5)) { // 最初の5つのURLだけチェック
      if (url && typeof url === 'string') {
        try {
          const result = globalThis.detectPhishing(url, emailMeta, whitelist);
          if (result.suspicious) {
            indicators.push(...result.reasons);
            if (result.confidence === 'high') {
              riskLevel = 'high';
            } else if (result.confidence === 'medium' && riskLevel === 'low') {
              riskLevel = 'medium';
            }
          }
        } catch (e) {
          console.error('[ContentHandler] Phishing detection error:', e);
        }
      }
    }
  }
  
  return {
    riskLevel: riskLevel,
    indicators: indicators
  };
}

async function getSetting(key) {
  // 既存の実装を使用
  if (window.getSetting) return window.getSetting(key);
  
  const result = await browser.storage.local.get(key);
  return result[key];
}

async function getApiKey(mode) {
  switch (mode) {
    case 'vt':
      return await getSetting('vtApiKey');
    case 'gsb':
      return await getSetting('gsbApiKey');
    case 'pt':
      return await getSetting('ptAppKey');
    default:
      return null;
  }
}

async function makeEmlFile(messageId) {
  try {
    console.log('[ContentHandler] Creating EML file for message:', messageId);
    
    // タイムアウト付きでメッセージの生データを取得
    const raw = await Promise.race([
      browser.messages.getRaw(messageId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getRaw() timeout after 25 seconds')), 25000)
      )
    ]);
    
    if (!raw || raw.length === 0) {
      throw new Error('Empty message data');
    }
    
    console.log('[ContentHandler] EML data retrieved, size:', raw.length, 'bytes');
    
    // Blobを作成
    const blob = new Blob([raw], { type: 'message/rfc822' });
    
    // Fileオブジェクトを作成
    const filename = `suspicious-mail-${messageId}-${Date.now()}.eml`;
    const file = new File([blob], filename, {
      type: 'message/rfc822',
      lastModified: Date.now()
    });
    
    console.log('[ContentHandler] EML file created successfully:', filename, file.size, 'bytes');
    
    return file;
  } catch (error) {
    console.error('[ContentHandler] Failed to create EML file:', error);
    return null;
  }
}

// URL検証関数（グローバル関数を使用）
async function checkUrlsWithVirusTotal(urls, apiKey) {
  const summary = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0 };
  const details = [];
  
  if (!urls || urls.length === 0) {
    return { summary, details };
  }
  
  // 既存のcheckWithVT関数を使用
  if (typeof globalThis.checkWithVT === 'function') {
    for (const url of urls.slice(0, 10)) { // 最初の10個のURLをチェック
      if (!url || typeof url !== 'string') continue;
      
      try {
        const result = await globalThis.checkWithVT(url, apiKey);
        
        switch (result.verdict) {
          case 'malicious':
            summary.malicious++;
            break;
          case 'suspicious':
            summary.suspicious++;
            break;
          case 'clean':
            summary.harmless++;
            break;
          default:
            summary.unknown++;
        }
        
        details.push({
          url: url,
          verdict: result.verdict,
          summary: result.summary || '',
          error: result.error
        });
      } catch (e) {
        console.error('[ContentHandler] VT check failed for URL:', url, e);
        summary.unknown++;
        details.push({
          url: url,
          verdict: 'unknown',
          error: e.message
        });
      }
    }
  } else {
    console.warn('[ContentHandler] checkWithVT function not available');
    summary.unknown = urls.length;
  }
  
  return { summary, details };
}

async function checkUrlsWithGoogleSafeBrowsing(urls, apiKey) {
  const summary = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0 };
  const details = [];
  
  if (!urls || urls.length === 0) {
    return { summary, details };
  }
  
  // 既存のcheckWithGSB関数を使用
  if (typeof globalThis.checkWithGSB === 'function') {
    for (const url of urls.slice(0, 10)) {
      if (!url || typeof url !== 'string') continue;
      
      try {
        const result = await globalThis.checkWithGSB(url, apiKey);
        
        if (result.verdict === 'malicious') {
          summary.malicious++;
        } else if (result.verdict === 'clean') {
          summary.harmless++;
        } else {
          summary.unknown++;
        }
        
        details.push({
          url: url,
          verdict: result.verdict,
          summary: result.summary || '',
          error: result.error
        });
      } catch (e) {
        console.error('[ContentHandler] GSB check failed for URL:', url, e);
        summary.unknown++;
      }
    }
  } else {
    console.warn('[ContentHandler] checkWithGSB function not available');
    summary.unknown = urls.length;
  }
  
  return { summary, details };
}

async function checkUrlsWithPhishTank(urls, apiKey) {
  const summary = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0 };
  const details = [];
  
  if (!urls || urls.length === 0) {
    return { summary, details };
  }
  
  // 既存のcheckWithPT関数を使用
  if (typeof globalThis.checkWithPT === 'function') {
    for (const url of urls.slice(0, 10)) {
      if (!url || typeof url !== 'string') continue;
      
      try {
        const result = await globalThis.checkWithPT(url, apiKey);
        
        if (result.verdict === 'malicious') {
          summary.malicious++;
        } else if (result.verdict === 'clean') {
          summary.harmless++;
        } else {
          summary.unknown++;
        }
        
        details.push({
          url: url,
          verdict: result.verdict,
          summary: result.summary || '',
          error: result.error
        });
      } catch (e) {
        console.error('[ContentHandler] PT check failed for URL:', url, e);
        summary.unknown++;
      }
    }
  } else {
    console.warn('[ContentHandler] checkWithPT function not available');
    summary.unknown = urls.length;
  }
  
  return { summary, details };
}

console.log('[ContentHandler] Initialized');
