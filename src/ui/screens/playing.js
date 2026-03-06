/**
 * playing.js - IN-GAME MENU STATE
 * =============================================================================
 *
 * ROLE: When screen is PLAYING, clears menu content and hides container so
 * only the game canvas is visible. No DOM for play screen; HUD is in game InGameUI.
 *
 * RELATED: MenuManager.js, constants.js, gameInGameUI.js.
 *
 * =============================================================================
 */

export function renderPlaying(manager) {
  manager.menuContent.innerHTML = "";
  manager.container.classList.add("hidden");
}
