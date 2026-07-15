"use strict";

const navigationTabs = document.querySelectorAll("[data-page]");
const pagePanels = document.querySelectorAll("[data-page-panel]");

function showPage(pageName, updateHash = true) {
  const targetPage = document.querySelector(`[data-page-panel="${pageName}"]`);

  if (!targetPage) {
    return;
  }

  pagePanels.forEach((page) => {
    const isActive = page.dataset.pagePanel === pageName;
    page.hidden = !isActive;
    page.classList.toggle("active", isActive);
  });

  navigationTabs.forEach((tab) => {
    const isActive = tab.dataset.page === pageName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  if (updateHash) {
    history.replaceState(null, "", `#${pageName}`);
  }

  document.title = `${targetPage.querySelector("h1").textContent} | FlightOps Pro`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navigationTabs.forEach((tab) => {
  tab.addEventListener("click", () => showPage(tab.dataset.page));
});

window.addEventListener("hashchange", () => {
  showPage(window.location.hash.slice(1) || "dashboard", false);
});

showPage(window.location.hash.slice(1) || "dashboard", false);
