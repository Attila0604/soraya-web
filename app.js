/* ===== Phase C.1.1: separate Login-Seite =====
   Ziel:
   - /login = saubere Login-Seite
   - /      = Soraya App
   - alter Login-Modal wird nicht mehr benutzt
   - kein Backend-Change
*/

(function () {
  function goToLogin() {
    window.location.href = "/login";
  }

  function hideOldLoginModal() {
    const modal = document.getElementById("loginModal");
    if (modal) {
      modal.classList.remove("open");
      modal.style.display = "none";
    }
  }

  function replaceLoginButtons() {
    document.querySelectorAll("button, a").forEach((el) => {
      const text = (el.textContent || "").trim();
      const onclick = el.getAttribute("onclick") || "";

      const looksLikeLogin =
        text.includes("Einloggen") ||
        onclick.includes("openLogin") ||
        onclick.includes("signIn");

      if (!looksLikeLogin) return;

      el.removeAttribute("onclick");

      if (el.tagName === "A") {
        el.setAttribute("href", "/login");
      } else {
        el.onclick = function (event) {
          event.preventDefault();
          goToLogin();
        };
      }
    });
  }

  function installCleanLoginFlow() {
    hideOldLoginModal();
    replaceLoginButtons();

    window.openLogin = goToLogin;
    window.closeLogin = hideOldLoginModal;
  }

  installCleanLoginFlow();

  window.addEventListener("load", () => {
    installCleanLoginFlow();

    // Einige Soraya-Blöcke erzeugen Buttons später dynamisch.
    // Deshalb nach kurzer Zeit nochmals prüfen.
    setTimeout(installCleanLoginFlow, 500);
    setTimeout(installCleanLoginFlow, 1500);
  });
})();
