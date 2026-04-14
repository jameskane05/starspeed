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

import { GamepadInput } from "../../game/Gamepad.js";
import { SCREENS } from "../MenuManager.js";

function isVideoMainMenu() {
  return (
    typeof document !== "undefined" &&
    document.body.classList.contains("video-main-menu")
  );
}

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
  const matchmakingActive = Boolean(manager.matchmakingMessage);
  const videoCapture = isVideoMainMenu();

  if (manager.startScene && manager.startScene.renderer) {
    manager.startScene.renderer.domElement.style.display = "block";
  }

  if (videoCapture) {
    manager.menuContent.innerHTML = `
    <div class="menu-screen main-menu main-menu-video">
      <div class="main-menu-video-title">
        <div class="menu-title">
          <p class="subtitle"><a href="https://jamesckane.com" target="_blank" rel="noopener noreferrer" class="subtitle-link">JAMES C. KANE</a>'S</p>
          <img class="menu-title-logo" src="/images/ui/Starspeed_WordMark.png" alt="Starspeed game title: metallic silver wordmark with stylized wing on the S and a glowing orange line through the text ending in a starburst." />
          <p class="subtitle">ZERO-G AERIAL COMBAT</p>
        </div>
      </div>
    </div>
  `;
    updateGamepadIndicator();
    return;
  }

  manager.menuContent.innerHTML = `
    <div class="menu-screen main-menu">
      <div class="main-menu-right">
        <div class="menu-title">
          <p class="subtitle"><a href="https://jamesckane.com" target="_blank" rel="noopener noreferrer" class="subtitle-link">JAMES C. KANE</a>'S</p>
          <img class="menu-title-logo" src="/images/ui/Starspeed_WordMark.png" alt="Starspeed game title: metallic silver wordmark with stylized wing on the S and a glowing orange line through the text ending in a starburst." />
          <p class="subtitle">ZERO-G AERIAL COMBAT</p>
        </div>
        <div class="menu-panel">
          <div class="menu-content">
            <div class="menu-buttons">
              <label>CALLSIGN</label>
              <div class="name-input-group">
                <input type="text" id="player-name" value="${manager.playerName}" maxlength="16" ${matchmakingActive ? "disabled" : ""} />
              </div>
              <label>SINGLE-PLAYER</label>
              <button class="menu-btn" id="btn-training" ${matchmakingActive ? "disabled" : ""}>TRAINING GROUNDS</button>
              <button class="menu-btn" id="btn-campaign" ${matchmakingActive ? "disabled" : ""}>CAMPAIGN</button>
              <label>MULTI-PLAYER</label>
              <button class="menu-btn" id="btn-quick" ${matchmakingActive ? "disabled" : ""}>QUICKMATCH</button>
              <button class="menu-btn" id="btn-join" ${matchmakingActive ? "disabled" : ""}>JOIN MATCH</button>
              <button class="menu-btn" id="btn-create" ${matchmakingActive ? "disabled" : ""}>CREATE MATCH</button>
              <label>MISC</label>
              <div class="menu-buttons-row">
                <button class="menu-btn" id="btn-feedback" ${matchmakingActive ? "disabled" : ""}>FEEDBACK</button>
                <button class="menu-btn" id="btn-options" ${matchmakingActive ? "disabled" : ""}>OPTIONS</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${
        matchmakingActive
          ? `
      <div class="matchmaking-modal">
        <div class="matchmaking-modal-content">
          <div class="matchmaking-modal-title">MATCHMAKING</div>
          <div class="matchmaking-modal-message">${manager.matchmakingMessage}</div>
        </div>
      </div>
      `
          : ""
      }
    </div>
  `;

  document.getElementById("player-name").addEventListener("input", (e) => {
    manager.saveCallsign(e.target.value || "Pilot");
  });

  document.getElementById("btn-training").addEventListener("click", () => {
    manager.emit("trainingGroundsStart", "newworld");
  });

  document.getElementById("btn-campaign").addEventListener("click", () => {
    manager.emit("campaignStart");
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
