// utils/auth.js (MV2向け)
(function(){
  globalThis.getSetting = async function(key) {
    const res = await browser.storage.local.get(key);
    return res?.[key];
  };
  globalThis.setSetting = async function(key, val) {
    await browser.storage.local.set({ [key]: val });
  };
})();
export async function getSetting(key) {
  const res = await browser.storage.local.get(key);
  return res?.[key];
}

export async function setSetting(key, val) {
  await browser.storage.local.set({ [key]: val });
}
