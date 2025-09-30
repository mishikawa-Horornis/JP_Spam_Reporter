// utils/auth.js
export async function getSetting(key) {
  const res = await browser.storage.local.get(key);
  return res?.[key];
}

export async function setSetting(key, val) {
  await browser.storage.local.set({ [key]: val });
}
