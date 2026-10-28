"use strict";
/* Etnoxia: közös, előzetes hozzájárulás három statikus oldalon. */
(() => {
  const consent = window.ETNOXIA_CONSENT;
  if (!consent) return; // zárt (fail-safe) állapot: külső szolgáltatás nem indul.
  const preview = document.getElementById("main-player");
  const newsletter = document.getElementById("newsletter-embed");
  const newsletterPlaceholder = document.getElementById("newsletter-consent");
  const newsletterStatus = document.getElementById("newsletter-status");
  const vid = window.ETNOXIA_FEATURED_VIDEO || {};
  const id = /^[a-zA-Z0-9_-]{11}$/.test(String(vid.id || "")) ? vid.id : "";
  const siteWrap = document.querySelector(".site-wrap");
  const footer = document.querySelector(".site-footer");
  const skipLinks = [...document.querySelectorAll(".skip-link")];
  const isPrivacyPage = document.body.dataset.etnoxiaPage === "privacy";
  let state = consent.read();
  let banner = null;
  let shade = null;
  let backdrop = null;
  let cookieShortcut = null;
  let videoIframe = null;
  let mailerStarted = !!window.ETNOXIA_MAILERLITE_BOOTSTRAPPED;
  let mailerObserver = null;
  let mailerTimeout = null;
  let mailerTimedOut = false;
  let mailerFailed = false;
  let modalOrigin = null;
  let modalInert = [];
  let privacyBannerObserver = null;
  // Ha az írás meghiúsul, ez a dokumentumon belüli döntés elsőbbséget élvez
  // addig, amíg a tárolóban valódi ÚJ változás nem jelenik meg.
  let unsavedChoice = null;

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
    return ["youtube", "mailerlite", "analytics"].some(k => a[k] !== b[k]);
  }
  function positionShortcut() {
    if (!cookieShortcut || cookieShortcut.hidden || !footer) return;
    // A fül a viewport bal alsó részében marad, de amikor a lábléc
    // megjelenik, a felső határát követi: a láblécet soha nem takarja ki.
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
    shade?.remove(); shade = null;
    clearPrivacyBannerSpace();
    if (siteWrap) siteWrap.inert = false;
    skipLinks.forEach(link => { link.inert = false; });
    document.body.classList.remove("consent-pending");
  }
  function updateSelection(next) {
    const prev = state;
    const priorStored = storedSnapshot();
    state = {youtube:!!next.youtube, mailerlite:!!next.mailerlite, analytics:!!next.analytics};
    const written = consent.write(state);
    // A következő pageshow/visibilitychange nem írhatja vissza a régi engedélyt.
    // Reloadkor minden sikertelen írást fail-closed módon kezelünk, nem csak a
    // MailerLite-visszavonást. Az aktuális dokumentum memóriadöntése megmarad.
    unsavedChoice = written ? null : priorStored;
    if (!written) consent.denyForSession();
    closeSettings(false);
    clearBanner();
    if (cookieShortcut) cookieShortcut.hidden = false;
    positionShortcut();

    // A már elindult harmadik féltől származó MailerLite-script eltávolítása
    // önmagában nem állítaná le a futását, ezért visszavonáskor új dokumentum kell.
    const revokeMailer = !!prev?.mailerlite && !state.mailerlite && !!newsletter && mailerStarted;
    const enableMailer = !prev?.mailerlite && state.mailerlite && !!newsletter;
    if (revokeMailer) {
      if (written || consent.denied()) {
        location.reload();
        return;
      }
      // Tiltás átadásának rendkívüli hibája: nincs nem biztonságos reload.
      mailerFailed = true;
      console.warn("A hozzájárulás visszavonását nem sikerült megőrizni. A lap bezárása szükséges lehet.");
    }
    if (enableMailer && written) {
      location.reload(); // A MailerLite Universal a HEAD-ben indul megbízhatóan.
      return;
    }
    renderVideo();
    renderNewsletter();
    cookieShortcut?.focus({preventScroll:true});
    if (!written) {
      // A döntés csak a most megnyitott dokumentumban biztos.
      showTransientStorageWarning();
    }
  }
  const acceptAll = () => updateSelection({youtube:true, mailerlite:true, analytics:true});
  const rejectAll = () => updateSelection({youtube:false, mailerlite:false, analytics:false});
  function showTransientStorageWarning() {
    const warning = node("div", "consent-storage-warning", "A választást nem sikerült tartósan menteni. Ezen az oldalon érvényes, de újbóli megnyitáskor ismét szükség lehet rá.");
    warning.setAttribute("role", "status");
    document.body.append(warning);
    window.setTimeout(() => warning.remove(), 9000);
  }

  function renderVideo() {
    if (!preview) return;
    if (state?.youtube && id) {
      if (videoIframe?.isConnected) return;
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&controls=1`;
      iframe.title = vid.title || "Etnoxia videó";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      preview.replaceChildren(iframe);
      videoIframe = iframe;
      return;
    }
    videoIframe = null;
    const poster = btn("", openSettings, "video-launch");
    poster.setAttribute("aria-label", "YouTube-videó engedélyezése a részletes beállításokban");
    const brand = node("span", "video-preview-brand");
    const image = node("img", "video-preview-mark");
    image.src = "./assets/etnoxia-mark.svg";
    image.alt = ""; image.width = 60; image.height = 60;
    brand.append(image, node("span", "video-preview-name", "Etnoxia"));
    const play = node("span", "play-disc");
    play.setAttribute("aria-hidden", "true");
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z"/></svg>';
    const hint = node("span", "video-consent-hint", "A videóhoz engedélyezd a YouTube-ot a süti beállításokban.");
    poster.append(brand, play, hint);
    preview.replaceChildren(poster);
  }

  function mailerVisible(element) {
    if (!element) return false;
    for (let x = element; x && x.nodeType === 1; x = x.parentElement) {
      if (x.hidden || x.getAttribute("aria-hidden") === "true") return false;
      const css = getComputedStyle(x);
      if (css.display === "none" || css.visibility === "hidden") return false;
    }
    return !!element.getClientRects().length;
  }
  function hasMailerForm() {
    if (!newsletter) return false;
    // Egy üres wrapper, rejtett success-panel vagy félkész form nem számít késznek.
    const usable = [...newsletter.querySelectorAll("form")].some(form => {
      if (!mailerVisible(form)) return false;
      const email = [...form.querySelectorAll('input[type="email"]')].some(mailerVisible);
      const submit = [...form.querySelectorAll('button[type="submit"], input[type="submit"], .ml-form-embedSubmit button')].some(mailerVisible);
      // A disabled submit önmagában nem hiba (kitöltés / CAPTCHA előtt normális).
      return email && submit;
    });
    const confirmed = [...newsletter.querySelectorAll(".ml-form-successBody")].some(mailerVisible);
    return usable || confirmed;
  }
  function stopMailerMonitor() {
    mailerObserver?.disconnect(); mailerObserver = null;
    if (mailerTimeout) clearTimeout(mailerTimeout);
    mailerTimeout = null;
    mailerTimedOut = false;
  }
  function showMailerStatus(text, fallback = false) {
    if (!newsletterStatus) return;
    newsletterStatus.replaceChildren(node("p", "newsletter-loading", text));
    newsletterStatus.hidden = false;
    if (fallback) {
      const link = node("a", "newsletter-external-link", "Feliratkozás megnyitása külön oldalon");
      link.href = "https://preview.mailerlite.io/forms/2748469/202527324430665160/share";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      newsletterStatus.append(link);
    }
  }
  function monitorMailer() {
    if (!newsletter || !newsletterStatus) return;
    // A DOM-ot késznek minősítés után is figyeljük: egy később elrejtett form
    // nem hagyhatja a felhasználót visszajelzés nélküli, üres panellel.
    const refresh = () => {
      if (hasMailerForm()) {
        newsletterStatus.hidden = true;
        if (mailerTimeout) clearTimeout(mailerTimeout);
        mailerTimeout = null;
        mailerTimedOut = false;
        return;
      }
      if (mailerFailed || mailerTimedOut) {
        showMailerStatus("A beágyazott űrlap nem érhető el. Az alábbi linken közvetlenül feliratkozhatsz.", true);
        return;
      }
      showMailerStatus("Feliratkozási űrlap betöltése…");
      if (!mailerTimeout) {
        mailerTimeout = setTimeout(() => {
          mailerTimeout = null;
          mailerTimedOut = true;
          refresh();
        }, 10000);
      }
    };
    mailerObserver?.disconnect();
    mailerObserver = new MutationObserver(refresh);
    mailerObserver.observe(newsletter, {childList:true, subtree:true, attributes:true, attributeFilter:["hidden", "style", "class", "aria-hidden"]});
    refresh();
  }
  function renderNewsletter() {
    if (!newsletter) return;
    if (state?.mailerlite) {
      if (newsletterPlaceholder) newsletterPlaceholder.hidden = true;
      newsletter.hidden = false;
      if (!mailerStarted) {
        mailerStarted = true;
        // Csak a nem írható tároló / memória-engedély esete: dinamikus betöltés.
        window.ml = window.ml || function () { (window.ml.q = window.ml.q || []).push(arguments); };
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://assets.mailerlite.com/js/universal.js";
        script.id = "etnoxia-mailerlite-universal";
        script.addEventListener("error", () => {
          mailerFailed = true;
          showMailerStatus("A beágyazott űrlap nem tölthető be.", true);
        });
        document.head.append(script);
        window.ml("account", "2748469");
      }
      monitorMailer();
    } else {
      // Az esetleg már lefutó külső JS miatt a valódi visszavonás reloadhoz kötött.
      if (newsletterPlaceholder) newsletterPlaceholder.hidden = false;
      newsletter.hidden = true;
      stopMailerMonitor();
      if (newsletterStatus) newsletterStatus.hidden = true;
    }
  }
  window.addEventListener("etnoxia-mailer-error", () => {
    mailerFailed = true;
    if (state?.mailerlite) showMailerStatus("A beágyazott űrlap nem tölthető be.", true);
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
    input.disabled = necessary;
    label.append(desc, input);
    return {label, input};
  }
  function openSettings() {
    if (backdrop) return;
    modalOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : cookieShortcut;
    backdrop = node("div", "consent-modal-backdrop");
    const modal = node("section", "consent-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "consent-title");
    const top = node("div", "consent-modal-head");
    const h = node("h2", "", "Süti- és adatvédelmi beállítások");
    h.id = "consent-title";
    const close = btn("", () => closeSettings(), "consent-modal-close");
    // A fontfüggő × karakter helyett geometriailag középre igazított SVG.
    // Az akadálymentes gombnevet az aria-label adja meg.
    close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 5 19 19M19 5 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
    close.setAttribute("aria-label", "Részletes beállítások bezárása");
    top.append(h, close);
    modal.append(top);
    modal.append(node("p", "consent-modal-intro", "A működéshez szükséges helyi beállításokon túl a külső szolgáltatásokat csak a választásod szerint töltjük be. A hírlevélre történő feliratkozáshoz külön hozzájárulás szükséges az űrlapon."));
    const necessary = checkbox("Szükséges beállítások", "A választásod megjegyzése a böngészőben (helyi tárolás).", true, true);
    const youtube = checkbox("YouTube-videó", "A videó lejátszója az engedélyezés után töltődik be; a Google technikai adatokat kezelhet.", !!state?.youtube);
    const mailerlite = checkbox("Hírlevél-űrlap – MailerLite", "A feliratkozási űrlap és a Google reCAPTCHA kódjai csak engedélyezés után töltődnek be.", !!state?.mailerlite);
    const analytics = checkbox("Statisztika – Google Analytics", "A webhelystatisztikai kategória. A mérőkód még nincs telepítve; aktiválás előtt újra kikérjük a döntésed.", !!state?.analytics);
    [necessary, youtube, mailerlite, analytics].forEach(x => modal.append(x.label));
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
      btn("Összes elfogadása", acceptAll, "consent-btn consent-btn-primary"),
      btn("Összes elutasítása", rejectAll, "consent-btn consent-btn-outline"),
      btn("Beállítások mentése", () => updateSelection({
        youtube:youtube.input.checked,
        mailerlite:mailerlite.input.checked,
        analytics:analytics.input.checked
      }), "consent-btn consent-btn-outline")
    );
    modal.append(actions); backdrop.append(modal);
    // Egyetlen valóban modális réteg: a háttér és a korábbi banner nem aktív.
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
  function showBanner(autofocus = true) {
    if (banner) return;
    banner = node("aside", "consent-banner");
    banner.setAttribute("role", isPrivacyPage ? "region" : "dialog");
    if (!isPrivacyPage) banner.setAttribute("aria-modal", "true");
    banner.setAttribute("aria-label", "Sütik és külső tartalmak");
    const title = node("h2", "", "Sütik és külső tartalmak");
    const copy = node("div", "consent-banner-copy");
    copy.append(title, node("p", "", "A weboldal sütiket és külső szolgáltatásokat használhat a videók, a hírlevél és a látogatottságmérés működtetéséhez. Te döntöd el, mit engedélyezel."));
    const legal = node("a", "", "Adatkezelési és sütitájékoztató");
    legal.href = "./adatkezeles.html#sutik";
    const settings = btn("Részletes beállítások", openSettings, "consent-settings-link");
    const links = node("div", "consent-banner-links");
    links.append(legal, settings);
    const actions = node("div", "consent-banner-actions");
    actions.append(
      btn("Összes elfogadása", acceptAll, "consent-btn consent-btn-primary"),
      btn("Összes elutasítása", rejectAll, "consent-btn consent-btn-outline")
    );
    banner.append(copy, links, actions);
    if (!isPrivacyPage) {
      shade = node("div", "consent-screen-shade");
      shade.setAttribute("aria-hidden", "true");
      document.body.append(shade);
      if (siteWrap) siteWrap.inert = true;
      skipLinks.forEach(link => { link.inert = true; });
      document.body.classList.add("consent-pending");
    }
    document.body.append(banner);
    if (isPrivacyPage) {
      document.body.classList.add("consent-privacy-banner");
      updatePrivacyBannerSpace();
      if (typeof ResizeObserver !== "undefined") {
        privacyBannerObserver = new ResizeObserver(updatePrivacyBannerSpace);
        privacyBannerObserver.observe(banner);
      }
    }
    if (autofocus && !isPrivacyPage) banner.querySelector(".consent-btn-primary").focus({preventScroll:true});
    if (!isPrivacyPage) {
      banner.addEventListener("keydown", event => {
        if (backdrop || event.key !== "Tab") return;
        const focus = [...banner.querySelectorAll('button, a[href]')];
        const first = focus[0], last = focus[focus.length - 1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
      });
    }
  }
  function addCookieShortcut() {
    cookieShortcut = btn("Sütik kezelése", openSettings, "cookie-shortcut");
    cookieShortcut.hidden = !state;
    document.body.append(cookieShortcut);
    positionShortcut();
  }
  function syncExternalState() {
    if (unsavedChoice) {
      const observed = storedSnapshot();
      // Nem változott a tárolt rekord; a legújabb, sikertelenül mentett
      // memóriabeli választást NEM írhatjuk felül a régi hozzájárulással.
      // Ha a tároló nem olvasható, szintén a memóriadöntés marad érvényes.
      if (!observed.readable ||
          (unsavedChoice.readable && observed.value === unsavedChoice.value)) return;
      // Valóban új, másik fülből érkező rekord: azt már kezeljük.
      // Az átmeneti reload-tiltás itt már nem takarhatja el az új döntést.
      unsavedChoice = null;
      consent.clearSessionDeny();
    }
    const next = consent.read();
    if (!differs(state, next)) return;
    const wasMailerActive = !!newsletter && !!state?.mailerlite && mailerStarted;
    const hadModal = !!backdrop;
    state = next;
    closeSettings(false);
    if (wasMailerActive && !state?.mailerlite) {
      // A storage-ben már a friss tiltás van; reload esetén a HEAD is tilt.
      location.reload();
      return;
    }
    if (state) clearBanner();
    else showBanner(!isPrivacyPage); // A frissen felnyitott modal kapjon fókuszt.
    if (cookieShortcut) cookieShortcut.hidden = !state;
    positionShortcut();
    renderVideo();
    renderNewsletter();
    if (hadModal && state && cookieShortcut && !cookieShortcut.hidden) {
      cookieShortcut.focus({preventScroll:true});
    }
  }
  document.querySelectorAll("[data-cookie-settings]").forEach(x => x.addEventListener("click", openSettings));
  addCookieShortcut();
  renderVideo();
  renderNewsletter();
  if (!state) showBanner();
  if (consent.denied()) showTransientStorageWarning();
  window.addEventListener("scroll", positionShortcut, {passive:true});
  window.addEventListener("resize", positionShortcut, {passive:true});
  window.addEventListener("resize", updatePrivacyBannerSpace, {passive:true});
  window.addEventListener("storage", event => {
    if (event.key === consent.KEY || event.key === null) syncExternalState();
  });
  window.addEventListener("pageshow", syncExternalState);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncExternalState();
  });
})();
