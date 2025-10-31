// ui/report.js
// ポップアップUI：Check & Report（統合版）
// === settings helper (report.js 冒頭か、他のutilの直下あたりに追加) ===

/** 設定キーの既定値（必要に応じてここに足す） */
const JPSR_DEFAULTS = {
  checkMode: "vt",      // "vt" | "gsb" | "pt"
  vtApiKey: "",
  gsbApiKey: "",
  ptAppKey: "",
  autoAttachEml: true,  // .eml自動添付の既定
  // …ほかのオプションがあればここへ
};

/** 25秒キャッシュ */
const __settingsCache = {
  data: null,
  ts: 0,
  ttlMs: 25_000, // 25秒
};

/**
 * 設定を1件取得する（25秒キャッシュあり）
 * @param {keyof typeof JPSR_DEFAULTS} key
 * @returns {Promise<any>}
 */
async function getSetting(key) {
  const now = Date.now();
  if (__settingsCache.data && (now - __settingsCache.ts) < __settingsCache.ttlMs) {
    return (__settingsCache.data[key] ?? JPSR_DEFAULTS[key]);
  }
  // ストレージからまとめて読んでキャッシュ
  const all = await browser.storage.local.get(JPSR_DEFAULTS);
  __settingsCache.data = { ...JPSR_DEFAULTS, ...all };
  __settingsCache.ts = now;
  return (__settingsCache.data[key] ?? JPSR_DEFAULTS[key]);
}

/**
 * 設定を1件保存する（キャッシュも更新）
 * @param {keyof typeof JPSR_DEFAULTS} key
 * @param {any} value
 */
async function setSetting(key, value) {
  await browser.storage.local.set({ [key]: value });
  if (!__settingsCache.data) __settingsCache.data = { ...JPSR_DEFAULTS };
  __settingsCache.data[key] = value;
  __settingsCache.ts = Date.now();
}

// グローバルにスキャン結果を保持
let lastScanResult = {
  urls: [],
  summary: { malicious: 0, suspicious: 0, harmless: 0, unknown: 0 },
  emailMeta: {},
  messageId: null,
  emlData: null,      // Background scriptで作成された.emlファイルのBase64データ
  emlFilename: null,  // .emlファイル名
  isDangerous: false  // 危険判定フラグ
};

// --------------------
// 1) ヘルパー
// --------------------
async function jpsrGetActiveMessage() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs || !tabs[0]) throw new Error("No active tab");
  const msgList = await browser.messageDisplay.getDisplayedMessages(tabs[0].id);
  if (!msgList || msgList.length === 0) throw new Error("No displayed message");
  return msgList[0];
}

async function makeEmlFileWithTimeOut(messageId, timeoutMs = 25_000) {
  console.log("[makeEmlFile] =====================================");
  console.log("[makeEmlFile] Creating .eml file for message ID:", messageId);
  console.log("[makeEmlFile] Timeout setting:", timeoutMs, "ms");
  
  try {
    // メッセージIDの検証
    if (!messageId) {
      throw new Error("Message ID is null or undefined");
    }
    console.log("[makeEmlFile] Message ID validated:", messageId);
    
    // タイムアウト付きで直接メッセージの生データを取得
    console.log("[makeEmlFile] Starting getRaw() with timeout...");
    const startTime = Date.now();
    
    const raw = await Promise.race([
      browser.messages.getRaw(messageId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("getRaw() タイムアウト (25秒)")), timeoutMs)
      )
    ]);
    
    const elapsedTime = Date.now() - startTime;
    console.log("[makeEmlFile] getRaw() completed in", elapsedTime, "ms");
    
    // データの検証
    if (!raw) {
      console.error("[makeEmlFile] ERROR: getRaw() returned null or undefined");
      throw new Error("メッセージの取得に失敗しました（nullデータ）");
    }
    
    if (raw.length === 0) {
      console.error("[makeEmlFile] ERROR: getRaw() returned empty data");
      throw new Error("メッセージの取得に失敗しました（空のデータ）");
    }
    
    console.log("[makeEmlFile] ✓ Raw message retrieved successfully");
    console.log("[makeEmlFile] - Size:", raw.length, "bytes");
    console.log("[makeEmlFile] - Size (KB):", (raw.length / 1024).toFixed(2), "KB");
    console.log("[makeEmlFile] - Size (MB):", (raw.length / 1024 / 1024).toFixed(2), "MB");
    
    // メールサイズのチェック（10MB以上は警告）
    const maxRecommendedSize = 10 * 1024 * 1024; // 10MB
    if (raw.length > maxRecommendedSize) {
      const sizeMB = (raw.length / 1024 / 1024).toFixed(2);
      console.warn("[makeEmlFile] ⚠️ WARNING: Email size is large:", sizeMB, "MB");
      
      // ユーザーに確認（ポップアップが使える場合のみ）
      try {
        const proceed = confirm(
          `⚠️ メールサイズが大きいです (${sizeMB}MB)\n\n` +
          `添付に時間がかかる、または失敗する可能性があります。\n` +
          `続行しますか？\n\n` +
          `「キャンセル」を選ぶと、手動で添付できます。`
        );
        if (!proceed) {
          console.log("[makeEmlFile] User cancelled due to large file size");
          throw new Error("ユーザーによりキャンセルされました");
        }
        console.log("[makeEmlFile] User confirmed to proceed with large file");
      } catch (confirmError) {
        // confirmが使えない環境では警告のみ
        console.warn("[makeEmlFile] Cannot show confirmation dialog:", confirmError);
      }
    }
    
    // Blobを作成（RFC822形式）
    console.log("[makeEmlFile] Creating Blob...");
    const blob = new Blob([raw], { type: "message/rfc822" });
    console.log("[makeEmlFile] ✓ Blob created, size:", blob.size);
    
    // Fileオブジェクトを作成
    const filename = `suspicious-mail-${messageId}-${Date.now()}.eml`;
    console.log("[makeEmlFile] Creating File object with name:", filename);
    
    const file = new File([blob], filename, {
      type: "message/rfc822",
      lastModified: Date.now()
    });
    
    console.log("[makeEmlFile] ✓ File object created successfully");
    console.log("[makeEmlFile] - File name:", file.name);
    console.log("[makeEmlFile] - File size:", file.size, "bytes");
    console.log("[makeEmlFile] - File type:", file.type);
    console.log("[makeEmlFile] - Last modified:", new Date(file.lastModified).toISOString());
    
    // ファイルの整合性チェック
    if (file.size === 0) {
      console.error("[makeEmlFile] ERROR: Created file is empty (size = 0)");
      throw new Error("作成されたファイルが空です");
    }
    
    if (file.size !== raw.length) {
      console.warn("[makeEmlFile] ⚠️ WARNING: File size mismatch"); 
      console.warn("[makeEmlFile]   Expected:", raw.length);
      console.warn("[makeEmlFile]   Got:", file.size);
      console.warn("[makeEmlFile]   Difference:", Math.abs(file.size - raw.length));
    } else {
      console.log("[makeEmlFile] ✓ File size matches raw data size");
    }
    
    console.log("[makeEmlFile] ===================================== SUCCESS");
    return file;
    
  } catch (e) {
    console.error("[makeEmlFile] ===================================== FAILED");
    console.error("[makeEmlFile] ✗ Error creating .eml file");
    console.error("[makeEmlFile] Error type:", e.name);
    console.error("[makeEmlFile] Error message:", e.message);
    console.error("[makeEmlFile] Error stack:", e.stack);
    
    // より詳細なエラーメッセージ
    if (e.message.includes("タイムアウト") || e.message.includes("timeout")) {
      const detailedError = new Error(
        `メールファイルの作成がタイムアウトしました。\n\n` +
        `考えられる原因:\n` +
        `• メールサイズが大きすぎる（10MB以上）\n` +
        `• Thunderbirdが応答していない\n\n` +
        `対処方法:\n` +
        `• Thunderbirdを再起動してください\n` +
        `• 添付なしで報告し、手動でメールを添付してください\n` +
        `• 大きなメールは転送として添付してください`
      );
      detailedError.originalError = e;
      throw detailedError;
    }
    
    // その他のエラーも詳細を追加
    const detailedError = new Error(`メールファイルの作成に失敗しました: ${e.message}`);
    detailedError.originalError = e;
    throw detailedError;
  }
}


// --------------------
// 2) ステータス表示
// --------------------
function setStatus(text, isEnd = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = text;
  
  // スタイル設定
  el.className = '';
  if (text.includes('⚠️') || text.includes('警告') || text.includes('疑い')) {
    el.className = 'warning';
  } else if (text.includes('エラー') || text.includes('失敗')) {
    el.className = 'error';
  } else if (text.includes('CLEAN') || text.includes('成功')) {
    el.className = 'success';
  }
  
  if (isEnd && typeof stopActionSpinner === "function") {
    stopActionSpinner();
  }
}

// --------------------
// 3) 診断トレース表示
// --------------------
function showDiagTrace(provider, trace) {
  const traceDiv = document.getElementById("trace");
  if (!traceDiv) return;
  traceDiv.style.display = "block";
  traceDiv.textContent = `[${provider}]\n` + trace;
}

// --------------------
// 4) メイン：Scan & Report（強化版）
// --------------------
async function runCheck() {
  if (typeof startActionSpinner === "function") {
    startActionSpinner();
  }

  try {
    // (A) 対象メール取得
    const msg = await jpsrGetActiveMessage().catch(() => null);
    if (!msg) {
      setStatus("メールを開いてください", true);
      if (typeof notify === "function") {
        notify("JP Spam Reporter", "メールを開いてください");
      }
      return;
    }

    // メッセージIDを保存
    lastScanResult.messageId = msg.id;

    // 【改善】Background scriptで早期にEMLファイルの作成を開始（並行処理）
    // ポップアップが閉じても処理が継続される
    console.log("[UI] =========================================");
    console.log("[UI] Starting early .eml file creation via background script...");
    console.log("[UI] Message ID:", msg.id);
    
    const emlFilePromise = browser.runtime.sendMessage({
      type: "create-eml-file",
      messageId: msg.id
    }).then(
      result => {
        if (result && result.success) {
          console.log("[UI] ✓ Background .eml file creation successful");
          console.log("[UI]   File size:", result.size, "bytes");
          return result;
        } else {
          console.error("[UI] ✗ Background .eml file creation failed:", result?.error);
          return null;
        }
      },
      error => {
        console.error("[UI] ✗ Background .eml file creation error:", error.message);
        return null;
      }
    );

    // (B) メールメタデータ取得
    setStatus("メール情報を取得中…");
    const emailMeta = await browser.runtime.sendMessage({
      type: "get-metadata",
      messageId: msg.id
    });
    
    lastScanResult.emailMeta = emailMeta;
    console.log("[UI] Email metadata:", emailMeta);

    // (C) URL抽出
    setStatus("URL を抽出中…");
    const urls = await browser.runtime.sendMessage({
      type: "extract-urls",
      messageId: msg.id
    });

    if (!urls || urls.length === 0) {
      setStatus("メール内にURLが見つかりませんでした。", true);
      if (typeof notify === "function") {
        notify("JP Spam Reporter", "URL が見つかりません");
      }
      return;
    }

    lastScanResult.urls = urls;
    console.log("[UI] Extracted URLs:", urls);
    const target = urls[0];

    // (D) 混在URLのチェック
    if (emailMeta.senderDomain) {
      setStatus("混在URLをチェック中…");
      const mixedCheck = await browser.runtime.sendMessage({
        type: "check-mixed-domains",
        urls: urls,
        expectedDomain: emailMeta.senderDomain
      });

      if (mixedCheck && mixedCheck.hasMixedDomains) {
        const externalCount = mixedCheck.count;
        const totalCount = mixedCheck.total;
        const warning = `⚠️ 混在URL検出: ${totalCount}個中${externalCount}個が外部ドメイン\n` +
                       `送信者ドメイン: ${emailMeta.senderDomain}\n` +
                       `外部URL例: ${mixedCheck.externalUrls.slice(0, 3).join(', ')}`;
        setStatus(warning, false);
        console.log("[UI] Mixed domains detected:", mixedCheck);
      }
    }

    // (E) フィッシング検出（事前チェック）
    setStatus("フィッシングの兆候をチェック中…");
    const phishingCheck = await browser.runtime.sendMessage({
      type: "detect-phishing",
      url: target,
      emailMeta: emailMeta
    });

    let phishingWarning = '';
    if (phishingCheck && phishingCheck.suspicious) {
      const reasons = phishingCheck.reasons.join('\n• ');
      const confidence = phishingCheck.confidence === 'high' ? '【高確率】' : '【中確率】';
      phishingWarning = `⚠️ フィッシングの疑い ${confidence}\n• ${reasons}\n\n`;
      
      // 警告を表示するが、処理は継続してVT/GSBでもチェック
      setStatus(phishingWarning + "VirusTotal/GSBでも確認中…");
    }

    // (F) モードとAPIキー取得
    const mode = (typeof getSetting === "function") ? (await getSetting("checkMode")) : "gsb";

    setStatus(`スキャン実行中（${mode.toUpperCase()}）…`);

    // サマリーの初期化
    let summary = { malicious: 0, suspicious: 0, harmless: 0, unknown: 0 };

    let res = { verdict: "unknown" };
    if (mode === "gsb") {
      const apiKey = await getSetting("gsbApiKey");
      res = await browser.runtime.sendMessage({
        type: "check-gsb",
        url: target,
        apiKey: apiKey
      });
    } else if (mode === "pt") {
      const appKey = await getSetting("ptAppKey");
      res = await browser.runtime.sendMessage({
        type: "check-pt",
        url: target,
        appKey: appKey
      });
      if (res && res.trace && typeof showDiagTrace === "function") {
        showDiagTrace("PhishTank", res.trace);
      }
    } else if (mode === "vt") {
      const apiKey = await getSetting("vtApiKey");
      res = await browser.runtime.sendMessage({
        type: "check-vt",
        url: target,
        apiKey: apiKey
      });
    }

    const verdict = (res && res.verdict ? res.verdict : "unknown").toUpperCase();
    
    // verdictからサマリーを更新
    if (verdict === "MALICIOUS") {
      summary.malicious = 1;
    } else if (verdict === "SUSPICIOUS") {
      summary.suspicious = 1;
    } else if (verdict === "CLEAN" || verdict === "HARMLESS") {
      summary.harmless = 1;
    } else {
      summary.unknown = 1;
    }

    // フィッシング検出があれば疑いにカウント
    if (phishingCheck && phishingCheck.suspicious) {
      summary.suspicious = Math.max(summary.suspicious, 1);
    }

    lastScanResult.summary = summary;
    
    // CORSエラーの特別処理
    if (res && res.isCorsError) {
      let errorMsg = `❌ 接続エラー\n\n`;
      errorMsg += res.error + '\n\n';
      errorMsg += `【トラブルシューティング】\n`;
      errorMsg += `1. APIキーが正しく設定されているか確認してください\n`;
      errorMsg += `2. インターネット接続を確認してください\n`;
      errorMsg += `3. Thunderbirdを再起動してみてください\n`;
      errorMsg += `4. 拡張機能を再インストールしてみてください\n\n`;
      errorMsg += `URL: ${target}`;
      
      setStatus(errorMsg, true);
      
      if (typeof notify === "function") {
        notify("接続エラー", "API接続に失敗しました");
      }
      return;
    }
    
    // エラーメッセージの詳細表示
    if (res && res.error && verdict === "UNKNOWN") {
      let errorMsg = `❌ スキャンエラー\n\n`;
      errorMsg += res.error + '\n\n';
      
      if (res.details) {
        errorMsg += `詳細: ${res.details}\n\n`;
      }
      
      errorMsg += `URL: ${target}\n`;
      errorMsg += `送信者: ${emailMeta.sender || '不明'}\n`;
      errorMsg += `送信者ドメイン: ${emailMeta.senderDomain || '不明'}`;
      
      setStatus(errorMsg, true);
      
      if (typeof notify === "function") {
        notify("スキャンエラー", "URLチェックに失敗しました");
      }
      return;
    }
    
    // フィッシング警告がある場合は、それも含めて表示
    let finalMsg = '';
    if (phishingWarning) {
      finalMsg = phishingWarning;
    }
    
    finalMsg += `🔍 ${mode.toUpperCase()}スキャン結果: ${verdict}\n`;
    
    // サマリー情報を追加
    if (res && res.summary) {
      finalMsg += `${res.summary}\n`;
    }
    
    finalMsg += `\nURL: ${target}\n` +
                `送信者: ${emailMeta.sender || '不明'}\n` +
                `送信者ドメイン: ${emailMeta.senderDomain || '不明'}`;
    
    if (phishingCheck && phishingCheck.actualDomain) {
      finalMsg += `\n実際のドメイン: ${phishingCheck.actualDomain}`;
    }
    
    // 危険判定
    const isDangerous = (summary.malicious > 0 || summary.suspicious > 0 || 
                        (phishingCheck && phishingCheck.suspicious));
    lastScanResult.isDangerous = isDangerous;
    
    console.log("[UI] =========================================");
    console.log("[UI] Danger assessment:", isDangerous);
    console.log("[UI]   Malicious:", summary.malicious);
    console.log("[UI]   Suspicious:", summary.suspicious);
    console.log("[UI]   Phishing check suspicious:", phishingCheck?.suspicious || false);
    
    // 【改善】危険な場合は、結果表示の前にEMLファイルの完了を確実に待つ
    // Background scriptで処理されるため、ポップアップが閉じても大丈夫
    if (isDangerous) {
      console.log("[UI] ⚠️ Dangerous email detected!");
      console.log("[UI] Waiting for background .eml file creation to complete...");
      setStatus(finalMsg + "\n\n⚠️ 危険なメールを検出しました。\n.emlファイルを準備中...", false);
      
      try {
        console.log("[UI] Awaiting emlFilePromise...");
        const startWait = Date.now();
        const emlResult = await emlFilePromise;
        const waitTime = Date.now() - startWait;
        
        console.log("[UI] emlFilePromise resolved in", waitTime, "ms");
        
        if (emlResult && emlResult.success) {
          // Background scriptで作成されたemlデータを保存
          lastScanResult.emlData = emlResult.data;
          lastScanResult.emlFilename = emlResult.filename;
          console.log("[UI] ✓ .eml file data ready before report");
          console.log("[UI]   File name:", emlResult.filename);
          console.log("[UI]   File size:", emlResult.size, "bytes");
        } else {
          console.error("[UI] ✗ .eml file creation failed");
          console.error("[UI]   This means the background creation failed");
          lastScanResult.emlData = null;
          lastScanResult.emlFilename = null;
        }
      } catch (e) {
        console.error("[UI] ✗ Error waiting for .eml file");
        console.error("[UI]   Error type:", e.name);
        console.error("[UI]   Error message:", e.message);
        console.error("[UI]   Error stack:", e.stack);
        lastScanResult.emlData = null;
        lastScanResult.emlFilename = null;
      }
      
      console.log("[UI] Final emlData state:", lastScanResult.emlData ? "READY" : "NULL");
      console.log("[UI] =========================================");
    }
    
    setStatus(finalMsg, true);
    
    if (typeof notify === "function") {
      let notifyMsg = `${verdict} - ${target}`;
      if (phishingWarning) {
        notifyMsg = `⚠️ フィッシングの疑い + ${verdict}`;
      }
      notify("チェック結果", notifyMsg);
    }
    
    // 危険なメールが検出された場合は、自動的にレポートメール下書きを作成
    if (isDangerous) {
      console.log("[UI] Dangerous email detected - automatically creating report draft");
      setStatus(finalMsg + "\n\n⚠️ 危険なメールを検出しました。\n報告メール下書きを作成しています...", false);
      
      // 少し待ってからレポート作成（UIの更新を確認）
      await new Promise(r => setTimeout(r, 500));
      
      try {
        await reportToJapan();
      } catch (reportError) {
        console.error("[UI] Auto-report creation failed:", reportError);
        setStatus(finalMsg + "\n\n❌ 報告メールの自動作成に失敗しました。\n" + reportError.message, true);
      }
    } else {
      // 危険でない場合でも、バックグラウンドのemlファイル作成を保存
      // （後で手動でReportボタンを押した時に利用可能にする）
      console.log("[UI] =========================================");
      console.log("[UI] Not dangerous - saving background .eml data for manual report...");
      
      try {
        console.log("[UI] Awaiting background emlFilePromise...");
        const startWait = Date.now();
        const emlResult = await emlFilePromise;
        const waitTime = Date.now() - startWait;
        
        console.log("[UI] Background emlFilePromise resolved in", waitTime, "ms");
        
        if (emlResult && emlResult.success) {
          lastScanResult.emlData = emlResult.data;
          lastScanResult.emlFilename = emlResult.filename;
          console.log("[UI] ✓ .eml data saved for manual report");
          console.log("[UI]   File name:", emlResult.filename);
          console.log("[UI]   File size:", emlResult.size, "bytes");
        } else {
          console.log("[UI] ⚠️ Background .eml file creation returned null or failed");
        }
      } catch (e) {
        console.warn("[UI] ⚠️ Background .eml file not available");
        console.warn("[UI]   Error:", e.message);
      }
      
      console.log("[UI] =========================================");
    }
    
  } catch (e) {
    console.error("[UI] Error:", e);
    setStatus("チェックに失敗しました: " + e.message, true);
    if (typeof notify === "function") {
      notify("JP Spam Reporter", "チェックに失敗しました");
    }
  } finally {
    if (typeof stopActionSpinner === "function") {
      stopActionSpinner();
    }
  }
}

// --------------------
// 5) 報告メール本文作成（シンプル版・v2.4.8）
// --------------------
function buildReportBody({ urls, summary }) {
  const s = summary || {};
  
  // URLの数だけ報告
  const urlCount = urls && urls.length ? urls.length : 0;
  
  // シンプルな本文（URLは含めない - .emlファイルに全て含まれている）
  return [
    "フィッシング/迷惑メールの可能性があるメールを報告します。",
    "",
    "自動検出結果:",
    `危険: ${s.malicious || 0} / 疑い: ${s.suspicious || 0} / 安全: ${s.harmless || 0} / 不明: ${s.unknown || 0}`,
    "",
    `検出されたURL数: ${urlCount}個`,
    "",
    "詳細は添付の.emlファイルをご確認ください。",
    "",
    "※ 本メールはThunderbird拡張 JP Spam Reporter で自動作成されました。"
  ].join("\n");
}

// --------------------
// 6) beginNew戻り値の正規化（改善版）
// --------------------
function normalizeComposeTabId(ret) {
  console.log("[Normalize] Input type:", typeof ret);
  console.log("[Normalize] Input value:", ret);
  
  if (typeof ret === "number") {
    console.log("[Normalize] Direct number:", ret);
    return ret;
  }
  if (ret && typeof ret.id === "number") {
    console.log("[Normalize] ret.id:", ret.id);
    return ret.id;
  }
  if (ret && typeof ret.tabId === "number") {
    console.log("[Normalize] ret.tabId:", ret.tabId);
    return ret.tabId;
  }
  if (ret && ret.tab && typeof ret.tab.id === "number") {
    console.log("[Normalize] ret.tab.id:", ret.tab.id);
    return ret.tab.id;
  }
  
  console.error("[Normalize] Could not extract tab ID from:", ret);
  throw new Error("compose.beginNew returned unexpected value: " + JSON.stringify(ret));
}

// --------------------
// 7) .emlファイル作成（改善版 v2.4.6 - サイズ制限とエラーハンドリング強化）
// --------------------
async function makeEmlFileSimple(msgId) {
  try {
    const raw = await browser.messages.getRaw(msgId);
    console.log("[EML] Raw message retrieved, type:", typeof raw);
    
    // データサイズをチェック
    const rawSize = raw ? (typeof raw === 'string' ? raw.length : (raw.byteLength || raw.length)) : 0;
    console.log("[EML] Raw message size:", rawSize, "bytes", `(${(rawSize / 1024 / 1024).toFixed(2)} MB)`);
    
    // 10MBを超える場合は警告
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (rawSize > MAX_SIZE) {
      const sizeMB = Math.round(rawSize / 1024 / 1024);
      console.error("[EML] Message is too large:", rawSize, "bytes");
      throw new Error(`メールサイズが大きすぎます (${sizeMB}MB)。10MB以下のメールのみ添付できます。\n手動で添付するか、添付なしで報告してください。`);
    }
    
    // getRaw()が文字列を返す場合、UTF-8としてエンコード
    let blobData;
    if (typeof raw === 'string') {
      console.log("[EML] Converting string to Uint8Array");
      // TextEncoderを使って文字列をUint8Arrayに変換
      const encoder = new TextEncoder();
      blobData = encoder.encode(raw);
    } else if (raw instanceof ArrayBuffer) {
      console.log("[EML] Converting ArrayBuffer to Uint8Array");
      blobData = new Uint8Array(raw);
    } else if (raw instanceof Uint8Array) {
      console.log("[EML] Using Uint8Array directly");
      blobData = raw;
    } else {
      console.warn("[EML] Unknown raw type, trying as-is");
      blobData = raw;
    }
    
    // Blobを明示的に作成してからFileに変換
    const blob = new Blob([blobData], { type: "message/rfc822" });
    const file = new File([blob], "original.eml", { type: "message/rfc822" });
    
    console.log("[EML] File created successfully");
    console.log("[EML] Final file size:", file.size, "bytes", `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log("[EML] Final file type:", file.type);
    console.log("[EML] Final file name:", file.name);
    
    // ファイルサイズの最終確認
    if (file.size === 0) {
      throw new Error("作成されたファイルが空です");
    }
    
    if (file.size > MAX_SIZE) {
      const sizeMB = Math.round(file.size / 1024 / 1024);
      throw new Error(`ファイルサイズが大きすぎます (${sizeMB}MB)`);
    }
    
    return file;
  } catch (e) {
    console.error("[EML] Error creating .eml file:", e);
    throw new Error(`メールファイルの作成に失敗しました: ${e.message}`);
  }
}

// --------------------
// 8) .eml添付（改善版 v2.4.10 - 事前作成ファイルの使用）
// --------------------

// --------------------  
// 8-Simple) シンプルな.eml添付（v2.4.13修正版）
// --------------------
// --------------------
// 旧バージョンの添付関数（参考用・未使用）
// --------------------
/*
async function attachEmlFileSimple(tabId, messageId, preCreatedFile = null) {
  try {
    console.log("[EML-Simple] ===========================================");
    console.log("[EML-Simple] Starting attachment process...");
    console.log("[EML-Simple] Tab ID:", tabId);
    console.log("[EML-Simple] Message ID:", messageId);
    console.log("[EML-Simple] Pre-created file:", preCreatedFile ? "YES" : "NO");
    
    let emlFile;
    
    // 事前作成されたファイルがあればそれを使用
    if (preCreatedFile) {
      console.log("[EML-Simple] Using pre-created file");
      console.log("[EML-Simple] - File name:", preCreatedFile.name);
      console.log("[EML-Simple] - File size:", preCreatedFile.size, "bytes");
      console.log("[EML-Simple] - File type:", preCreatedFile.type);
      emlFile = preCreatedFile;
    } else {
      console.log("[EML-Simple] No pre-created file, fetching message raw data...");
      
      // メッセージの生データを取得（タイムアウト付き）
      const raw = await Promise.race([
        browser.messages.getRaw(messageId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getRaw() timeout after 25 seconds')), 25000)
        )
      ]);
      
      if (!raw || raw.length === 0) {
        console.error("[EML-Simple] No message content");
        return { success: false, error: "Empty message content" };
      }
      
      console.log("[EML-Simple] Message size:", raw.length, "bytes");
      
      // Fileオブジェクトを作成
      const emlBlob = new Blob([raw], { type: "message/rfc822" });
      emlFile = new File([emlBlob], "original_message.eml", {
        type: "message/rfc822",
      });
      
      console.log("[EML-Simple] File created:", emlFile.name, emlFile.size, "bytes");
    }
    
    // Compose windowが準備できるまで待機（時間を延長）
    console.log("[EML-Simple] Waiting for compose window (3000ms)...");
    await new Promise(r => setTimeout(r, 3000));
    
    // Compose windowの状態を複数回確認
    let composeReady = false;
    let retries = 0;
    const maxRetries = 3;
    
    while (!composeReady && retries < maxRetries) {
      try {
        await browser.compose.getComposeDetails(tabId);
        console.log("[EML-Simple] Compose window verified (attempt", retries + 1, ")");
        composeReady = true;
      } catch (e) {
        retries++;
        console.warn("[EML-Simple] Compose window not ready (attempt", retries, "):", e.message);
        if (retries < maxRetries) {
          console.log("[EML-Simple] Retrying in 1500ms...");
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }
    
    if (!composeReady) {
      console.error("[EML-Simple] Compose window not ready after", maxRetries, "attempts");
      return { success: false, error: "Compose window not ready" };
    }
    
    // 添付を試みる（タイムアウトを延長し、リトライロジックを追加）
    console.log("[EML-Simple] Attempting to attach file...");
    
    let attached = false;
    let attachRetries = 0;
    const maxAttachRetries = 2;
    let lastError = null;
    
    while (!attached && attachRetries < maxAttachRetries) {
      try {
        await Promise.race([
          // Thunderbird は { file, name } 形式が最も安定
          browser.compose.addAttachment(tabId, { file: emlFile, name: emlFile.name }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("addAttachment() timeout after 15 seconds")), 15000)
          )
        ]);
        attached = true;
        console.log("[EML-Simple] ✅ Successfully attached on attempt", attachRetries + 1);
      } catch (err) {
        lastError = err;
        attachRetries++;
        console.error("[EML-Simple] Attachment failed (attempt", attachRetries, "):", err.message);
        
        if (attachRetries < maxAttachRetries) {
          console.log("[EML-Simple] Retrying attachment in 2000ms...");
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    
    if (attached) {
      console.log("[EML-Simple] ✅ Successfully attached:", emlFile.size, "bytes");
      console.log("[EML-Simple] ===========================================");
      return { success: true, method: "simple" };
    } else {
      throw lastError || new Error("Unknown attachment error");
    }
    
  } catch (err) {
    console.error("[EML-Simple] ❌ Attachment failed:", err);
    console.error("[EML-Simple] Error type:", err.name);
    console.error("[EML-Simple] Error message:", err.message);
    console.log("[EML-Simple] ===========================================");
    
    // エラーメッセージを整形
    let userMessage = "添付に失敗しました。";
    if (err.message.includes("timeout")) {
      userMessage = "添付処理がタイムアウトしました。\nメールサイズが大きすぎる可能性があります。\n手動で添付してください。";
    } else if (err.message.includes("connection")) {
      userMessage = "Thunderbirdとの接続に失敗しました。\n再起動してお試しください。";
    }
    
    return { 
      success: false, 
      method: null,
      error: err.message,
      userMessage: userMessage
    };
  }
}
*/

async function addEmlAttachment(tabRet, msgId, preCreatedFile = null) {
  const tabId = normalizeComposeTabId(tabRet);
  
  console.log("[EML] ===========================================");
  console.log("[EML] Starting attachment process...");
  console.log("[EML] Tab ID:", tabId);
  console.log("[EML] Message ID:", msgId);
  console.log("[EML] Pre-created file available:", preCreatedFile ? "YES" : "NO");
  
  let eml;
  
  // 事前作成されたファイルがあればそれを使用
  if (preCreatedFile) {
    console.log("[EML] Using pre-created file");
    console.log("[EML] File size:", preCreatedFile.size, "bytes");
    console.log("[EML] File type:", preCreatedFile.type);
    console.log("[EML] File name:", preCreatedFile.name);
    eml = preCreatedFile;
    
    // ファイルが空でないことを確認
    if (eml.size === 0) {
      console.error("[EML] Pre-created file is empty!");
      return { 
        success: false, 
        method: null, 
        error: "Pre-created file is empty",
        userMessage: "事前作成されたメールファイルが空です。"
      };
    }
  } else {
    // 事前作成ファイルがない場合は、その場で作成
    console.log("[EML] No pre-created file, creating now...");
    try {
      const emlFile = await makeEmlFileWithTimeOut(msgId);
      eml = emlFile;
      console.log("[EML] File created successfully");
      console.log("[EML] File size:", emlFile.size, "bytes");
      console.log("[EML] File type:", emlFile.type);
      console.log("[EML] File name:", emlFile.name);

      // ファイルが空でないことを確認
      if (eml.size === 0) {
        console.error("[EML] File is empty!");
        return { 
          success: false, 
          method: null, 
          error: "File is empty",
          userMessage: "メールファイルが空です。"
        };
      }
    } catch (e) {
      console.error("[EML] Failed to create .eml file:", e);
      return { 
        success: false, 
        method: null, 
        error: `File creation failed: ${e.message}`,
        userMessage: e.message
      };
    }
  }
  
  // Compose windowが完全に準備されるまで待つ（重要！）
  // より長い待機時間を確保（5秒）
  console.log("[EML] Waiting for compose window to be ready (5000ms)...");
  await new Promise(r => setTimeout(r, 5000));
  
  // Compose詳細を複数回取得して、windowが安定するまで待つ
  let retries = 0;
  const maxRetries = 10;
  let composeReady = false;
  let lastDetails = null;
  
  while (retries < maxRetries) {
    try {
      const details = await browser.compose.getComposeDetails(tabId);
      console.log(`[EML] Compose details retrieved (attempt ${retries + 1}):`, details ? "OK" : "FAILED");
      if (details) {
        lastDetails = details;
        console.log("[EML] Compose window is ready");
        console.log("[EML] Current subject:", details.subject);
        console.log("[EML] Current to:", details.to ? details.to.length : 0, "recipients");
        console.log("[EML] Current body length:", details.body ? details.body.length : 0);
        
        // 詳細が取得できて、かつ内容が正しいことを確認
        if (details.subject && (details.to && details.to.length > 0)) {
          composeReady = true;
          break;
        }
      }
    } catch (e) {
      console.warn(`[EML] Could not get compose details (attempt ${retries + 1}):`, e.message);
    }
    retries++;
    if (retries < maxRetries) {
      console.log(`[EML] Retrying in 2500ms...`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  
  if (!composeReady) {
    console.error("[EML] Compose window never became ready after", maxRetries, "attempts");
    if (lastDetails) {
      console.error("[EML] Last details:", lastDetails);
    }
    return { 
      success: false, 
      method: null, 
      error: "Compose window not ready",
      userMessage: "メール作成ウィンドウの準備が完了しませんでした。\nThunderbird を再起動してお試しください。"
    };
  }
  
  // 添付を試みる前にもう少し待つ（安全マージンを大きく）
  console.log("[EML] Final wait before attachment (2000ms)...");
  await new Promise(r => setTimeout(r, 2000));
  
  // タイムアウト付き添付処理のヘルパー関数（タイムアウトを30秒に延長）
  const attachWithTimeout = async (attachFn, timeout = 30000) => {
    return Promise.race([
      attachFn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('添付処理がタイムアウトしました (30秒)\nメールサイズが大きすぎる可能性があります')), timeout)
      )
    ]);
  };
  
  // 添付を試みる前に、compose windowがまだ存在するか確認
  try {
    await browser.compose.getComposeDetails(tabId);
    console.log("[EML] Compose window verified before attachment");
  } catch (e) {
    console.error("[EML] Compose window disappeared before attachment:", e);
    return {
      success: false,
      method: null,
      error: "Compose window closed",
      userMessage: "メール作成ウィンドウが閉じられました。\n再度お試しください。"
    };
  }
  
  // a) {file: File, name: string} - 最も明示的な方法から試す
  try {
    console.log("[EML] Trying method 1: addAttachment(tabId, {eml, name})");
    console.log("[EML] - Tab ID:", tabId);
    console.log("[EML] - File size:", eml.size);
    console.log("[EML] - File name:", eml.name);
    
    await attachWithTimeout(() => browser.compose.addAttachment(tabId, { file: eml, name: eml.name }));
    console.log("[EML] ✓ Method 1 succeeded");
    
    // 成功を確認
    await new Promise(r => setTimeout(r, 500));
    const detailsAfter = await browser.compose.getComposeDetails(tabId);
    console.log("[EML] Attachments after method 1:", detailsAfter.attachments ? detailsAfter.attachments.length : 0);
    
    return { success: true, method: "explicit-name" };
  } catch (e1) {
    console.warn("[EML] Method 1 failed:", e1.message);
    console.warn("[EML] Error name:", e1.name);
    console.warn("[EML] Error stack:", e1.stack);
  }
  
  // 少し待ってから次の方法を試す
  console.log("[EML] Waiting 2000ms before method 2...");
  await new Promise(r => setTimeout(r, 2000));
  
  // b) {file: File}
  try {
    console.log("[EML] Trying method 2: addAttachment(tabId, {file})");
    console.log("[EML] - Tab ID:", tabId);
    console.log("[EML] - File size:", eml.size);
    
    // 添付を実行
    await attachWithTimeout(() => browser.compose.addAttachment(tabId, { file: eml }));
    console.log("[EML] ✓ Method 2 succeeded");
    
    // 成功を確認
    await new Promise(r => setTimeout(r, 500));
    const detailsAfter = await browser.compose.getComposeDetails(tabId);
    console.log("[EML] Attachments after method 2:", detailsAfter.attachments ? detailsAfter.attachments.length : 0);
    
    return { success: true, method: "object" };
  } catch (e2) {
    console.warn("[EML] Method 2 failed:", e2.message);
    console.warn("[EML] Error name:", e2.name);
    console.warn("[EML] Error stack:", e2.stack);
  }
  
  console.log("[EML] Waiting 2000ms before method 3...");
  await new Promise(r => setTimeout(r, 2000));
  
  // c) File を直接
  try {
    console.log("[EML] Trying method 3: addAttachment(tabId, eml)");
    console.log("[EML] - Tab ID:", tabId);
    console.log("[EML] - File size:", eml.size);
    
    await attachWithTimeout(async () => {
      await browser.compose.addAttachment(tabId, eml);
    });
    console.log("[EML] ✓ Method 3 succeeded");
    
    // 成功を確認
    await new Promise(r => setTimeout(r, 500));
    const detailsAfter = await browser.compose.getComposeDetails(tabId);
    console.log("[EML] Attachments after method 3:", detailsAfter.attachments ? detailsAfter.attachments.length : 0);
    
    return { success: true, method: "direct" };
  } catch (e3) {
    console.warn("[EML] Method 3 failed:", e3.message);
    console.warn("[EML] Error name:", e3.name);
    console.warn("[EML] Error stack:", e3.stack);
  }
  
  console.error("[EML] ===========================================");
  console.error("[EML] ✗ All attachment methods failed");
  console.error("[EML] This may indicate:");
  console.error("[EML]   - Compose window was closed before attachment");
  console.error("[EML]   - File access/permission issue");
  console.error("[EML]   - Thunderbird API compatibility issue");
  console.error("[EML]   - Thunderbird version incompatibility");
  console.error("[EML]   - File size too large for WebExtensions API");
  console.error("[EML] ===========================================");
  
  return { 
    success: false, 
    method: null, 
    error: "All attachment methods failed",
    userMessage: "メールファイルの添付に失敗しました。\n\n" +
                 "考えられる原因:\n" +
                 "• メールサイズが大きすぎる (10MB以下を推奨)\n" +
                 "• 処理がタイムアウトした (30秒以上かかった)\n" +
                 "• Thunderbirdのバージョンが古い (115以降を推奨)\n" +
                 "• 拡張機能の権限設定に問題がある\n" +
                 "• バックグラウンドスクリプトとの通信エラー\n\n" +
                 "対処方法:\n" +
                 "• 添付なしで報告して、手動で元メールを添付する\n" +
                 "• Thunderbirdを再起動する\n" +
                 "• Thunderbirdを最新版にアップデートする\n" +
                 "• 拡張機能を再インストールする\n" +
                 "• メールサイズが大きい場合は、手動で添付してください"
  };
}

// --------------------
// 9) 下書き作成（改善版 v2.4.10 - 事前作成ファイルの使用）
// --------------------
async function openReportDraft({ to1, to2, body, attachEml, msgId, emlFile = null }) {
  console.log("[Draft] ===========================================");
  console.log("[Draft] Creating report draft...");
  console.log("[Draft] Parameters:");
  console.log("[Draft]   attachEml:", attachEml);
  console.log("[Draft]   msgId:", msgId);
  console.log("[Draft]   emlFile provided:", emlFile ? "YES" : "NO");
  if (emlFile) {
    console.log("[Draft]   emlFile.name:", emlFile.name);
    console.log("[Draft]   emlFile.size:", emlFile.size, "bytes");
    console.log("[Draft]   emlFile.type:", emlFile.type);
  }
  console.log("[Draft]   to1:", to1);
  console.log("[Draft]   to2:", to2);
  console.log("[Draft]   body length:", body.length, "chars");
  
  // 本文が長すぎる場合は自動的に短縮
  const MAX_BODY_LENGTH = 1000; // 1000文字に制限
  let finalBody = body;
  
  if (body.length > MAX_BODY_LENGTH) {
    console.warn("[Draft] Body is too long, truncating:", body.length, "->", MAX_BODY_LENGTH);
    finalBody = body.substring(0, MAX_BODY_LENGTH) + 
                "\n\n... (本文が長すぎるため省略されました。詳細は添付のemlファイルをご確認ください)";
  }
  
  const composeParams = {
    to: [to1, to2].filter(Boolean),
    subject: "[報告] フィッシング/迷惑メールの可能性あり",
    body: finalBody,
  };
  
  console.log("[Draft] Opening compose window...");
  // ログ出力を制限（bodyの最初の100文字のみ）
  console.log("[Draft] To:", composeParams.to);
  console.log("[Draft] Subject:", composeParams.subject);
  console.log("[Draft] Body (first 100 chars):", finalBody.substring(0, 100) + "...");
  
  let ret;
  let attachmentResult = { success: false, error: "Not attempted" };
  
  try {
    // Compose windowを開く
    ret = await browser.compose.beginNew(composeParams);
    console.log("[Draft] Compose window opened successfully");
    console.log("[Draft] Return value type:", typeof ret);
    console.log("[Draft] Return value:", ret);
    
  } catch (e) {
    console.error("[Draft] Failed to open compose window:", e);
    console.error("[Draft] Error name:", e.name);
    console.error("[Draft] Error message:", e.message);
    
    // より詳細なエラーメッセージ
    let errorMsg = `メール作成に失敗しました。\n\n`;
    if (e.message.includes("connection")) {
      errorMsg += "原因: Thunderbirdとの通信に失敗しました。\n\n";
      errorMsg += "対処方法:\n";
      errorMsg += "• Thunderbirdを再起動してください\n";
      errorMsg += "• 拡張機能を再インストールしてください\n";
      errorMsg += "• メール本文が長すぎる可能性があります";
    } else {
      errorMsg += `エラー: ${e.message}`;
    }
    
    throw new Error(errorMsg);
  }
  
  // .eml添付が必要な場合
  if (attachEml && msgId && ret) {
    console.log("[Draft] Preparing .eml attachment...");
    
    try {
      // 【改善】Compose windowが完全に初期化されるまで待機（7秒→4秒に短縮）
      console.log("[Draft] Waiting for compose window to be ready (4000ms)...");
      await new Promise(r => setTimeout(r, 4000));
      
      // ファイルが事前作成されていない場合は作成
      if (!emlFile) {
        console.log("[Draft] ⚠️ .eml file not pre-created, creating now from message...");
        console.log("[Draft] Message ID:", msgId);
        
        try {
          console.log("[Draft] Calling browser.messages.getRaw...");
          const startTime = Date.now();
          const raw = await browser.messages.getRaw(msgId);
          const elapsedTime = Date.now() - startTime;
          
          console.log("[Draft] getRaw completed in", elapsedTime, "ms");
          
          if (raw && raw.length > 0) {
            console.log("[Draft] ✓ Raw message data retrieved");
            console.log("[Draft]   Size:", raw.length, "bytes");
            
            const emlBlob = new Blob([raw], { type: "message/rfc822" });
            console.log("[Draft] ✓ Blob created, size:", emlBlob.size);
            
            emlFile = new File([emlBlob], "original_message.eml", {
              type: "message/rfc822",
            });
            console.log("[Draft] ✓ File object created");
            console.log("[Draft]   File name:", emlFile.name);
            console.log("[Draft]   File size:", emlFile.size, "bytes");
            console.log("[Draft]   File type:", emlFile.type);
          } else {
            console.error("[Draft] ✗ Failed to get raw message data");
            console.error("[Draft]   raw is null or empty:", !raw || raw.length === 0);
          }
        } catch (e) {
          console.error("[Draft] ✗ Failed to create .eml file in openReportDraft");
          console.error("[Draft]   Error type:", e.name);
          console.error("[Draft]   Error message:", e.message);
          console.error("[Draft]   Error stack:", e.stack);
        }
      } else {
        console.log("[Draft] ✓ Using pre-created .eml file");
        console.log("[Draft]   File name:", emlFile.name);
        console.log("[Draft]   File size:", emlFile.size, "bytes");
        console.log("[Draft]   File type:", emlFile.type);
      }
      
      // ファイルが作成された場合のみ添付を試みる
      console.log("[Draft] =========================================");
      console.log("[Draft] Checking if .eml file is ready for attachment...");
      console.log("[Draft] emlFile exists:", !!emlFile);
      
      if (emlFile) {
        console.log("[Draft] ✓ .eml file is ready");
        console.log("[Draft]   File name:", emlFile.name);
        console.log("[Draft]   File size:", emlFile.size, "bytes");
        console.log("[Draft]   File type:", emlFile.type);
        console.log("[Draft]   File lastModified:", new Date(emlFile.lastModified).toISOString());
        
        // 【改善】添付の前の待機時間を2秒→1秒に短縮
        console.log("[Draft] Additional wait before attachment (1000ms)...");
        await new Promise(r => setTimeout(r, 1000));
        
        const tabId = normalizeComposeTabId(ret);
        console.log("[Draft] Tab ID for attachment:", tabId);
        console.log("[Draft] Attempting to attach file...");
        
        // 複数の方法で添付を試みる
        let attached = false;
        
        // 方法1: 標準的な方法
        try {
          console.log("[Draft] Trying method 1: Standard attachment...");
          await browser.compose.addAttachment(tabId, { 
            file: emlFile, 
            name: "original_message.eml" 
          });
          attached = true;
          console.log("[Draft] ✓ Method 1 successful");
        } catch (e1) {
          console.error("[Draft] Method 1 failed:", e1.message);
          
          // 方法2: ファイルのみで試す
          try {
            console.log("[Draft] Trying method 2: File only...");
            await new Promise(r => setTimeout(r, 500));
            await browser.compose.addAttachment(tabId, { file: emlFile });
            attached = true;
            console.log("[Draft] ✓ Method 2 successful");
          } catch (e2) {
            console.error("[Draft] Method 2 failed:", e2.message);
            
            // 方法3: 新しいFileオブジェクトを作成して試す
            try {
              console.log("[Draft] Trying method 3: New File object...");
              const raw = await browser.messages.getRaw(msgId);
              const newBlob = new Blob([raw], { type: "message/rfc822" });
              const newFile = new File([newBlob], "spam_report.eml", {
                type: "message/rfc822",
              });
              await new Promise(r => setTimeout(r, 500));
              await browser.compose.addAttachment(tabId, { 
                file: newFile, 
                name: "spam_report.eml" 
              });
              attached = true;
              console.log("[Draft] ✓ Method 3 successful");
            } catch (e3) {
              console.error("[Draft] Method 3 failed:", e3.message);
            }
          }
        }
        
        if (attached) {
          attachmentResult = { success: true, method: "compose" };
          console.log("[Draft] ✓ .eml file attached successfully");
        } else {
          attachmentResult = { 
            success: false, 
            error: "All attachment methods failed",
            userMessage: ".emlファイルの添付に失敗しました。\n手動で元メールを添付してください。"
          };
          console.error("[Draft] ✗ All attachment methods failed");
        }
      } else {
        attachmentResult = { 
          success: false, 
          error: "Could not create .eml file",
          userMessage: ".emlファイルの作成に失敗しました。\n手動で元メールを添付してください。"
        };
        console.error("[Draft] No .eml file to attach");
      }
      
    } catch (e) {
      console.error("[Draft] Attachment process error:", e);
      attachmentResult = { 
        success: false, 
        error: e.message,
        userMessage: "添付処理中にエラーが発生しました。\n手動で元メールを添付してください。"
      };
    }
  }
  
  console.log("[Draft] Final attachment result:", attachmentResult);
  console.log("[Draft] ===========================================");
  
  return attachmentResult;
}

// --------------------
// 10) 日本の報告機関への報告（Background Script版）
// --------------------
async function reportToJapan() {
  try {
    // スキャン結果があるか確認
    if (!lastScanResult.urls || lastScanResult.urls.length === 0) {
      setStatus('先に "Check" ボタンでスキャンを実行してください', true);
      if (typeof notify === "function") {
        notify("注意", "先にスキャンを実行してください");
      }
      return;
    }
    
    // 危険でない場合は警告（手動でReportボタンを押した場合のみ）
    if (!lastScanResult.isDangerous) {
      const proceed = confirm(
        "⚠️ このメールは安全と判定されました。\n\n" +
        "本当に報告しますか？"
      );
      if (!proceed) {
        setStatus('報告をキャンセルしました', false);
        return;
      }
    }

    console.log("[reportToJapan] =========================================");
    console.log("[reportToJapan] Starting report creation via background script...");
    console.log("[reportToJapan] Message ID:", lastScanResult.messageId);
    
    setStatus('報告メールを作成中...');

    // 【改善】Background scriptで.emlファイルを作成
    let emlData = null;
    let emlFilename = null;
    
    if (lastScanResult.messageId) {
      console.log("[reportToJapan] Creating .eml file via background script...");
      setStatus('.emlファイルを作成中（バックグラウンド処理）...');
      
      try {
        const emlResult = await browser.runtime.sendMessage({
          type: "create-eml-file",
          messageId: lastScanResult.messageId
        });
        
        if (emlResult && emlResult.success) {
          emlData = emlResult.data;
          emlFilename = emlResult.filename;
          console.log("[reportToJapan] ✓ .eml file created via background script");
          console.log("[reportToJapan]   File name:", emlFilename);
          console.log("[reportToJapan]   File size:", emlResult.size, "bytes");
        } else {
          console.error("[reportToJapan] ✗ Failed to create .eml file:", emlResult?.error);
          
          // ユーザーに確認を求める
          const proceed = confirm(
            "⚠️ .emlファイルの作成に失敗しました。\n\n" +
            `エラー: ${emlResult?.error || '不明'}\n\n` +
            "添付なしで報告メールを作成しますか？"
          );
          
          if (!proceed) {
            setStatus('.emlファイル作成失敗 - キャンセルされました', true);
            return;
          }
        }
      } catch (e) {
        console.error("[reportToJapan] ✗ Error creating .eml file:", e);
        
        const proceed = confirm(
          "⚠️ .emlファイルの作成に失敗しました。\n\n" +
          `エラー: ${e.message}\n\n` +
          "添付なしで報告メールを作成しますか？"
        );
        
        if (!proceed) {
          setStatus('.emlファイル作成失敗 - キャンセルされました', true);
          return;
        }
      }
    }
    
    console.log("[reportToJapan] .eml file state:", emlData ? "READY" : "NULL");

    // 報告本文を作成
    const body = buildReportBody({
      urls: lastScanResult.urls,
      summary: lastScanResult.summary
    });

    // 報告先
    const to1 = "info@antiphishing.jp";
    const to2 = "meiwaku@dekyo.or.jp";
    const recipients = [to1, to2];

    console.log("[reportToJapan] Creating report draft via background script...");
    setStatus('報告メール下書きを作成中...');
    
    // 【改善】Background scriptで下書きを作成
    try {
      const draftResult = await browser.runtime.sendMessage({
        type: "create-report-draft",
        recipients: recipients,
        subject: "[報告] フィッシング/迷惑メールの可能性あり",
        body: body,
        emlData: emlData,
        emlFilename: emlFilename
      });
      
      console.log("[reportToJapan] Draft result:", draftResult);
      
      if (draftResult && draftResult.success) {
        // 結果メッセージを作成
        let statusMsg = `報告メールを作成しました（${recipients.length}件）\n`;
        statusMsg += '• フィッシング対策協議会\n';
        statusMsg += '• 迷惑メール相談センター\n';
        
        if (draftResult.attached) {
          statusMsg += '\n✓ .emlファイルを添付しました\n';
        } else if (emlData) {
          statusMsg += '\n⚠️ .emlファイルの添付に失敗しました\n';
          statusMsg += '手動で元メールを添付してください\n';
        }
        
        statusMsg += '\n内容を確認して送信してください。';
        setStatus(statusMsg, true);
        
        if (typeof notify === "function") {
          let notifyMsg = `${recipients.length}件の報告メールを作成しました`;
          if (emlData && !draftResult.attached) {
            notifyMsg += "\n⚠️ .eml添付失敗 - 手動で添付してください";
          }
          notify("完了", notifyMsg);
        }
      } else {
        throw new Error(draftResult?.error || "下書き作成に失敗しました");
      }
    } catch (e) {
      console.error("[reportToJapan] ✗ Failed to create draft:", e);
      setStatus(`報告メールの作成に失敗しました: ${e.message}`, true);
      if (typeof notify === "function") {
        notify("エラー", "報告メールの作成に失敗しました");
      }
    }

    console.log("[reportToJapan] =========================================");
  } catch (e) {
    console.error('[reportToJapan] Error:', e);
    setStatus(`報告メールの作成に失敗しました: ${e.message}`, true);
    if (typeof notify === "function") {
      notify("エラー", "報告メールの作成に失敗しました");
    }
  }
}

// --------------------
// 11) 初期化
// --------------------
(function init() {
  try {
    // Checkボタン（自動レポート機能付き）
    const checkBtn = document.getElementById("checkButton");
    if (checkBtn) {
      checkBtn.addEventListener("click", runCheck);
      console.log("[UI] Check button initialized with auto-report functionality");
    } else {
      console.warn("[UI] checkButton not found");
    }
  } catch (e) {
    console.error("[UI] Error initializing DOM:", e);
  }
})();
