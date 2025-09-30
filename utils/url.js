// utils/url.js
export function stripQuery(u) {
  try { const x = new URL(u); x.search = ""; return x.toString(); } catch { return u; }
}
export function flipProtocol(u) {
  try { const x = new URL(u); x.protocol = (x.protocol==="https:")?"http:":"https:"; return x.toString(); } catch { return u; }
}
export function getDomain(u) {
  try { return new URL(u).hostname; } catch { return ""; }
}