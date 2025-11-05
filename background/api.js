// background/api.js
(function(){
  browser.runtime.onMessage.addListener(async (msg) => {
    try {
      switch (msg?.type) {
        case "extract-urls":
          return await globalThis.extractUrlsFromMessage(msg.messageId);
          
        case "get-metadata":
          if (typeof globalThis.getMessageMetadata === "function") {
            return await globalThis.getMessageMetadata(msg.messageId);
          }
          return { sender: '', senderDomain: '', senderEmail: '', subject: '', date: null, headers: {} };
          
        case "get-raw-message":
          if (typeof globalThis.getMessageRaw === "function") {
            return await globalThis.getMessageRaw(msg.messageId);
          }
          return { success: false, raw: null, error: "Function not available" };
          
        case "create-eml-file":
          console.log("[API] Creating .eml file for message:", msg.messageId);
          try {
            const raw = await browser.messages.getRaw(msg.messageId);
            if (!raw || raw.length === 0) {
              throw new Error("Failed to get raw message data");
            }
            console.log("[API] Raw message retrieved, size:", raw.length, "bytes");
            
            // Blobを作成してBase64エンコード（転送用）
            const blob = new Blob([raw], { type: "message/rfc822" });
            const reader = new FileReader();
            
            return new Promise((resolve, reject) => {
              reader.onload = () => {
                console.log("[API] .eml file created successfully");
                resolve({
                  success: true,
                  data: reader.result, // Base64 data URL
                  size: raw.length,
                  filename: `suspicious-mail-${msg.messageId}-${Date.now()}.eml`
                });
              };
              reader.onerror = () => {
                console.error("[API] Failed to read blob");
                reject(new Error("Failed to read blob"));
              };
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error("[API] Failed to create .eml file:", e);
            return { success: false, error: e.message };
          }
          
        case "create-report-draft":
          console.log("[API] Creating report draft...");
          console.log("[API] Recipients:", msg.recipients);
          console.log("[API] Has emlData:", !!msg.emlData);
          
          try {
            // 下書きを作成
            const composeTab = await browser.compose.beginNew({
              to: msg.recipients,
              subject: msg.subject,
              body: msg.body
            });
            
            console.log("[API] Compose window created:", composeTab);
            
            // .emlファイルの添付
            if (msg.emlData && msg.emlFilename) {
              console.log("[API] Attaching .eml file...");
              
              // 待機時間を確保
              await new Promise(r => setTimeout(r, 5000));
              
              // Base64データをBlobに変換
              const base64Data = msg.emlData.split(',')[1];
              const binaryData = atob(base64Data);
              const bytes = new Uint8Array(binaryData.length);
              for (let i = 0; i < binaryData.length; i++) {
                bytes[i] = binaryData.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: "message/rfc822" });
              const file = new File([blob], msg.emlFilename, {
                type: "message/rfc822"
              });
              
              console.log("[API] File created for attachment, size:", file.size);
              
              // Tab IDを取得
              const tabId = typeof composeTab === 'object' ? composeTab.id : composeTab;
              console.log("[API] Attaching to tab:", tabId);
              
              // 添付を試行
              try {
                await browser.compose.addAttachment(tabId, {
                  file: file,
                  name: msg.emlFilename
                });
                console.log("[API] ✓ Attachment successful");
                return { success: true, attached: true };
              } catch (attachError) {
                console.error("[API] ✗ Attachment failed:", attachError);
                return { success: true, attached: false, error: attachError.message };
              }
            }
            
            return { success: true, attached: false };
          } catch (e) {
            console.error("[API] Failed to create report draft:", e);
            return { success: false, error: e.message };
          }
          
        case "detect-phishing":
          if (typeof globalThis.detectPhishing === "function") {
            // ホワイトリストを設定から読み込む
            const settings = await browser.storage.local.get({ domainWhitelist: '' });
            const whitelist = settings.domainWhitelist
              ? settings.domainWhitelist.split('\n').map(d => d.trim()).filter(d => d.length > 0)
              : [];
            return globalThis.detectPhishing(msg.url, msg.emailMeta, whitelist);
          }
          return { suspicious: false, reasons: [], actualDomain: msg.url, trusted: false };
          
        case "check-mixed-domains":
          if (typeof globalThis.checkMixedDomains === "function") {
            return globalThis.checkMixedDomains(msg.urls, msg.expectedDomain);
          }
          return { hasMixedDomains: false, externalUrls: [] };
          
        case "check-gsb":
          return await globalThis.checkWithGSB(msg.url, msg.apiKey);
          
        case "check-pt":
          return await globalThis.checkWithPT(msg.url, msg.appKey);
          
        case "check-vt":
          return await globalThis.checkWithVT(msg.url, msg.apiKey);
          
        default:
          return { verdict: "unknown", error: "unknown message" };
      }
    } catch (e) {
      console.error("api error:", e);
      return { verdict: "unknown", error: String(e) };
    }
  });
  
  console.log("[API] Module loaded");
})();
