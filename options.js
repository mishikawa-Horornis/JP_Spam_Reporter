// options.js

// ヘルパ：要素取得（なければ即エラー）
const must = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

// 値取得（checkbox対応）
const getVal = (id) => {
  const el = must(id);
  if (el.type === 'checkbox') return el.checked;
  return (el.value || '').trim();
};

const setVal = (id, v) => {
  const el = must(id);
  if (el.type === 'checkbox') el.checked = !!v;
  else el.value = v ?? '';
};

async function saveOptions() {
  const status = document.getElementById('status'); // <div id="status"></div> を用意
  try {
    const payload = {
      vtApiKey:       getVal('vtApiKey'),
      gsbApiKey:      getVal('gsbApiKey'),
      ptAppKey:       getVal('ptAppKey'),
      toAntiPhishing: getVal('toAntiPhishing'),
      toDekyo:        getVal('toDekyo'),
      attachEml:      getVal('attachEml'),
    };

    await browser.storage.local.set(payload);
    status.textContent = '保存しました。';
    setTimeout(() => (status.textContent = ''), 3000);
  } catch (e) {
    console.error(e);
    status.textContent = `保存に失敗：${e.message}`;
  }
}

async function restoreOptions() {
  try {
    const keys = [
      'vtApiKey','gsbApiKey','ptAppKey',
      'toAntiPhishing','toDekyo','attachEml'
    ];
    const data = await browser.storage.local.get(keys);
    setVal('vtApiKey',       data.vtApiKey ?? '');
    setVal('gsbApiKey',      data.gsbApiKey ?? '');
    setVal('ptAppKey',       data.ptAppKey ?? '');
    setVal('toAntiPhishing', data.toAntiPhishing ?? '');
    setVal('toDekyo',        data.toDekyo ?? '');
    setVal('attachEml',      !!data.attachEml);
  } catch (e) {
    console.error(e);
  }
}

// DOM 準備後にイベント設定
document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  document.getElementById('saveBtn').addEventListener('click', saveOptions);
});
