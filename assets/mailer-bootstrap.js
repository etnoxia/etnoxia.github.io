"use strict";
/* Korai betöltés csak a felülettel azonos, TELJESEN validált engedéllyel. */
(() => {
  const consent = window.ETNOXIA_CONSENT?.read();
  if (!consent?.mailerlite) return;
  window.ml = window.ml || function () {
    (window.ml.q = window.ml.q || []).push(arguments);
  };
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://assets.mailerlite.com/js/universal.js";
  script.id = "etnoxia-mailerlite-universal";
  script.addEventListener("error", () => window.dispatchEvent(new Event("etnoxia-mailer-error")));
  document.head.appendChild(script);
  window.ml("account", "2748469");
  window.ETNOXIA_MAILERLITE_BOOTSTRAPPED = true;
})();
