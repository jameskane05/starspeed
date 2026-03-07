/**
 * mainMenu.js - MAIN MENU SCREEN
 * =============================================================================
 *
 * ROLE: Renders the main menu DOM: title, callsign, Solo/Create/Join/Options.
 * Binds button handlers and gamepad indicator. Used by MenuManager when
 * currentScreen is MAIN_MENU.
 *
 * RELATED: MenuManager.js, gameData.js (LEVELS), Gamepad.js.
 *
 * =============================================================================
 */

import { LEVELS } from "../../data/gameData.js";
import { GamepadInput } from "../../game/Gamepad.js";
import { SCREENS } from "../MenuManager.js";

function updateGamepadIndicator() {
  const indicator = document.getElementById("gamepad-indicator");
  if (indicator) {
    if (GamepadInput.connected) {
      indicator.textContent =
        "🎮 Gamepad: D-Pad - Navigate | A - Select | B - Back";
      indicator.classList.add("active");
    } else {
      indicator.textContent = "";
      indicator.classList.remove("active");
    }
  }
}

export function renderMainMenu(manager) {
  if (manager.startScene && manager.startScene.renderer) {
    manager.startScene.renderer.domElement.style.display = "block";
  }

  manager.menuContent.innerHTML = `
    <div class="menu-screen main-menu">
      <div class="main-menu-right">
        <div class="menu-title">
          <p class="subtitle"><a href="https://jamesckane.com" target="_blank" rel="noopener noreferrer" class="subtitle-link">JAMES C KANE</a>'S</p>
          <img class="menu-title-logo" src="/images/ui/Starspeed_WordMark.png" alt="Starspeed game title: metallic silver wordmark with stylized wing on the S and a glowing orange line through the text ending in a starburst." />
          <p class="subtitle">ZERO-G AERIAL COMBAT</p>
        </div>
        <div class="menu-panel">
          <div class="menu-content">
            <div class="menu-buttons">
              <label>CALLSIGN</label>
              <div class="name-input-group">
                <input type="text" id="player-name" value="${manager.playerName}" maxlength="16" />
              </div>
              <label>SINGLE-PLAYER</label>
              <button class="menu-btn" id="btn-testing">TESTING GROUNDS</button>
              <button class="menu-btn" id="btn-campaign" disabled>CAMPAIGN</button>
              <label>MULTI-PLAYER</label>
              <button class="menu-btn" id="btn-quick">QUICKMATCH</button>
              <button class="menu-btn" id="btn-join">JOIN MATCH</button>
              <button class="menu-btn" id="btn-create">CREATE MATCH</button>
              <label>MISC</label>
              <div class="menu-buttons-row">
                <button class="menu-btn" id="btn-feedback">FEEDBACK</button>
                <button class="menu-btn" id="btn-options">OPTIONS</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="level-select-modal" id="level-select-modal" style="display:none;">
        <div class="level-select-content">
          <h3>SELECT LEVEL</h3>
          <div class="form-group">
            <label>MAP</label>
            <select id="level-select-solo" class="menu-select">
              ${Object.values(LEVELS)
                .map(
                  (level) => `
                <option value="${level.id}">${level.name}</option>
              `,
                )
                .join("")}
            </select>
          </div>
          <div class="level-select-buttons">
            <button class="menu-btn" id="btn-level-start">START</button>
            <button class="menu-btn secondary" id="btn-level-cancel">CANCEL</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("player-name").addEventListener("input", (e) => {
    manager.saveCallsign(e.target.value || "Pilot");
  });

  document.getElementById("btn-testing").addEventListener("click", () => {
    document.getElementById("level-select-modal").style.display = "flex";
  });

  const levelModal = document.getElementById("level-select-modal");
  document.getElementById("btn-level-start").addEventListener("click", () => {
    const levelId = document.getElementById("level-select-solo").value;
    levelModal.style.display = "none";
    if (levelId) manager.emit("levelSelected", levelId);
    manager.emit("campaignStart");
  });

  document.getElementById("btn-level-cancel").addEventListener("click", () => {
    levelModal.style.display = "none";
  });

  levelModal.addEventListener("click", (e) => {
    if (e.target === levelModal) levelModal.style.display = "none";
  });

  document.getElementById("btn-create").addEventListener("click", () => {
    manager.showScreen(SCREENS.CREATE_GAME);
  });

  document.getElementById("btn-join").addEventListener("click", () => {
    manager.showScreen(SCREENS.JOIN_GAME);
  });

  document.getElementById("btn-quick").addEventListener("click", () => {
    manager.quickMatch();
  });

  document.getElementById("btn-options").addEventListener("click", () => {
    manager.showScreen(SCREENS.OPTIONS);
  });

  document.getElementById("btn-feedback").addEventListener("click", () => {
    manager.showFeedbackModal({});
  });

  updateGamepadIndicator();
}
