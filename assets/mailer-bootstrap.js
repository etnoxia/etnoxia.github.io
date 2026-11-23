"use strict";
/* A hírlevélűrlap a sütiválasztástól függetlenül elérhető. */
(() => {
  window.ml = window.ml || function () {
    (window.ml.q = window.ml.q || []).push(arguments);
  };
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://assets.mailerlite.com/js/universal.js";
  script.id = "etnoxia-mailerlite-universal";
  script.addEventListener("error", () => {
    window.ETNOXIA_MAILERLITE_FAILED = true;
    window.dispatchEvent(new Event("etnoxia-mailer-error"));
  });
  document.head.appendChild(script);
  window.ml("account", "2748469");
  window.ETNOXIA_MAILERLITE_BOOTSTRAPPED = true;
})();
