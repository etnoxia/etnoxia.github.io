"use strict";
/* Egyetlen hozzájárulás-validátor a korai MailerLite bootstrapnek és a felületnek. */
window.ETNOXIA_CONSENT = (() => {
  const KEY = "etnoxia-consent-v2";
  const VERSION = 2;
  const DURATION = 180 * 24 * 60 * 60 * 1000;
  // Csak tiltó jelzés: azonos fül újratöltésekor sikertelen tárolóírás esetén
  // sem olvasható vissza egy korábban megadott, de már visszavont engedély.
  const DENY_MARKER = "etnoxia-consent-denied-session-v2";
  const denied = () => { try { return window.name === DENY_MARKER; } catch { return false; } };
  function read() {
    if (denied()) return {youtube:false, mailerlite:false, analytics:false};
    try {
      const record = JSON.parse(window.localStorage.getItem(KEY) || "null");
      const now = Date.now();
      if (!record || record.version !== VERSION ||
          !Number.isFinite(record.timestamp) || record.timestamp > now ||
          now - record.timestamp >= DURATION ||
          ["youtube", "mailerlite", "analytics"].some(k => typeof record[k] !== "boolean")) return null;
      return {youtube:record.youtube, mailerlite:record.mailerlite, analytics:record.analytics};
    } catch { return null; }
  }
  function write(value) {
    const next = {
      youtube:!!value.youtube, mailerlite:!!value.mailerlite, analytics:!!value.analytics
    };
    try {
      window.localStorage.setItem(KEY, JSON.stringify({...next, version:VERSION, timestamp:Date.now()}));
      // Sikeres mentéskor a korábbi átmeneti tiltás feloldható.
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
