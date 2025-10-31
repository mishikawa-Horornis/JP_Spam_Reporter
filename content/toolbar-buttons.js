// content/toolbar-buttons.js
// SPDX-License-Identifier: MIT
// メールビューのツールバーにCheck/Reportボタンを追加（改良版）

console.log('[JPSR] Toolbar buttons script loading...');

// 既にボタンが追加されているかチェック
if (typeof window.jpsrButtonsInitialized === 'undefined') {
  window.jpsrButtonsInitialized = true;
  
  // スタイルを追加
  const style = document.createElement('style');
  style.textContent = `
    .jpsr-toolbar-container {
      display: inline-flex;
      gap: 8px;
      margin: 0 8px;
      padding: 4px 8px;
      border-left: 1px solid #ccc;
      align-items: center;
    }
    
    .jpsr-toolbar-button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 12px;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid;
      border-radius: 4px;
      cursor: pointer;
      background: white;
      transition: all 0.2s ease;
    }
    
    .jpsr-check-button {
      color: #0066cc;
      border-color: #0066cc;
    }
    
    .jpsr-check-button:hover:not(:disabled) {
      background: #0066cc;
      color: white;
    }
    
    .jpsr-report-button {
      color: #663399;
      border-color: #663399;
    }
    
    .jpsr-report-button:hover:not(:disabled) {
      background: #663399;
      color: white;
    }
    
    .jpsr-toolbar-button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      background: #f5f5f5;
    }
    
    .jpsr-status-indicator {
      display: none;
      padding: 4px 10px;
      font-size: 12px;
      border-radius: 4px;
      margin-left: 8px;
    }
    
    .jpsr-status-indicator.show {
      display: inline-block;
    }
    
    .jpsr-status-success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .jpsr-status-warning {
      background: #fff3cd;
      color: #856404;
      border: 1px solid #ffeeba;
    }
    
    .jpsr-status-danger {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    .jpsr-status-info {
      background: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
    }
    
    @keyframes jpsr-pulse {
      0% { opacity: 1; }
      50% { opacity: 0.6; }
      100% { opacity: 1; }
    }
    
    .jpsr-checking {
      animation: jpsr-pulse 1.5s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);

  let currentCheckResult = null;
  let containerElement = null;
  let checkButton = null;
  let reportButton = null;
  let statusIndicator = null;

  // ボタンコンテナを作成
  function createButtons() {
    console.log('[JPSR] Creating toolbar buttons...');
    
    // コンテナ作成
    containerElement = document.createElement('div');
    containerElement.className = 'jpsr-toolbar-container';
    containerElement.id = 'jpsr-toolbar-container';

    // Checkボタン
    checkButton = document.createElement('button');
    checkButton.className = 'jpsr-toolbar-button jpsr-check-button';
    checkButton.innerHTML = '<span>●</span> Check';
    checkButton.title = 'メールの安全性をチェック';
    
    // Reportボタン
    reportButton = document.createElement('button');
    reportButton.className = 'jpsr-toolbar-button jpsr-report-button';
    reportButton.innerHTML = '📧 Report';
    reportButton.title = '迷惑メールを報告';
    reportButton.disabled = true;
    
    // ステータスインジケーター
    statusIndicator = document.createElement('span');
    statusIndicator.className = 'jpsr-status-indicator';
    
    // コンテナに追加
    containerElement.appendChild(checkButton);
    containerElement.appendChild(reportButton);
    containerElement.appendChild(statusIndicator);
    
    // イベントハンドラー設定
    checkButton.addEventListener('click', handleCheckClick);
    reportButton.addEventListener('click', handleReportClick);
    
    return containerElement;
  }

  // ツールバーにボタンを挿入
  function insertButtons() {
    // 既存のボタンコンテナを削除
    const existing = document.getElementById('jpsr-toolbar-container');
    if (existing) {
      existing.remove();
    }

    // Thunderbirdのツールバーを探す（複数の可能性がある）
    const toolbarSelectors = [
      '.message-header-toolbar',
      '.messageHeader',
      '#msgHeaderView',
      '#messagepane-toolbar',
      '#header-view-toolbar',
      '.toolbar-primary',
      '[role="toolbar"]'
    ];

    let toolbar = null;
    for (const selector of toolbarSelectors) {
      toolbar = document.querySelector(selector);
      if (toolbar) {
        console.log('[JPSR] Found toolbar with selector:', selector);
        break;
      }
    }

    if (!toolbar) {
      console.log('[JPSR] Toolbar not found, trying alternative insertion...');
      // 代替案：メッセージヘッダーエリアに挿入
      const headerArea = document.querySelector('.message-header, #msgHeaderView, [id*="header"]');
      if (headerArea) {
        const container = createButtons();
        headerArea.appendChild(container);
        console.log('[JPSR] Buttons added to header area');
        return true;
      }
      console.warn('[JPSR] No suitable location found for buttons');
      return false;
    }

    // ツールバーにボタンを追加
    const container = createButtons();
    toolbar.appendChild(container);
    console.log('[JPSR] Buttons added to toolbar');
    return true;
  }

  // ステータス表示
  function showStatus(message, type = 'info') {
    if (statusIndicator) {
      statusIndicator.textContent = message;
      statusIndicator.className = `jpsr-status-indicator show jpsr-status-${type}`;
      
      // 5秒後に自動的に非表示
      setTimeout(() => {
        statusIndicator.className = 'jpsr-status-indicator';
      }, 5000);
    }
  }

  // Checkボタンのクリックハンドラ
  async function handleCheckClick() {
    console.log('[JPSR] Check button clicked');
    
    if (checkButton.disabled) return;
    
    checkButton.disabled = true;
    checkButton.classList.add('jpsr-checking');
    checkButton.innerHTML = '⏳ Checking...';
    showStatus('メールをチェック中...', 'info');

    try {
      const response = await browser.runtime.sendMessage({
        action: 'checkEmail'
      });

      if (response.error) {
        throw new Error(response.error);
      }

      currentCheckResult = response.result;
      console.log('[JPSR] Check result:', currentCheckResult);
      
      // 結果に基づいてUIを更新
      if (currentCheckResult.isDangerous) {
        showStatus('⚠️ 危険なメールです！報告を推奨します', 'danger');
        reportButton.disabled = false;
        checkButton.innerHTML = '⚠️ 危険';
        checkButton.style.color = '#dc3545';
      } else if (currentCheckResult.isSuspicious) {
        showStatus('⚠️ 疑わしいメールです', 'warning');
        reportButton.disabled = false;
        checkButton.innerHTML = '⚠️ 疑わしい';
        checkButton.style.color = '#ffc107';
      } else {
        showStatus('✅ 安全なメールです', 'success');
        reportButton.disabled = true;
        checkButton.innerHTML = '✅ 安全';
        checkButton.style.color = '#28a745';
      }

    } catch (error) {
      console.error('[JPSR] Check failed:', error);
      showStatus(`エラー: ${error.message}`, 'danger');
      checkButton.innerHTML = '❌ エラー';
    } finally {
      checkButton.disabled = false;
      checkButton.classList.remove('jpsr-checking');
    }
  }

  // Reportボタンのクリックハンドラ
  async function handleReportClick() {
    console.log('[JPSR] Report button clicked');
    
    if (!currentCheckResult || reportButton.disabled) {
      showStatus('先にCheckを実行してください', 'warning');
      return;
    }

    reportButton.disabled = true;
    reportButton.innerHTML = '⏳ 作成中...';
    showStatus('報告メールを作成中...', 'info');

    try {
      const response = await browser.runtime.sendMessage({
        action: 'createReport',
        checkResult: currentCheckResult
      });

      if (response.error) {
        throw new Error(response.error);
      }

      showStatus('✅ 報告メールを作成しました', 'success');
      reportButton.innerHTML = '✅ 報告済み';
      
    } catch (error) {
      console.error('[JPSR] Report creation failed:', error);
      showStatus(`エラー: ${error.message}`, 'danger');
      reportButton.disabled = false;
      reportButton.innerHTML = '📧 Report';
    }
  }

  // メッセージ変更の監視
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'messageChanged') {
      console.log('[JPSR] Message changed, resetting state');
      // 状態をリセット
      currentCheckResult = null;
      if (checkButton) {
        checkButton.disabled = false;
        checkButton.innerHTML = '<span>●</span> Check';
        checkButton.style.color = '';
      }
      if (reportButton) {
        reportButton.disabled = true;
        reportButton.innerHTML = '📧 Report';
      }
      if (statusIndicator) {
        statusIndicator.className = 'jpsr-status-indicator';
      }
    }
  });

  // DOMContentLoadedまたはロード完了を待つ
  function initialize() {
    console.log('[JPSR] Initializing toolbar buttons...');
    
    // 初回の挿入を試みる
    const inserted = insertButtons();
    
    if (!inserted) {
      // 挿入に失敗した場合、少し待ってリトライ
      let retryCount = 0;
      const maxRetries = 10;
      
      const retryInterval = setInterval(() => {
        retryCount++;
        console.log(`[JPSR] Retry attempt ${retryCount}/${maxRetries}`);
        
        const inserted = insertButtons();
        if (inserted || retryCount >= maxRetries) {
          clearInterval(retryInterval);
          if (!inserted) {
            console.error('[JPSR] Failed to insert buttons after multiple attempts');
          }
        }
      }, 1000);
    }
  }

  // 初期化のタイミングを調整
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // 既にDOMがロードされている場合
    setTimeout(initialize, 100);
  }
  
  // MutationObserverで動的な変更を監視
  const observer = new MutationObserver((mutations) => {
    // ツールバーが動的に追加された場合に対応
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const hasToolbar = [...mutation.addedNodes].some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            return node.matches && (
              node.matches('.message-header-toolbar, .messageHeader, #msgHeaderView') ||
              node.querySelector && node.querySelector('.message-header-toolbar, .messageHeader, #msgHeaderView')
            );
          }
          return false;
        });
        
        if (hasToolbar && !document.getElementById('jpsr-toolbar-container')) {
          console.log('[JPSR] Toolbar detected via MutationObserver, inserting buttons...');
          setTimeout(insertButtons, 100);
        }
      }
    }
  });
  
  // body全体を監視
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[JPSR] Toolbar buttons script initialized');
}
