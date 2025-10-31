// utils/notify.js
(function() {
  globalThis.notify = function(title, message) {
    const icon = globalThis.browser?.runtime?.getURL?.("icons/jp-spam-reporter-48.png") || "icons/jp-spam-reporter-48.png";
    browser.notifications.create({
      type: "basic",
      iconUrl: icon,
      title: title,
      message: message
    });
  };
  
  console.log("[Notify] Module loaded");
})();
