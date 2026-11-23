"use strict";
/* Etnoxia: előzetes hozzájárulás az opcionális YouTube- és statisztikai szolgáltatásokhoz. */
(() => {
  const consent = window.ETNOXIA_CONSENT;
  if (!consent) return;
  const preview = document.getElementById("main-player");
  const newsletter = document.getElementById("newsletter-embed");
  const newsletterStatus = document.getElementById("newsletter-status");
  const vid = window.ETNOXIA_FEATURED_VIDEO || {};
  const id = /^[a-zA-Z0-9_-]{11}$/.test(String(vid.id || "")) ? vid.id : "";
  const siteWrap = document.querySelector(".site-wrap");
  const footer = document.querySelector(".site-footer");
  const skipLinks = [...document.querySelectorAll(".skip-link")];
  const isPrivacyPage = document.body.dataset.etnoxiaPage === "privacy";
  const modalOnly = document.body.dataset.etnoxiaConsent === "modal-only";
  let state = consent.read();
  let banner = null;
  let backdrop = null;
  let cookieShortcut = null;
  let videoIframe = null;
  let newsletterObserver = null;
  let newsletterTimeout = null;
  let newsletterTimedOut = false;
  let newsletterFailed = !!window.ETNOXIA_MAILERLITE_FAILED;
  let modalOrigin = null;
  let modalInert = [];
  let privacyBannerObserver = null;
  let unsavedChoice = null;
  const GOOGLE_TAG_ID = "GTM-N22TS32N";
  let analyticsLoaded = false;

  /*
   * Google Consent Mode v2 – Basic implementation.
   * A Google tag csak statisztikai hozzájárulás után töltődik be.
   * A hozzájárulási állapot addig kizárólag a helyi dataLayer-ben várakozik,
   * így elutasítás vagy döntés hiányában nem indul kérés a Google felé.
   */
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied"
  });

  function setGoogleConsent(analyticsGranted) {
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: analyticsGranted ? "granted" : "denied"
    });
  }

  function loadAnalytics() {
    if (analyticsLoaded || !state?.analytics) return;
    setGoogleConsent(true);
    window.gtag("js", new Date());
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`;
    script.dataset.etnoxiaAnalytics = "google-tag";
    document.head.append(script);
    analyticsLoaded = true;
  }

  function syncAnalytics(previousAnalytics = false) {
    if (state?.analytics) {
      loadAnalytics();
      return false;
    }
    setGoogleConsent(false);
    if (previousAnalytics && analyticsLoaded) {
      window.location.reload();
      return true;
    }
    return false;
  }

  function storedSnapshot() {
    try { return {readable:true, value:window.localStorage.getItem(consent.KEY)}; }
    catch { return {readable:false, value:null}; }
  }
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function btn(text, handler, className) {
    const button = node("button", className, text);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }
  function differs(a, b) {
    if (!a || !b) return a !== b;
    return ["youtube", "analytics", "decided"].some(k => a[k] !== b[k]);
  }
  function positionShortcut() {
    if (!cookieShortcut || cookieShortcut.hidden || !footer) return;
    const footerTop = footer.getBoundingClientRect().top;
    const offset = Math.max(10, Math.ceil(window.innerHeight - footerTop + 10));
    cookieShortcut.style.bottom = `${offset}px`;
  }
  function updatePrivacyBannerSpace() {
    if (!isPrivacyPage || !banner) return;
    const bottom = parseFloat(getComputedStyle(banner).bottom) || 0;
    const space = Math.ceil(banner.getBoundingClientRect().height + bottom + 12);
    document.body.style.setProperty("--etnoxia-privacy-banner-space", `${space}px`);
  }
  function clearPrivacyBannerSpace() {
    privacyBannerObserver?.disconnect();
    privacyBannerObserver = null;
    document.body.classList.remove("consent-privacy-banner");
    document.body.style.removeProperty("--etnoxia-privacy-banner-space");
  }
  function clearBanner() {
    banner?.remove(); banner = null;
    clearPrivacyBannerSpace();
  }
  function showTransientStorageWarning() {
    const warning = node("div", "consent-storage-warning", "A választást nem sikerült tartósan menteni. Ezen az oldalon érvényes, de újbóli megnyitáskor ismét szükség lehet rá.");
    warning.setAttribute("role", "status");
    document.body.append(warning);
    window.setTimeout(() => warning.remove(), 9000);
  }
  function updateSelection(next, options = {}) {
    const priorStored = storedSnapshot();
    const previousAnalytics = !!state?.analytics;
    state = {youtube:!!next.youtube, analytics:!!next.analytics, decided:true};
    const written = consent.write(state);
    unsavedChoice = written ? null : priorStored;
    if (!written) consent.denyForSession();
    closeSettings(false);
    clearBanner();
    if (cookieShortcut) cookieShortcut.hidden = false;
    positionShortcut();
    renderVideo(!!options.autoplayVideo);
    if (syncAnalytics(previousAnalytics)) return;
    cookieShortcut?.focus({preventScroll:true});
    if (!written) showTransientStorageWarning();
  }
  const acceptAll = () => updateSelection({youtube:true, analytics:true});
  const rejectAll = () => updateSelection({youtube:false, analytics:false});
  const enableYoutubeAndPlay = () => {
    const priorStored = storedSnapshot();
    state = {
      youtube:true,
      analytics:!!state?.analytics,
      decided:!!state?.decided
    };
    const written = consent.write(state);
    unsavedChoice = written ? null : priorStored;
    if (state.decided) {
      clearBanner();
      if (cookieShortcut) cookieShortcut.hidden = false;
      positionShortcut();
    } else {
      showBanner();
      if (cookieShortcut) cookieShortcut.hidden = true;
    }
    renderVideo(true);
    if (!written) showTransientStorageWarning();
  };

  function renderVideo(autoplay = false) {
    if (!preview) return;
    if (state?.youtube && id) {
      if (videoIframe?.isConnected) return;
      const iframe = document.createElement("iframe");
      const auto = autoplay ? "&autoplay=1" : "";
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&controls=1${auto}`;
      iframe.title = vid.title || "Etnoxia videó";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      iframe.loading = autoplay ? "eager" : "lazy";
      preview.replaceChildren(iframe);
      videoIframe = iframe;
      return;
    }
    videoIframe = null;
    const poster = btn("", enableYoutubeAndPlay, "video-launch");
    poster.setAttribute("aria-label", "YouTube-videó lejátszása és a YouTube-tartalom engedélyezése");
    const brand = node("span", "video-preview-brand");
    const image = node("img", "video-preview-mark");
    image.src = "./assets/etnoxia-mark.svg";
    image.alt = ""; image.width = 60; image.height = 60;
    brand.append(image, node("span", "video-preview-name", "Etnoxia"));
    const play = node("span", "play-disc");
    play.setAttribute("aria-hidden", "true");
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z"/></svg>';
    const hint = node("span", "video-consent-hint", "A videó lejátszásával engedélyezed a YouTube-tartalom betöltését és a kapcsolódó sütik használatát.");
    poster.append(brand, play, hint);
    preview.replaceChildren(poster);
  }

  function newsletterVisible(element) {
    if (!element) return false;
    for (let x = element; x && x.nodeType === 1; x = x.parentElement) {
      if (x.hidden || x.getAttribute("aria-hidden") === "true") return false;
      const css = getComputedStyle(x);
      if (css.display === "none" || css.visibility === "hidden") return false;
    }
    return !!element.getClientRects().length;
  }
  function hasNewsletterForm() {
    if (!newsletter) return false;
    const usable = [...newsletter.querySelectorAll("form")].some(form => {
      if (!newsletterVisible(form)) return false;
      const email = [...form.querySelectorAll('input[type="email"]')].some(newsletterVisible);
      const submit = [...form.querySelectorAll('button[type="submit"], input[type="submit"], .ml-form-embedSubmit button')].some(newsletterVisible);
      return email && submit;
    });
    const confirmed = [...newsletter.querySelectorAll(".ml-form-successBody")].some(newsletterVisible);
    return usable || confirmed;
  }
  function showNewsletterStatus(text) {
    if (!newsletterStatus) return;
    newsletterStatus.replaceChildren(node("p", "newsletter-loading", text));
    newsletterStatus.hidden = false;
  }
  function monitorNewsletter() {
    if (!newsletter || !newsletterStatus) return;
    newsletter.hidden = false;
    const refresh = () => {
      if (hasNewsletterForm()) {
        newsletterStatus.hidden = true;
        if (newsletterTimeout) clearTimeout(newsletterTimeout);
        newsletterTimeout = null;
        newsletterTimedOut = false;
        return;
      }
      if (newsletterFailed || newsletterTimedOut) {
        showNewsletterStatus("A beágyazott űrlap nem érhető el. Kérjük, próbáld meg később.");
        return;
      }
      showNewsletterStatus("Feliratkozási űrlap betöltése…");
      if (!newsletterTimeout) {
        newsletterTimeout = setTimeout(() => {
          newsletterTimeout = null;
          newsletterTimedOut = true;
          refresh();
        }, 10000);
      }
    };
    newsletterObserver?.disconnect();
    newsletterObserver = new MutationObserver(refresh);
    newsletterObserver.observe(newsletter, {childList:true, subtree:true, attributes:true, attributeFilter:["hidden", "style", "class", "aria-hidden"]});
    refresh();
  }
  window.addEventListener("etnoxia-mailer-error", () => {
    newsletterFailed = true;
    showNewsletterStatus("A beágyazott űrlap nem tölthető be.");
  });

  function restoreModalBackground() {
    for (const [element, oldInert] of modalInert) {
      if (element.isConnected) element.inert = oldInert;
    }
    modalInert = [];
  }
  function closeSettings(restoreFocus = true) {
    if (!backdrop) return;
    backdrop.remove(); backdrop = null;
    document.body.classList.remove("consent-modal-open");
    restoreModalBackground();
    if (restoreFocus) {
      const destination = modalOrigin?.isConnected ? modalOrigin : cookieShortcut;
      if (destination && !destination.hidden && !destination.closest("[inert]")) destination.focus({preventScroll:true});
    }
    modalOrigin = null;
  }
  function checkbox(title, info, checked, necessary = false) {
    const label = node("label", "consent-option");
    const desc = node("span", "consent-option-copy");
    desc.append(node("strong", "", title), node("small", "", info));
    const input = node("input", "consent-toggle");
    input.type = "checkbox";
    input.checked = checked;
    if (necessary) input.disabled = true;
    label.append(desc, input);
    return {label, input};
  }
  function openSettings() {
    modalOrigin = document.activeElement;
    if (backdrop) return;
    backdrop = node("div", "consent-modal-backdrop");
    const modal = node("section", "consent-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "consent-title");
    const top = node("div", "consent-modal-head");
    const h = node("h2", "", "Süti- és adatvédelmi beállítások");
    h.id = "consent-title";
    const close = btn("", () => closeSettings(), "consent-modal-close");
    close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 5 19 19M19 5 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
    close.setAttribute("aria-label", "Részletes beállítások bezárása");
    top.append(h, close);
    modal.append(top);
    modal.append(node("p", "consent-modal-intro", "A működéshez szükséges helyi beállításokon túl a YouTube-videót és a Google Analytics-alapú statisztikai mérést csak a választásod szerint engedélyezzük. A hírlevél-feliratkozás ettől függetlenül használható. A hírlevélküldéshez külön hozzájárulást kérünk az űrlapon."));
    const necessary = checkbox("Szükséges beállítások", "A választásod megjegyzése a böngészőben (helyi tárolás).", true, true);
    const youtube = checkbox("YouTube-videó", "A lejátszó csak engedélyezés után töltődik be; a videó lejátszás gombjával külön is engedélyezheted.", !!state?.youtube);
    const analytics = checkbox("Statisztika – Google Analytics", "A Google Analytics csak a statisztikai hozzájárulásod után töltődik be, és a webhely használatáról készít látogatottsági statisztikát.", !!state?.analytics);
    [necessary, youtube, analytics].forEach(x => modal.append(x.label));
    const privacy = node("p", "consent-modal-legal");
    const link = node("a", "", "Adatkezelési és sütitájékoztató");
    link.href = "./adatkezeles.html#sutik";
    link.addEventListener("click", event => {
      if (isPrivacyPage) {
        event.preventDefault();
        closeSettings(false);
        const target = document.getElementById("sutik");
        if (target) {
          target.setAttribute("tabindex", "-1");
          target.scrollIntoView();
          target.focus({preventScroll:true});
        }
        history.replaceState(history.state, "", "#sutik");
      } else closeSettings(false);
    });
    privacy.append(link); modal.append(privacy);
    const actions = node("div", "consent-modal-actions");
    actions.append(
      btn("Összes elutasítása", rejectAll, "consent-btn consent-btn-outline"),
      btn("Beállítások mentése", () => updateSelection({
        youtube:youtube.input.checked,
        analytics:analytics.input.checked
      }), "consent-btn consent-btn-outline"),
      btn("Összes elfogadása", acceptAll, "consent-btn consent-btn-primary")
    );
    modal.append(actions); backdrop.append(modal);
    for (const element of [siteWrap, banner, cookieShortcut, ...skipLinks].filter(Boolean)) {
      modalInert.push([element, element.inert]);
      element.inert = true;
    }
    document.body.append(backdrop);
    document.body.classList.add("consent-modal-open");
    close.focus({preventScroll:true});
    backdrop.addEventListener("keydown", event => {
      if (event.key === "Escape") {event.preventDefault(); closeSettings(); return;}
      if (event.key !== "Tab") return;
      const focus = [...modal.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)')];
      const first = focus[0], last = focus[focus.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
    });
  }
  function showBanner() {
    if (banner) return;
    banner = node("aside", "consent-banner");
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Sütik és külső tartalmak");
    const title = node("h2", "", "Sütik és külső tartalmak");
    const copy = node("div", "consent-banner-copy");
    copy.append(title, node("p", "", "A weboldal a működéshez szükséges beállításokon túl YouTube-tartalmat és Google Analytics-alapú látogatottságmérést használ. Ezek csak a hozzájárulásod után töltődnek be. A hírlevél-feliratkozás ettől függetlenül használható."));
    const legal = node("a", "", "Adatkezelési és sütitájékoztató");
    legal.href = "./adatkezeles.html#sutik";
    const settings = btn("Részletes beállítások", openSettings, "consent-settings-link");
    const links = node("div", "consent-banner-links");
    links.append(legal, settings);
    const actions = node("div", "consent-banner-actions");
    actions.append(
      btn("Összes elutasítása", rejectAll, "consent-btn consent-btn-outline"),
      btn("Összes elfogadása", acceptAll, "consent-btn consent-btn-primary")
    );
    banner.append(copy, links, actions);
    document.body.append(banner);
    if (isPrivacyPage) {
      document.body.classList.add("consent-privacy-banner");
      updatePrivacyBannerSpace();
      if (typeof ResizeObserver !== "undefined") {
        privacyBannerObserver = new ResizeObserver(updatePrivacyBannerSpace);
        privacyBannerObserver.observe(banner);
      }
    }
  }
  function addCookieShortcut() {
    cookieShortcut = btn("Sütik kezelése", openSettings, "cookie-shortcut");
    cookieShortcut.hidden = !state?.decided;
    document.body.append(cookieShortcut);
    positionShortcut();
  }
  function syncExternalState() {
    if (unsavedChoice) {
      const observed = storedSnapshot();
      if (!observed.readable ||
          (unsavedChoice.readable && observed.value === unsavedChoice.value)) return;
      unsavedChoice = null;
      consent.clearSessionDeny();
    }
    const next = consent.read();
    if (!differs(state, next)) return;
    const hadModal = !!backdrop;
    const previousAnalytics = !!state?.analytics;
    state = next;
    closeSettings(false);
    if (state?.decided) clearBanner();
    else if (!modalOnly) showBanner();
    if (cookieShortcut) cookieShortcut.hidden = !state?.decided;
    positionShortcut();
    renderVideo(false);
    if (syncAnalytics(previousAnalytics)) return;
    if (hadModal && state?.decided && cookieShortcut && !cookieShortcut.hidden) {
      cookieShortcut.focus({preventScroll:true});
    }
  }

  document.querySelectorAll("[data-cookie-settings]").forEach(x => x.addEventListener("click", openSettings));
  loadAnalytics();
  if (!modalOnly) {
    addCookieShortcut();
    renderVideo(false);
    monitorNewsletter();
    if (!state?.decided) showBanner();
    if (consent.denied()) showTransientStorageWarning();
    window.addEventListener("scroll", positionShortcut, {passive:true});
    window.addEventListener("resize", positionShortcut, {passive:true});
    window.addEventListener("resize", updatePrivacyBannerSpace, {passive:true});
  }
  window.addEventListener("storage", event => {
    if (event.key === consent.KEY || event.key === null) syncExternalState();
  });
  window.addEventListener("pageshow", syncExternalState);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncExternalState();
  });
})();
