/**
 * createGame.js - CREATE MATCH SCREEN
 * =============================================================================
 *
 * ROLE: Renders create-game form: room name, map (LEVELS), game mode, player
 * limit. Binds create and back; used by MenuManager when currentScreen is CREATE_GAME.
 *
 * RELATED: MenuManager.js, gameData.js.
 *
 * =============================================================================
 */

import { LEVELS } from "../../data/gameData.js";
import { SCREENS } from "../MenuManager.js";

export function renderCreateGame(manager) {
  manager.menuContent.innerHTML = `
    <div class="menu-screen create-game">
      <div class="create-game-wrapper">
        <div class="menu-header create-game-header">
          <button class="back-btn" id="btn-back">← BACK</button>
          <h2>CREATE MATCH</h2>
        </div>
        <div class="menu-content">
        <div class="form-row form-row-top">
          <div class="form-group form-group-room-name">
            <label>ROOM NAME</label>
            <input type="text" id="room-name" value="${manager.playerName}'s Arena" maxlength="24" />
          </div>
          <div class="form-group form-group-map">
            <label>MAP</label>
            <select id="level-select" class="menu-select">
              ${Object.values(LEVELS)
                .map(
                  (level) => `
                <option value="${level.id}" ${level.id === "newworld" ? "selected" : ""}>${level.name}</option>
              `,
                )
                .join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>GAME MODE</label>
            <div class="mode-select stacked">
              <button class="mode-btn selected" data-mode="ffa">FREE FOR ALL</button>
              <button class="mode-btn disabled" data-mode="team" disabled>TEAM BATTLE</button>
            </div>
          </div>
          <div class="form-group">
            <label>VISIBILITY</label>
            <div class="visibility-select stacked">
              <button class="vis-btn selected" data-public="true">PUBLIC</button>
              <button class="vis-btn" data-public="false">PRIVATE</button>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>KILL LIMIT</label>
            <div class="limit-select">
              <button class="limit-btn" data-limit="10">10</button>
              <button class="limit-btn selected" data-limit="20">20</button>
              <button class="limit-btn" data-limit="30">30</button>
              <button class="limit-btn" data-limit="50">50</button>
            </div>
          </div>
          <div class="form-group">
            <label>MAX PLAYERS</label>
            <div class="players-select">
              <button class="players-btn" data-players="2">2</button>
              <button class="players-btn" data-players="4">4</button>
              <button class="players-btn" data-players="6">6</button>
              <button class="players-btn selected" data-players="8">8</button>
            </div>
          </div>
        </div>
        <button class="menu-btn primary large" id="btn-create-room">LAUNCH ARENA</button>
      </div>
      </div>
    </div>
  `;

  let selectedMode = "ffa";
  let selectedLevel = "newworld";
  let isPublic = true;
  let killLimit = 20;
  let maxPlayers = 8;

  document.getElementById("btn-back").addEventListener("click", () => {
    manager.showScreen(SCREENS.MAIN_MENU);
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      document
        .querySelectorAll(".mode-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedMode = btn.dataset.mode;
    });
  });

  document.querySelectorAll(".vis-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".vis-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      isPublic = btn.dataset.public === "true";
    });
  });

  document.querySelectorAll(".limit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".limit-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      killLimit = parseInt(btn.dataset.limit);
    });
  });

  document.querySelectorAll(".players-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".players-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      maxPlayers = parseInt(btn.dataset.players);
    });
  });

  document.getElementById("level-select").addEventListener("change", (e) => {
    selectedLevel = e.target.value;
  });

  document
    .getElementById("btn-create-room")
    .addEventListener("click", async () => {
      const roomName = document.getElementById("room-name").value.trim();
      const roomCode = roomName
        ? roomName
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 16) || null
        : null;
      await manager.createGame(
        roomName,
        selectedMode,
        isPublic,
        killLimit,
        maxPlayers,
        selectedLevel,
        roomCode,
      );
    });
}
