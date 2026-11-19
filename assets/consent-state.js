"use strict";
/* A közös hozzájárulási állapot csak a valóban opcionális kategóriákat kezeli. */
window.ETNOXIA_CONSENT = (() => {
  const KEY = "etnoxia-consent-v4";
  const VERSION = 4;
  const DURATION = 180 * 24 * 60 * 60 * 1000;
  const DENY_MARKER = "etnoxia-consent-denied-session-v4";
  const denied = () => { try { return window.name === DENY_MARKER; } catch { return false; } };
  function read() {
    if (denied()) return {youtube:false, analytics:false, decided:true};
    try {
      const record = JSON.parse(window.localStorage.getItem(KEY) || "null");
      const now = Date.now();
      if (!record || record.version !== VERSION ||
          !Number.isFinite(record.timestamp) || record.timestamp > now ||
          now - record.timestamp >= DURATION ||
          ["youtube", "analytics", "decided"].some(k => typeof record[k] !== "boolean")) return null;
      return {youtube:record.youtube, analytics:record.analytics, decided:record.decided};
    } catch { return null; }
  }
  function write(value) {
    const next = {youtube:!!value.youtube, analytics:!!value.analytics, decided:!!value.decided};
    try {
      window.localStorage.setItem(KEY, JSON.stringify({...next, version:VERSION, timestamp:Date.now()}));
      if (denied()) window.name = "";
      return true;
    } catch { return false; }
  }
  function denyForSession() {
    try { window.name = DENY_MARKER; return denied(); } catch { return false; }
  }
  function clearSessionDeny() {
    try { if (denied()) window.name = ""; } catch { /* stay closed */ }
  }
  return Object.freeze({KEY, VERSION, DURATION, read, write, denied, denyForSession, clearSessionDeny});
})();
