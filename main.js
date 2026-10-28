"use strict";
document.querySelectorAll("[data-year]").forEach(el => { el.textContent = String(new Date().getFullYear()); });
