/**
 * loading.js - LOADING SCREENS
 * =============================================================================
 *
 * ROLE: Renders initial loading and in-game loading screen DOM (progress bar,
 * message). Used by MenuManager for INITIAL_LOADING and LOADING screens.
 *
 * RELATED: MenuManager.js.
 *
 * =============================================================================
 */

export function renderInitialLoading(manager) {
  manager.container.classList.remove("hidden");
  manager.menuContent.innerHTML = `
    <div class="menu-screen initial-loading-screen">
      <div class="initial-loading-content">
        <div class="initial-loading-progress">
          <div class="loading-progress-bar">
            <div class="loading-progress-fill" style="width: 0%"></div>
          </div>
          <span class="loading-progress-text">0%</span>
        </div>
      </div>
    </div>
  `;
}

export function renderLoading(manager) {
  manager.container.classList.remove("hidden");
  if (manager.backgroundOnlyLoading) {
    manager.menuContent.innerHTML = `
      <div class="menu-screen loading-screen loading-screen-background-only"></div>
    `;
    return;
  }
  manager.menuContent.innerHTML = `
    <div class="menu-screen loading-screen">
      <div class="loading-content">
        <div class="loading-title">
          <h1>STARSPEED</h1>
        </div>
        <div class="loading-message">${manager.loadingMessage || "LOADING..."}</div>
        <div class="loading-progress">
          <div class="loading-progress-bar">
            <div class="loading-progress-fill"></div>
          </div>
          <div class="loading-progress-text">0%</div>
        </div>
        <div class="loading-hint">PREPARE FOR COMBAT</div>
      </div>
    </div>
  `;
}
