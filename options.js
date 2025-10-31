// options.js
// SPDX-License-Identifier: MIT
document.addEventListener('DOMContentLoaded', async () => {
  // 設定を読み込む
  const settings = await browser.storage.local.get({
    checkMode: 'vt',
    vtApiKey: '',
    gsbApiKey: '',
    ptAppKey: '',
    reportToAntiPhishing: true,
    reportToDekyo: true,
    attachEml: true,
    showToolbarButtons: true,
    autoCheckDanger: false
  });
  
  // checkModeフィールドの存在をチェック（古いバージョンではmodeという名前だった可能性）
  const modeElement = document.getElementById('checkMode') || document.getElementById('mode');
  if (modeElement) {
    modeElement.value = settings.checkMode || 'vt';
  }
  
  document.getElementById('vtApiKey').value = settings.vtApiKey || '';
  document.getElementById('gsbApiKey').value = settings.gsbApiKey || '';
  document.getElementById('ptAppKey').value = settings.ptAppKey || '';
  
  // チェックボックスの設定（要素が存在する場合のみ）
  const checkboxes = {
    'reportToAntiPhishing': settings.reportToAntiPhishing,
    'reportToDekyo': settings.reportToDekyo,
    'attachEml': settings.attachEml,
    'showToolbarButtons': settings.showToolbarButtons,
    'autoCheckDanger': settings.autoCheckDanger
  };
  
  for (const [id, checked] of Object.entries(checkboxes)) {
    const element = document.getElementById(id);
    if (element) {
      element.checked = checked;
    }
  }
  
  console.log('[Options] Loaded settings:', settings);
});

document.getElementById('save').addEventListener('click', async () => {
  const modeElement = document.getElementById('checkMode') || document.getElementById('mode');
  const checkMode = modeElement ? modeElement.value : 'vt';
  
  const settings = {
    checkMode: checkMode,
    vtApiKey: document.getElementById('vtApiKey').value,
    gsbApiKey: document.getElementById('gsbApiKey').value,
    ptAppKey: document.getElementById('ptAppKey').value
  };
  
  // チェックボックスの値を取得（要素が存在する場合のみ）
  const checkboxIds = [
    'reportToAntiPhishing',
    'reportToDekyo',
    'attachEml',
    'showToolbarButtons',
    'autoCheckDanger'
  ];
  
  checkboxIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      settings[id] = element.checked;
    }
  });
  
  await browser.storage.local.set(settings);
  
  const status = document.getElementById('status');
  status.style.display = 'block';
  status.style.background = '#d4edda';
  status.style.color = '#155724';
  status.textContent = '✅ 設定を保存しました';
  
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
  
  console.log('[Options] Saved settings:', settings);
});
