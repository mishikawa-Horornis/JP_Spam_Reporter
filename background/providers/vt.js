// background/providers/vt.js
// SPDX-License-Identifier: MIT
// CORS対策強化版
(function() {
  globalThis.checkWithVT = async function(url, apiKey) {
    if (!apiKey) {
      return { verdict: "unknown", error: "VirusTotal API key not set" };
    }

    // URL検証
    if (!url || typeof url !== 'string') {
      console.error("[VT] Invalid URL:", url);
      return { verdict: "unknown", error: "無効なURLです" };
    }

    // URLをクリーンアップ
    const cleanUrl = url.trim().replace(/[\r\n\t]/g, '');
    
    // URLの形式を検証
    try {
      new URL(cleanUrl);
    } catch (e) {
      console.error("[VT] Invalid URL format:", cleanUrl);
      return { verdict: "unknown", error: "URLの形式が無効です" };
    }

    try {
      console.log("[VT] Starting check for URL:", cleanUrl);
      
      // URL IDを生成（base64エンコード - 日本語対応）
      // TextEncoderを使って安全にエンコード
      const encoder = new TextEncoder();
      const data = encoder.encode(cleanUrl);
      let binary = '';
      for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
      }
      const urlId = btoa(binary).replace(/=/g, '');
      
      // 既存の分析結果を取得
      console.log("[VT] Checking existing analysis...");
      const getResp = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
        method: 'GET',
        headers: { 
          "x-apikey": apiKey,
          "Accept": "application/json"
        },
        mode: 'cors',
        credentials: 'omit'
      }).catch(err => {
        console.error("[VT] Fetch error (GET):", err);
        throw new Error(`ネットワークエラー: ${err.message}`);
      });

      if (getResp.ok) {
        const data = await getResp.json();
        const stats = data?.data?.attributes?.last_analysis_stats || {};
        const malicious = stats.malicious || 0;
        const suspicious = stats.suspicious || 0;
        const total = (stats.malicious || 0) + (stats.suspicious || 0) + 
                      (stats.harmless || 0) + (stats.undetected || 0);
        
        console.log("[VT] Existing analysis found:", stats);
        
        if (malicious > 0) {
          return { 
            verdict: "malicious", 
            details: stats,
            summary: `${malicious}/${total} engines detected this URL as malicious`
          };
        }
        if (suspicious > 0) {
          return { 
            verdict: "suspicious", 
            details: stats,
            summary: `${suspicious}/${total} engines marked this URL as suspicious`
          };
        }
        return { 
          verdict: "clean", 
          details: stats,
          summary: `${stats.harmless || 0}/${total} engines marked this URL as harmless`
        };
      }

      // 404の場合は新規スキャンを実行
      if (getResp.status === 404) {
        console.log("[VT] URL not found, submitting for analysis...");
        
        // 新規スキャン
        const formData = new FormData();
        formData.append('url', cleanUrl);
        
        const postResp = await fetch('https://www.virustotal.com/api/v3/urls', {
          method: 'POST',
          headers: { 
            "x-apikey": apiKey
          },
          body: formData,
          mode: 'cors',
          credentials: 'omit'
        }).catch(err => {
          console.error("[VT] Fetch error (POST):", err);
          throw new Error(`ネットワークエラー: ${err.message}`);
        });

        if (!postResp.ok) {
          const errorText = await postResp.text().catch(() => 'Unknown error');
          console.error("[VT] POST failed:", postResp.status, errorText);
          return { 
            verdict: "unknown", 
            error: `APIエラー (HTTP ${postResp.status})`,
            details: errorText
          };
        }

        const postData = await postResp.json();
        const analysisId = postData?.data?.id;
        
        if (!analysisId) {
          return { verdict: "unknown", error: "分析IDを取得できませんでした" };
        }

        console.log("[VT] Analysis submitted, waiting for results...");
        
        // 結果を待つ（段階的に待機時間を延ばす）
        let attempts = 0;
        const maxAttempts = 5;
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000 + (attempts * 1000)));
          attempts++;
          
          console.log(`[VT] Checking analysis results (attempt ${attempts}/${maxAttempts})...`);
          
          const analysisResp = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
            method: 'GET',
            headers: { 
              "x-apikey": apiKey,
              "Accept": "application/json"
            },
            mode: 'cors',
            credentials: 'omit'
          }).catch(err => {
            console.error("[VT] Fetch error (analysis):", err);
            throw new Error(`ネットワークエラー: ${err.message}`);
          });

          if (!analysisResp.ok) {
            console.error("[VT] Analysis check failed:", analysisResp.status);
            continue;
          }

          const analysisData = await analysisResp.json();
          const status = analysisData?.data?.attributes?.status;
          
          console.log("[VT] Analysis status:", status);
          
          if (status === "completed") {
            const stats = analysisData?.data?.attributes?.stats || {};
            const malicious = stats.malicious || 0;
            const suspicious = stats.suspicious || 0;
            const total = (stats.malicious || 0) + (stats.suspicious || 0) + 
                          (stats.harmless || 0) + (stats.undetected || 0);
            
            console.log("[VT] Analysis completed:", stats);
            
            if (malicious > 0) {
              return { 
                verdict: "malicious", 
                details: stats,
                summary: `${malicious}/${total} engines detected this URL as malicious`
              };
            }
            if (suspicious > 0) {
              return { 
                verdict: "suspicious", 
                details: stats,
                summary: `${suspicious}/${total} engines marked this URL as suspicious`
              };
            }
            return { 
              verdict: "clean", 
              details: stats,
              summary: `${stats.harmless || 0}/${total} engines marked this URL as harmless`
            };
          }
        }
        
        return { 
          verdict: "unknown", 
          error: "分析がタイムアウトしました。後でもう一度お試しください。"
        };
      }

      // その他のエラー
      const errorText = await getResp.text().catch(() => 'Unknown error');
      console.error("[VT] Unexpected error:", getResp.status, errorText);
      return { 
        verdict: "unknown", 
        error: `APIエラー (HTTP ${getResp.status})`,
        details: errorText
      };

    } catch (e) {
      console.error("[VT] Exception:", e);
      
      // CORS エラーの特定
      if (e.message && (e.message.includes('CORS') || e.message.includes('NetworkError'))) {
        return { 
          verdict: "unknown", 
          error: "ネットワークエラー: VirusTotal APIへの接続に失敗しました。APIキーを確認してください。",
          isCorsError: true
        };
      }
      
      return { 
        verdict: "unknown", 
        error: `エラー: ${e.message || String(e)}`
      };
    }
  };
  
  console.log("[VT] Module loaded with enhanced CORS support and URL validation");
})();
