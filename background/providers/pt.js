// background/providers/pt.js
// CORS対策強化版
(function() {
  globalThis.checkWithPT = async function(url, appKey) {
    try {
      console.log("[PT] Starting check for URL:", url);
      
      const encodedUrl = encodeURIComponent(url);
      let endpoint = `https://checkurl.phishtank.com/checkurl/`;
      
      if (appKey) {
        endpoint += `?url=${encodedUrl}&format=json&app_key=${appKey}`;
      } else {
        endpoint += `?url=${encodedUrl}&format=json`;
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'User-Agent': 'JP-Spam-Reporter-Enhanced/2.3.0',
          'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'omit'
      }).catch(err => {
        console.error("[PT] Fetch error:", err);
        throw new Error(`ネットワークエラー: ${err.message}`);
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unknown error');
        console.error("[PT] API error:", resp.status, errorText);
        
        // PhishTankの特定のエラーコード処理
        if (resp.status === 509) {
          return { 
            verdict: "unknown", 
            error: "PhishTankのAPI制限に達しました。しばらく待ってから再度お試しください。",
            trace: "HTTP 509: Bandwidth Limit Exceeded"
          };
        }
        
        return { 
          verdict: "unknown", 
          error: `APIエラー (HTTP ${resp.status})`,
          details: errorText
        };
      }

      const data = await resp.json();
      console.log("[PT] Response:", data);
      
      let trace = `PhishTank Check:\n`;
      trace += `URL: ${url}\n`;
      trace += `In Database: ${data.results?.in_database ? 'Yes' : 'No'}\n`;
      
      if (data.results && data.results.in_database) {
        trace += `Valid Phish: ${data.results.valid ? 'Yes' : 'No'}\n`;
        trace += `Verified: ${data.results.verified ? 'Yes' : 'No'}\n`;
        
        if (data.results.phish_id) {
          trace += `Phish ID: ${data.results.phish_id}\n`;
        }
        
        if (data.results.valid) {
          console.log("[PT] Phishing URL detected");
          return { 
            verdict: "malicious", 
            details: data.results,
            summary: "URL is listed in PhishTank database as a phishing site",
            trace: trace
          };
        }
      }

      console.log("[PT] URL not in database or not valid phish");
      trace += `Status: Clean\n`;
      
      return { 
        verdict: "clean",
        summary: "URL not found in PhishTank phishing database",
        trace: trace
      };

    } catch (e) {
      console.error("[PT] Exception:", e);
      
      // CORS エラーの特定
      if (e.message && (e.message.includes('CORS') || e.message.includes('NetworkError'))) {
        return { 
          verdict: "unknown", 
          error: "ネットワークエラー: PhishTank APIへの接続に失敗しました。",
          isCorsError: true,
          trace: `Network Error: ${e.message}`
        };
      }
      
      return { 
        verdict: "unknown", 
        error: `エラー: ${e.message || String(e)}`,
        trace: `Exception: ${e.stack || e.message}`
      };
    }
  };
  
  console.log("[PT] Module loaded with enhanced CORS support");
})();
