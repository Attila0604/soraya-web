/*
  Soraya — C.5.8 Mobile Layout & Visual Fix
  Ziel: deutlich besseres Handy-Layout ohne schwere Animationen.
  Wichtig: Nur leichte CSS-Overrides. Keine Backend-Änderung.
*/

:root {
  --c58-nav-h: 76px;
  --c58-safe-bottom: env(safe-area-inset-bottom, 0px);
}

html,
body {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

body {
  background-color: #050615;
}

button,
a,
input,
textarea,
select {
  -webkit-tap-highlight-color: transparent;
}

button,
.btn,
.tile,
.c43-prompt,
.row {
  touch-action: manipulation;
}

.c410-app-status {
  display: none !important;
}

.card p,
.page-title p,
.status,
.reading,
.bubble {
  overflow-wrap: anywhere;
}

@media (max-width: 768px) {
  body {
    text-rendering: optimizeLegibility;
  }

  .app {
    width: 100%;
    max-width: 500px;
    padding: 0 14px calc(var(--c58-nav-h) + var(--c58-safe-bottom) + 36px) !important;
  }

  .topbar {
    padding: 12px 0 6px !important;
    min-height: 74px;
    gap: 10px;
    background: linear-gradient(180deg, rgba(4, 5, 18, .98), rgba(4, 5, 18, .70) 72%, transparent) !important;
  }

  .brand h1 {
    font-size: clamp(28px, 8vw, 36px) !important;
    letter-spacing: .19em !important;
    padding-left: .19em !important;
  }

  .brand .sub {
    display: none !important;
  }

  .round {
    width: 50px !important;
    min-width: 50px !important;
    height: 50px !important;
    border-radius: 999px !important;
    font-size: 20px;
    background:
      radial-gradient(circle at 35% 20%, rgba(255, 226, 155, .16), transparent 50%),
      rgba(255, 255, 255, .035) !important;
  }

  .page-title {
    margin: 18px 0 14px !important;
  }

  .page-title .eyebrow {
    font-size: 10px !important;
    letter-spacing: .22em !important;
  }

  .page-title h2 {
    font-size: clamp(36px, 12vw, 52px) !important;
    line-height: .92 !important;
  }

  .page-title p {
    margin-top: 10px !important;
    font-size: 15px !important;
    line-height: 1.45 !important;
    color: rgba(232, 220, 255, .82) !important;
  }

  .c54-hero-ribbon {
    gap: 7px !important;
    flex-wrap: wrap;
    margin-top: 14px !important;
  }

  .c54-hero-ribbon span {
    min-height: 30px;
    padding: 6px 10px !important;
    font-size: 11px !important;
  }

  .card {
    margin: 12px 0 !important;
    padding: 16px !important;
    border-radius: 24px !important;
    box-shadow: 0 16px 48px rgba(0, 0, 0, .38), inset 0 1px 0 rgba(255, 255, 255, .07) !important;
    backdrop-filter: blur(12px) saturate(112%) !important;
  }

  .card.glow,
  .card.premium {
    box-shadow: 0 18px 52px rgba(0, 0, 0, .42), inset 0 1px 0 rgba(255, 255, 255, .08) !important;
  }

  .card::before,
  .card::after {
    opacity: .45 !important;
  }

  .card-title {
    margin-bottom: 10px !important;
    gap: 10px !important;
  }

  .card-title h4,
  .card h3,
  .card h4 {
    line-height: 1.15;
  }

  .badge {
    min-height: 26px !important;
    padding: 4px 9px !important;
    font-size: 11px !important;
  }

  .btn {
    min-height: 48px !important;
    padding: 12px 16px !important;
    border-radius: 18px !important;
    font-size: 15px !important;
  }

  .btn.gold {
    box-shadow: 0 10px 26px rgba(217, 168, 75, .18) !important;
  }

  input,
  textarea,
  select {
    min-height: 50px !important;
    border-radius: 16px !important;
    font-size: 16px !important;
    margin-bottom: 12px !important;
  }

  textarea {
    min-height: 104px !important;
  }

  .hero-card,
  .c46-hero-dashboard {
    display: grid !important;
    grid-template-columns: 76px 1fr !important;
    align-items: center !important;
    gap: 14px !important;
  }

  .zodiac-art {
    width: 76px !important;
    height: 76px !important;
    min-width: 76px !important;
  }

  .zodiac-art span {
    font-size: 36px !important;
  }

  .c49-steps > div {
    display: grid !important;
    grid-template-columns: 34px 1fr auto !important;
    gap: 10px !important;
    align-items: center !important;
    padding: 10px !important;
    border-radius: 18px !important;
  }

  .c49-steps .btn {
    min-height: 40px !important;
    padding: 8px 12px !important;
    border-radius: 14px !important;
    font-size: 13px !important;
  }

  .c4-dashboard-grid,
  .c46-dashboard-grid,
  .c42-guidance-grid,
  .c44-synastry-grid {
    gap: 12px !important;
  }

  .moon-visual,
  .energy-ring,
  .compat {
    transform: scale(.88);
    transform-origin: center;
  }

  .c45-profile-hero {
    min-height: auto !important;
    padding: 18px !important;
  }

  .c45-profile-hero::before,
  .c45-profile-hero::after {
    opacity: .28 !important;
  }

  .profile-hero {
    gap: 14px !important;
    align-items: center !important;
  }

  .profile-avatar {
    width: 74px !important;
    height: 74px !important;
    min-width: 74px !important;
    font-size: 38px !important;
  }

  .profile-hero h3,
  #profileTitle {
    font-size: 24px !important;
    line-height: 1.1 !important;
  }

  #profileSub {
    font-size: 15px !important;
    line-height: 1.35 !important;
  }

  .stats,
  .c45-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 10px !important;
    margin-top: 18px !important;
  }

  .stat {
    min-height: 82px !important;
    padding: 12px 8px !important;
    border-radius: 18px !important;
  }

  .stat b {
    font-size: 28px !important;
  }

  .stat span {
    font-size: 12px !important;
    line-height: 1.25 !important;
  }

  .form-row,
  .form-row-3,
  .partner-form-grid,
  .partner-form-grid.two {
    gap: 10px !important;
  }

  .c45-birth-preview {
    gap: 8px !important;
  }

  .c45-birth-preview div {
    padding: 10px !important;
    border-radius: 16px !important;
  }

  .c43-prompt-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  .c43-prompt {
    min-height: 78px !important;
    padding: 14px 10px !important;
  }

  .chat-window {
    min-height: 260px !important;
    max-height: 45dvh !important;
  }

  .composer,
  .c43-composer {
    gap: 10px !important;
    align-items: end !important;
  }

  .composer textarea,
  .c43-composer textarea {
    min-height: 58px !important;
    max-height: 130px !important;
  }

  .c43-chat-footer,
  .c4-action-row,
  .c44-button-row {
    gap: 10px !important;
  }

  .tabbar,
  .c410-tabbar {
    position: fixed !important;
    left: 12px !important;
    right: 12px !important;
    bottom: calc(10px + var(--c58-safe-bottom)) !important;
    height: var(--c58-nav-h) !important;
    padding: 8px !important;
    border-radius: 28px !important;
    display: grid !important;
    grid-template-columns: repeat(5, 1fr) !important;
    gap: 4px !important;
    background: rgba(9, 8, 26, .92) !important;
    border: 1px solid rgba(255, 218, 135, .22) !important;
    box-shadow: 0 14px 44px rgba(0, 0, 0, .56), inset 0 1px 0 rgba(255,255,255,.08) !important;
    backdrop-filter: blur(16px) saturate(116%) !important;
    z-index: 80 !important;
  }

  .tabbar button,
  .c410-tabbar button {
    min-width: 0 !important;
    min-height: 58px !important;
    height: 58px !important;
    padding: 6px 2px !important;
    border-radius: 20px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 3px !important;
    background: transparent !important;
    border: 0 !important;
    color: rgba(232, 220, 255, .72) !important;
    box-shadow: none !important;
  }

  .tabbar button b,
  .c410-tabbar button b {
    font-size: 19px !important;
    line-height: 1 !important;
  }

  .tabbar button span,
  .c410-tabbar button span {
    font-size: 10px !important;
    line-height: 1.05 !important;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tabbar button.active,
  .c410-tabbar button.active {
    background: linear-gradient(180deg, #ffeaa8, #d9a84b 62%, #9d641d) !important;
    color: #17101a !important;
    box-shadow: 0 8px 22px rgba(217, 168, 75, .24) !important;
  }

  .tabbar button.active b,
  .tabbar button.active span,
  .c410-tabbar button.active b,
  .c410-tabbar button.active span {
    color: #17101a !important;
  }

  .modal {
    width: calc(100vw - 28px) !important;
    max-height: 86dvh !important;
    overflow: auto !important;
  }
}

@media (max-width: 380px) {
  .app {
    padding-left: 12px !important;
    padding-right: 12px !important;
  }

  .brand h1 {
    font-size: 27px !important;
    letter-spacing: .16em !important;
    padding-left: .16em !important;
  }

  .round {
    width: 46px !important;
    min-width: 46px !important;
    height: 46px !important;
  }

  .stats,
  .c45-stats {
    gap: 8px !important;
  }

  .stat {
    min-height: 76px !important;
    padding: 10px 6px !important;
  }

  .tabbar,
  .c410-tabbar {
    left: 8px !important;
    right: 8px !important;
  }
}

@media (prefers-reduced-motion: reduce), (max-width: 768px) {
  *,
  *::before,
  *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .12s !important;
    scroll-behavior: auto !important;
  }
}
