/**
 * gameInGameUI.js - IN-GAME HUD, ESC MENU, AND LEADERBOARD
 * =============================================================================
 *
 * ROLE: Sets up and controls in-play UI: HUD elements (health, kills, missiles,
 * boost), ESC pause menu, leaderboard overlay, and controls help. Binds DOM
 * elements and keyboard (KeyBindings) for menu toggle and resume.
 *
 * KEY RESPONSIBILITIES:
 * - setup(game): bind HUD refs, game menu and leaderboard buttons to DOM
 * - updateHUD(game), toggleEscMenu(game), showEscMenu / resumeGame
 * - showLeaderboard / hideLeaderboard; controls help visibility
 *
 * RELATED: MenuManager.js, KeyBindings.js, gameData.js, ShipDestruction.js.
 *
 * =============================================================================
 */

import MenuManager from "../ui/MenuManager.js";
import NetworkManager from "../network/NetworkManager.js";
import { KeyBindings, getKeyDisplayName } from "./KeyBindings.js";
import { GAME_STATES } from "../data/gameData.js";
import { cleanupDestruction } from "../vfx/ShipDestruction.js";

export function setup(game) {
  game.hud = {
    health: document.getElementById("health"),
    missiles: document.getElementById("missiles"),
    boost: document.getElementById("boost"),
    mobileMissiles: document.getElementById("mobile-missiles"),
    mobileBoost: document.getElementById("mobile-boost"),
  };
  game.controlsHelpEl = document.getElementById("controls-help");
  if (!game.missionPanel) {
    game.missionPanel = document.createElement("div");
    game.missionPanel.id = "mission-panel";
    game.missionPanel.className = "mission-panel collapsed";
    game.missionPanel.innerHTML = `
      <button
        id="mission-panel-toggle"
        class="mission-panel-toggle"
        type="button"
        aria-expanded="false"
      >
        <span>OBJECTIVES</span>
        <span class="mission-panel-chevron">+</span>
      </button>
      <div id="mission-panel-content" class="mission-panel-content"></div>
    `;
    document.body.appendChild(game.missionPanel);
    game.missionPanelContent = game.missionPanel.querySelector(
      "#mission-panel-content",
    );
    const missionPanelToggle = game.missionPanel.querySelector(
      "#mission-panel-toggle",
    );
    missionPanelToggle?.addEventListener("click", () => {
      game.missionPanelCollapsed = !game.missionPanelCollapsed;
      syncMissionPanelState(game);
    });
  }
  if (game.missionPanelCollapsed == null) {
    game.missionPanelCollapsed = isMobileLayout(game);
  }
  syncMissionPanelState(game);

  const gameMenuBtn = document.getElementById("game-menu-btn");
  const gameLeaderboardBtn = document.getElementById("game-leaderboard-btn");
  if (gameMenuBtn) {
    gameMenuBtn.addEventListener("click", () => showEscMenu(game));
  }
  if (gameLeaderboardBtn) {
    gameLeaderboardBtn.addEventListener("click", () => {
      if (!game.gameManager?.isPlaying()) return;
      const isOpen = document
        .getElementById("tab-leaderboard")
        ?.classList.contains("active");
      if (isOpen) hideLeaderboard(game);
      else showLeaderboard(game);
    });
  }
  updateLeaderboardButtonVisibility(game);
}

export function toggleEscMenu(game) {
  if (!game.gameManager?.isPlaying()) return;

  if (game.isEscMenuOpen) {
    resumeGame(game);
  } else if (document.pointerLockElement) {
    document.exitPointerLock();
  } else {
    showEscMenu(game);
  }
}

export function showEscMenu(game) {
  if (game.isEscMenuOpen) return;
  game.isEscMenuOpen = true;
  document.exitPointerLock();
  document.getElementById("crosshair").classList.remove("active");

  if (!game.escMenu) {
    game.escMenu = document.createElement("div");
    game.escMenu.id = "esc-menu";
    document.body.appendChild(game.escMenu);
  }

  game.escMenu.innerHTML = `
    <div class="esc-overlay"></div>
    <div class="esc-content">
      <h2>MENU</h2>
      <div class="esc-buttons">
        <button id="esc-resume" class="esc-btn">RESUME</button>
        <button id="esc-options" class="esc-btn">OPTIONS</button>
        <button id="esc-feedback" class="esc-btn">FEEDBACK</button>
        <button id="esc-leave" class="esc-btn esc-btn-danger">LEAVE MATCH</button>
      </div>
    </div>
  `;

  game.escMenu.querySelector(".esc-overlay")?.addEventListener("click", () => {
    resumeGame(game);
  });
  game.escMenu.querySelector(".esc-content")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document
    .getElementById("esc-resume")
    .addEventListener("click", () => resumeGame(game));
  document
    .getElementById("esc-options")
    .addEventListener("click", () => showOptionsMenu(game));
  document.getElementById("esc-feedback").addEventListener("click", () => {
    game.escMenu.style.display = "none";
    MenuManager.showFeedbackModal({
      onClose: () => {
        if (game.isEscMenuOpen && game.escMenu) {
          game.escMenu.style.display = "flex";
        }
      },
    });
  });
  document
    .getElementById("esc-leave")
    .addEventListener("click", () => leaveMatch(game));

  game.escMenu.style.display = "flex";
}

export function showOptionsMenu(game) {
  if (game.escMenu) {
    game.escMenu.style.display = "none";
  }
  game.inOptions = true;
  MenuManager.showOptionsFromGame(() => {
    game.inOptions = false;
    if (game.isEscMenuOpen && game.escMenu) {
      game.escMenu.style.display = "flex";
    }
  });
}

export function showLeaderboard(game) {
  if (!game.isMultiplayer) return;
  if (!game.leaderboardEl) {
    game.leaderboardEl = document.createElement("div");
    game.leaderboardEl.id = "tab-leaderboard";
    document.body.appendChild(game.leaderboardEl);
  }

  let players;
  let localId;

  if (game.isMultiplayer) {
    localId = NetworkManager.sessionId;
    players = NetworkManager.getPlayers()
      .map(([id, p]) => ({
        id,
        name: p.name,
        kills: p.kills,
        deaths: p.deaths,
      }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  } else {
    const state = game.gameManager.getState();
    localId = "local";
    players = [
      {
        id: "local",
        name: MenuManager.playerName || "Pilot",
        kills: state.enemiesKilled || 0,
        deaths: state.deaths || 0,
      },
    ];
  }

  let timerHtml = "";
  if (game.isMultiplayer) {
    const state = NetworkManager.getState();
    const elapsed = state?.matchTime ?? 0;
    const max = state?.maxMatchTime ?? 480;
    timerHtml = `<div class="leaderboard-timer" id="leaderboard-timer">${formatMatchTime(elapsed)} / ${formatMatchTime(max)}</div>`;
  }

  game.leaderboardEl.innerHTML = `
    <div class="leaderboard">
      <h2>LEADERBOARD</h2>
      <div class="leaderboard-header">
        <span class="lb-rank">#</span>
        <span class="lb-name">PILOT</span>
        <span class="lb-deaths">D</span>
      </div>
      ${players
        .map(
          (p, i) => `
        <div class="leaderboard-row ${p.id === localId ? "local" : ""}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${p.name}</span>
          <span class="lb-deaths">${p.deaths}</span>
        </div>
      `,
        )
        .join("")}
      ${timerHtml}
    </div>
  `;

  game.leaderboardEl.classList.add("active");
}

export function hideLeaderboard(game) {
  if (game.leaderboardEl) {
    game.leaderboardEl.classList.remove("active");
  }
}

export function updateLeaderboardButtonVisibility(game) {
  const visible = Boolean(game.isMultiplayer);
  const desktopBtn = document.getElementById("game-leaderboard-btn");
  const mobileBtn = document.getElementById("mobile-leaderboard-btn");
  if (desktopBtn) {
    desktopBtn.style.display = visible ? "" : "none";
    desktopBtn.disabled = !visible;
  }
  if (mobileBtn) {
    mobileBtn.style.display = visible ? "" : "none";
    mobileBtn.disabled = !visible;
  }
  if (!visible) {
    hideLeaderboard(game);
  }
}

function formatMatchTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function updateLeaderboardTimer(game) {
  if (!game.isMultiplayer || !game.leaderboardEl?.classList.contains("active"))
    return;
  const el = document.getElementById("leaderboard-timer");
  if (!el) return;
  const state = NetworkManager.getState();
  const elapsed = state?.matchTime ?? 0;
  const max = state?.maxMatchTime ?? 480;
  el.textContent = `${formatMatchTime(elapsed)} / ${formatMatchTime(max)}`;
}

export function showControlsHelp(game, visible) {
  if (!game.controlsHelpEl) return;
  if (!game.gameManager?.isPlaying()) {
    if (!visible) game.controlsHelpEl.classList.remove("visible");
    return;
  }
  if (visible) {
    const bindings = KeyBindings.getAllBindings();
    const rows = [
      ["Move", "forward", "backward", "left", "right"],
      ["Look", "lookUp", "lookDown", "lookLeft", "lookRight"],
      ["Roll", "rollLeft", "rollRight"],
      ["Strafe", "strafeUp", "strafeDown"],
      ["Boost", "boost"],
      ["Fire", null],
      ["Missile fire", null],
      ["Switch missile mode", "switchMissileMode"],
      ["Homing missile", "missile"],
      ["Kinetic missile", "kineticMissile"],
      ["Headlight", "toggleHeadlight"],
      ["Leaderboard", "leaderboard"],
      ["Pause", "pause"],
    ];
    const rowLabels = { Fire: "Left Click", "Missile fire": "Right Click" };
    const html = rows
      .map(([label, ...actions]) => {
        const keys = actions
          .filter(Boolean)
          .map((a) => bindings[a] && getKeyDisplayName(bindings[a]))
          .filter(Boolean)
          .join(" ");
        const display = rowLabels[label] || keys || "-";
        return `<span class="ctrl-row"><span class="ctrl-label">${label}:</span><span class="ctrl-key">${display}</span></span>`;
      })
      .join("");
    game.controlsHelpEl.querySelector(".controls-help-content").innerHTML =
      html;
    game.controlsHelpEl.classList.add("visible");
  } else {
    game.controlsHelpEl.classList.remove("visible");
  }
}

export function resumeGame(game) {
  if (!game.isEscMenuOpen) return;
  game.isEscMenuOpen = false;

  if (game.escMenu) {
    game.escMenu.style.display = "none";
  }

  document.getElementById("crosshair").classList.add("active");

  if (!game.input.mobile.shouldSkipPointerLock()) {
    const canvas = game.renderer.domElement;
    canvas.requestPointerLock?.()?.catch?.(() => {
      const clickToLock = () => {
        canvas.requestPointerLock?.();
        canvas.removeEventListener("click", clickToLock);
      };
      canvas.addEventListener("click", clickToLock);
    });
  }
}

export function leaveMatch(game) {
  game.isEscMenuOpen = false;

  if (game.escMenu) {
    game.escMenu.style.display = "none";
  }

  cleanupDestruction(game.scene);
  game.missionManager?.stopMission();
  game.pendingMissionConfig = null;

  if (game.isMultiplayer) {
    NetworkManager.leaveRoom();
    game.cleanupMultiplayer();
    game.isMultiplayer = false;
  }

  game.renderer.domElement.style.display = "none";

  document.getElementById("crosshair").classList.remove("active");
  document.getElementById("hud").classList.remove("active");
  if (game.missionPanel) {
    game.missionPanel.style.display = "none";
  }
  game.missionPanelCollapsed = isMobileLayout(game);
  syncMissionPanelState(game);
  game.player = null;
  MenuManager.show();
  game.gameManager.setState({
    currentState: GAME_STATES.MENU,
    isRunning: false,
    isMultiplayer: false,
  });
}

export function updateHUD(game, delta) {
  if (!game.hud || !game.player) return;
  delta = Number.isFinite(delta) ? delta : 0.1;

  game._hudAccum += delta;
  if (game._hudAccum < 0.1) return;
  game._hudAccum = 0;

  const healthPercent = Math.max(
    0,
    Math.round((game.player.health / game.player.maxHealth) * 100),
  );
  const missiles = game.player.missiles;
  const boostPercent = Math.max(
    0,
    Math.round((game.player.boostFuel / game.player.maxBoostFuel) * 100),
  );

  if (healthPercent !== game._hudLast.health) {
    if (game.hud.health) game.hud.health.textContent = String(healthPercent);
    game._hudLast.health = healthPercent;
  }
  const maxMissiles = game.player.maxMissiles || missiles;
  if (missiles !== game._hudLast.missiles) {
    const text = `${missiles}/${maxMissiles}`;
    if (game.hud.missiles) game.hud.missiles.textContent = text;
    if (game.hud.mobileMissiles) game.hud.mobileMissiles.textContent = text;
    game._hudLast.missiles = missiles;
  }
  if (boostPercent !== game._hudLast.boost) {
    const text = String(boostPercent);
    if (game.hud.boost) game.hud.boost.textContent = text;
    if (game.hud.mobileBoost) game.hud.mobileBoost.textContent = text;
    game._hudLast.boost = boostPercent;
  }
  game.player.updateCockpitStatusDisplay?.({
    healthPercent,
    missiles,
    maxMissiles,
    boostPercent,
  });

  updateMissionPanel(game);
}

function updateMissionPanel(game) {
  if (!game.missionPanel) return;
  const state = game.gameManager?.getState?.();
  const activeMission =
    state?.currentMissionId &&
    ["active", "complete"].includes(state?.missionStatus);
  const objectives = state?.currentObjectives ?? [];

  if (!activeMission || !objectives.length) {
    game.missionPanel.style.display = "none";
    if (game.missionPanelContent) {
      game.missionPanelContent.innerHTML = "";
    }
    return;
  }

  const statusLabel =
    state.missionStatus === "complete" ? "COMPLETE" : "OBJECTIVES";
  game.missionPanel.style.display = "block";
  if (game.missionPanelContent) {
    game.missionPanelContent.innerHTML = `
      <div class="mission-panel-title">${state.missionStepTitle || "Mission"}</div>
      <div class="mission-panel-list">
        ${objectives
          .map(
            (objective) => `
              <div class="mission-panel-item ${objective.completed ? "completed" : ""}">
                <span class="mission-panel-marker">${objective.completed ? "✓" : "○"}</span>
                <span>${objective.text}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }
  syncMissionPanelState(game);
}

function syncMissionPanelState(game) {
  if (!game.missionPanel) return;
  const collapsed = game.missionPanelCollapsed !== false;
  game.missionPanel.classList.toggle("collapsed", collapsed);
  const toggle = game.missionPanel.querySelector("#mission-panel-toggle");
  const chevron = game.missionPanel.querySelector(".mission-panel-chevron");
  if (toggle) {
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  if (chevron) {
    chevron.textContent = collapsed ? "+" : "−";
  }
}

function isMobileLayout(game) {
  return Boolean(game?.gameManager?.state?.isMobile);
}
