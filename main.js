"use strict";
document.querySelectorAll("[data-year]").forEach(el => { el.textContent = String(new Date().getFullYear()); });

const backToTopButton = document.querySelector("[data-back-to-top]");

if (backToTopButton) {
  const toggleBackToTop = () => {
    backToTopButton.classList.toggle("is-visible", window.scrollY > 320);
  };

  window.addEventListener("scroll", toggleBackToTop, { passive: true });
  toggleBackToTop();
  backToTopButton.addEventListener("click", () => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  });
}
