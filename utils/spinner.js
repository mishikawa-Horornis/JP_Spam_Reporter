// util/spinner.js
export function startActionSpinner(){
  const s = (globalThis._spin);
  if (!s) return;
  if (typeof s.show === "function") s.show();
  else if (s.style) s.style.display = "";
}
export function stopActionSpinner(){
  const s = (globalThis._spin);
  if (!s) return;
  if (typeof s.hide === "function") s.hide();
  else if (s.style) s.style.display = "none";
}
