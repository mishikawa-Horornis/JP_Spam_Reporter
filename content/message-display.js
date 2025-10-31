// content/message-display.js
// SPDX-License-Identifier: MIT
// メールビューにCheck/Reportボタンを注入するコンテンツスクリプト

(function() {
  'use strict';
  
  // 既存のボタンコンテナがあるかチェック
  if (document.getElementById('jpsr-button-container')) {
    return;
  }

  // ボタンコンテナのスタイル
  const containerStyle = `
    <style>
      #jpsr-button-container {
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 10000;
        display: flex;
        gap: 10px;
        padding: 10px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .jpsr-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      #jpsr-check-btn {
        color: white;
        background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
      }
      
      #jpsr-check-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #0056b3 0%, #003d82 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0,123,255,0.3);
      }
      
      #jpsr-check-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background: #6c757d;
      }
      
      #jpsr-report-btn {
        color: white;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      
      #jpsr-report-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #5568d3 0%, #653a8b 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(102,126,234,0.3);
      }
      
      #jpsr-report-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        background: #adb5bd;
      }
      
      #jpsr-status {
        display: none;
        padding: 8px 12px;
        background: #f8f9fa;
        border-left: 4px solid #007bff;
        border-radius: 4px;
        font-size: 13px;
        color: #333;
        max-width: 300px;
      }
      
      #jpsr-status.show {
        display: block;
      }
      
      #jpsr-status.error {
        background: #fff5f5;
        border-left-color: #dc3545;
        color: #dc3545;
      }
      
      #jpsr-status.warning {
        background: #fffbf0;
        border-left-color: #ffc107;
        color: #856404;
      }
      
      #jpsr-status.success {
        background: #f0f8f5;
        border-left-color: #28a745;
        color: #155724;
      }
      
      #jpsr-status.danger {
        background: #ffe0e0;
        border-left-color: #ff0040;
        color: #a00020;
        font-weight: 600;
      }
      
      .jpsr-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid currentColor;
        border-radius: 50%;
        animation: jpsr-spin 1s linear infinite;
      }
      
      @keyframes jpsr-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;

  // ボタンコンテナのHTML
  const containerHtml = `
    <div id="jpsr-button-container">
      <button id="jpsr-check-btn" class="jpsr-button">
        <span>●Check</span>
      </button>
      <button id="jpsr-report-btn" class="jpsr-button" disabled>
        <span>Report</span>
      </button>
      <div id="jpsr-status"></div>
    </div>
  `;

  // スタイルとコンテナを挿入
  document.head.insertAdjacentHTML('beforeend', containerStyle);
  document.body.insertAdjacentHTML('beforeend', containerHtml);

  // 要素の参照を取得
  const checkBtn = document.getElementById('jpsr-check-btn');
  const reportBtn = document.getElementById('jpsr-report-btn');
  const statusDiv = document.getElementById('jpsr-status');

  let currentCheckResult = null;
  let isChecking = false;

  // ステータス表示関数
  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = 'show';
    if (type) {
      statusDiv.classList.add(type);
    }
  }

  // ステータス非表示関数
  function hideStatus() {
    statusDiv.className = '';
  }

  // Checkボタンのクリックハンドラ
  checkBtn.addEventListener('click', async () => {
    if (isChecking) return;
    
    isChecking = true;
    checkBtn.disabled = true;
    reportBtn.disabled = true;
    checkBtn.innerHTML = '<span class="jpsr-spinner"></span> Checking...';
    showStatus('メールをチェック中...', 'info');

    try {
      // バックグラウンドスクリプトにチェック要求を送信
      const response = await browser.runtime.sendMessage({
        action: 'checkEmail'
      });

      if (response.error) {
        throw new Error(response.error);
      }

      currentCheckResult = response.result;
      
      // チェック結果に基づいてUIを更新
      if (currentCheckResult.isDangerous) {
        showStatus('⚠️ 危険なメールの可能性があります！', 'danger');
        reportBtn.disabled = false;
        reportBtn.innerHTML = '<span>📧 Report</span>';
      } else if (currentCheckResult.isSuspicious) {
        showStatus('⚠️ 疑わしいメールです', 'warning');
        reportBtn.disabled = false;
        reportBtn.innerHTML = '<span>📧 Report</span>';
      } else {
        showStatus('✅ 安全なメールです', 'success');
        reportBtn.disabled = true;
      }

      // 詳細情報を表示（危険度に応じて）
      if (currentCheckResult.summary) {
        const summary = currentCheckResult.summary;
        let details = `\\n検出結果: `;
        if (summary.malicious > 0) {
          details += `悪意あり: ${summary.malicious}件 `;
        }
        if (summary.suspicious > 0) {
          details += `疑わしい: ${summary.suspicious}件 `;
        }
        if (summary.harmless > 0) {
          details += `安全: ${summary.harmless}件 `;
        }
        statusDiv.textContent += details;
      }

    } catch (error) {
      console.error('Check failed:', error);
      showStatus(`エラー: ${error.message}`, 'error');
      reportBtn.disabled = true;
    } finally {
      isChecking = false;
      checkBtn.disabled = false;
      checkBtn.innerHTML = '<span>●Check</span>';
    }
  });

  // Reportボタンのクリックハンドラ
  reportBtn.addEventListener('click', async () => {
    if (!currentCheckResult) {
      showStatus('先にCheckを実行してください', 'warning');
      return;
    }

    reportBtn.disabled = true;
    reportBtn.innerHTML = '<span class="jpsr-spinner"></span> Creating...';
    showStatus('報告メールを作成中...', 'info');

    try {
      // バックグラウンドスクリプトに報告メール作成を要求
      const response = await browser.runtime.sendMessage({
        action: 'createReport',
        checkResult: currentCheckResult
      });

      if (response.error) {
        throw new Error(response.error);
      }

      showStatus('✅ 報告メールを作成しました', 'success');
      
      // 3秒後にステータスを非表示
      setTimeout(() => {
        hideStatus();
        // Reportボタンを再度無効化（1つのメールにつき1回のみ報告）
        reportBtn.disabled = true;
        reportBtn.innerHTML = '<span>Report</span>';
      }, 3000);

    } catch (error) {
      console.error('Report creation failed:', error);
      showStatus(`エラー: ${error.message}`, 'error');
      reportBtn.disabled = false;
      reportBtn.innerHTML = '<span>📧 Report</span>';
    }
  });

  // メッセージが変更された時にリセット
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'messageChanged') {
      // 状態をリセット
      currentCheckResult = null;
      checkBtn.disabled = false;
      reportBtn.disabled = true;
      reportBtn.innerHTML = '<span>Report</span>';
      hideStatus();
    }
  });

  console.log('JP Spam Reporter buttons injected successfully');
})();
