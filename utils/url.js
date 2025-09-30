// utils/url.js (MV2向け)
(function(){
  globalThis.stripQuery = function(u){
    try { const x=new URL(u); x.search=""; return x.toString(); } catch { return u; }
  };
  globalThis.flipProtocol = function(u){
    try { const x=new URL(u); x.protocol=(x.protocol==="https:")?"http:":"https:"; return x.toString(); } catch { return u; }
  };
  globalThis.getDomain = function(u){
    try { return new URL(u).hostname; } catch { return ""; }
  };
})();
