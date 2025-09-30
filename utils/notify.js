// utils/notify.js
(function(){
  globalThis.notify = function notify(title, message){
    if (!globalThis.browser?.notifications?.create) return;
    const t = String(title ?? "通知");
    const m = String(message ?? "");
    const icon = globalThis.browser.runtime?.getURL?.("icons/icon-48.png") || "icons/icon-48.png";
    try {
      globalThis.browser.notifications.create({
        type: "basic",
        iconUrl: icon,
        title: t,
        message: m
      }).catch(()=>{});
    } catch(e) { console.warn("notify error", e); }
  };
})();
