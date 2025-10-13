// background/providers/vt.js (改善版)
(function(){
  // URLからVT用のIDを生成
  function vtUrlId(rawUrl) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(rawUrl);
      let b64 = btoa(String.fromCharCode(...data));
      // base64url変換
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
      return "";
    }
  }

  async function checkWithVT(url, apiKey, { timeoutMs = 15000 } = {}) {
    console.log("[VT] checkWithVT called for:", url);
    
    if (!apiKey) {
      console.warn("[VT] No API key provided");
      return { verdict:"unknown", details:{reason:"no_api_key"} };
    }
    
    const headers = { "x-apikey": apiKey, "Accept": "application/json" };
    const ac = new AbortController(); 
    const to = setTimeout(()=>ac.abort(), timeoutMs);
    
    try {
      // まず既存の分析結果をチェック
      console.log("[VT] Checking for existing analysis...");
      const urlId = vtUrlId(url);
      if (urlId) {
        try {
          const existingResult = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
            headers,
            signal: ac.signal
          });
          
          if (existingResult.ok) {
            const existing = await existingResult.json();
            const stats = existing?.data?.attributes?.last_analysis_stats;
            if (stats) {
              console.log("[VT] Found existing analysis:", stats);
              const malicious = stats.malicious || 0;
              const suspicious = stats.suspicious || 0;
              const harmless = stats.harmless || 0;
              
              if (malicious > 0 || suspicious > 0) {
                console.log("[VT] Verdict: listed (from existing)");
                return { verdict: "listed", details: stats, source: "existing" };
              } else if (harmless > 0) {
                console.log("[VT] Verdict: clean (from existing)");
                return { verdict: "clean", details: stats, source: "existing" };
              }
            }
          } else {
            console.log(`[VT] No existing analysis found (${existingResult.status})`);
          }
        } catch (e) {
          console.log("[VT] Error checking existing analysis:", e.message);
          // 既存分析の取得に失敗しても、新規分析に進む
        }
      }
      
      // 新規分析を送信
      console.log("[VT] Submitting URL for new analysis...");
      const submitHeaders = { 
        "x-apikey": apiKey, 
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      };
      const form = new URLSearchParams({ url });
      const submit = await fetch("https://www.virustotal.com/api/v3/urls", { 
        method: "POST", 
        headers: submitHeaders, 
        body: form.toString(), 
        signal: ac.signal 
      });
      
      if (!submit.ok) {
        console.error("[VT] Submit failed:", submit.status, submit.statusText);
        try {
          const errorData = await submit.json();
          console.error("[VT] Error details:", errorData);
          return { verdict:"unknown", details:{error: `HTTP ${submit.status}`, data: errorData} };
        } catch {
          const errorText = await submit.text().catch(() => "");
          return { verdict:"unknown", details:{error: `HTTP ${submit.status}`, response: errorText} };
        }
      }
      
      const sub = await submit.json(); 
      const analysisId = sub?.data?.id;
      console.log("[VT] Analysis ID:", analysisId);
      
      if (!analysisId) {
        console.error("[VT] No analysis ID returned:", sub);
        return { verdict:"unknown", details:sub };
      }
      
      // 結果を待つ（最大12回、各1秒間隔）
      console.log("[VT] Polling for results...");
      for (let i = 0; i < 12; i++) {
        // 最初の試行以外は待機
        if (i > 0) {
          await new Promise(rs => setTimeout(rs, 1000));
        }
        
        console.log(`[VT] Polling attempt ${i+1}/12...`);
        const pollResult = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, { 
          headers,
          signal: ac.signal 
        });
        
        if (!pollResult.ok) {
          console.warn(`[VT] Poll failed: ${pollResult.status}`);
          if (pollResult.status === 429) {
            console.log("[VT] Rate limited, waiting 2 seconds...");
            await new Promise(rs => setTimeout(rs, 2000));
          }
          continue;
        }
        
        const pollData = await pollResult.json();
        const status = pollData?.data?.attributes?.status;
        console.log(`[VT] Status: ${status}`);
        
        if (status === "completed") {
          const stats = pollData?.data?.attributes?.stats || {};
          console.log("[VT] Analysis completed. Stats:", stats);
          
          const malicious = stats.malicious || 0;
          const suspicious = stats.suspicious || 0;
          const harmless = stats.harmless || 0;
          
          if (malicious > 0 || suspicious > 0) {
            console.log("[VT] Verdict: listed");
            return { verdict: "listed", details: stats, source: "new_analysis" };
          } else if (harmless > 0) {
            console.log("[VT] Verdict: clean");
            return { verdict: "clean", details: stats, source: "new_analysis" };
          } else {
            console.log("[VT] Verdict: unknown (no votes)");
            return { verdict: "unknown", details: stats, source: "new_analysis" };
          }
        }
      }
      
      console.warn("[VT] Timeout - analysis not completed after 12 attempts");
      return { verdict:"unknown", details:{reason:"timeout"} };
      
    } catch (e) {
      console.error("[VT] Exception:", e);
      return { verdict:"unknown", details:{error: String(e), stack: e.stack} };
    } finally { 
      clearTimeout(to); 
    }
  }
  
  globalThis.checkWithVT = checkWithVT;
})();
