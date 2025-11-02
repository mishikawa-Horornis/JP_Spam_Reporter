// background/providers/gsb.js
// CORS対策強化版
(function() {
  globalThis.checkWithGSB = async function(url, apiKey) {
    if (!apiKey) {
      return { verdict: "unknown", error: "Google Safe Browsing API key not set" };
    }

    try {
      console.log("[GSB] Starting check for URL:", url);
      
      const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
      const body = {
        client: {
          clientId: "jp-spam-reporter-enhanced",
          clientVersion: "2.3.0"
        },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: url }]
        }
      };

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body),
        mode: 'cors',
        credentials: 'omit'
      }).catch(err => {
        console.error("[GSB] Fetch error:", err);
        throw new Error(`ネットワークエラー: ${err.message}`);
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unknown error');
        console.error("[GSB] API error:", resp.status, errorText);
        return { 
          verdict: "unknown", 
          error: `APIエラー (HTTP ${resp.status})`,
          details: errorText
        };
      }

      const data = await resp.json();
      console.log("[GSB] Response:", data);
      
      if (data.matches && data.matches.length > 0) {
        const threatTypes = data.matches.map(m => m.threatType).join(', ');
        console.log("[GSB] Threats found:", threatTypes);
        return { 
          verdict: "malicious", 
          details: data.matches,
          summary: `Detected threats: ${threatTypes}`
        };
      }

      console.log("[GSB] No threats found");
      return { verdict: "clean", summary: "No threats detected by Google Safe Browsing" };

    } catch (e) {
      console.error("[GSB] Exception:", e);
      
      // CORS エラーの特定
      if (e.message && (e.message.includes('CORS') || e.message.includes('NetworkError'))) {
        return { 
          verdict: "unknown", 
          error: "ネットワークエラー: Google Safe Browsing APIへの接続に失敗しました。APIキーを確認してください。",
          isCorsError: true
        };
      }
      
      return { 
        verdict: "unknown", 
        error: `エラー: ${e.message || String(e)}`
      };
    }
  };
  
  console.log("[GSB] Module loaded with enhanced CORS support");
})();
