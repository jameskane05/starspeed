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
    kills: document.getElementById("kills"),
    missiles: document.getElementById("missiles"),
    boost: document.getElementById("boost"),
    mobileMissiles: document.getElementById("mobile-missiles"),
    mobileBoost: document.getElementById("mobile-boost"),
  };
  game.controlsHelpEl = document.getElementById("controls-help");

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
        <span class="lb-kills">K</span>
        <span class="lb-deaths">D</span>
      </div>
      ${players
        .map(
          (p, i) => `
        <div class="leaderboard-row ${p.id === localId ? "local" : ""}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${p.name}</span>
          <span class="lb-kills">${p.kills}</span>
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

function formatMatchTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function updateLeaderboardTimer(game) {
  if (
    !game.isMultiplayer ||
    !game.leaderboardEl?.classList.contains("active")
  )
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
      ["Missile", null],
      ["Headlight", "toggleHeadlight"],
      ["Leaderboard", "leaderboard"],
      ["Pause", "pause"],
    ];
    const rowLabels = { Fire: "Left Click", Missile: "Right Click" };
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

  if (game.isMultiplayer) {
    NetworkManager.leaveRoom();
    game.cleanupMultiplayer();
    game.isMultiplayer = false;
  }

  game.renderer.domElement.style.display = "none";

  document.getElementById("crosshair").classList.remove("active");
  document.getElementById("hud").classList.remove("active");
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

  let kills = 0;
  if (game.isMultiplayer) {
    const localPlayer = NetworkManager.getLocalPlayer();
    kills = localPlayer?.kills || 0;
  } else {
    kills = game.gameManager.getState().enemiesKilled || 0;
  }

  if (healthPercent !== game._hudLast.health) {
    game.hud.health.textContent = String(healthPercent);
    game._hudLast.health = healthPercent;
  }
  if (kills !== game._hudLast.kills) {
    game.hud.kills.textContent = String(kills);
    game._hudLast.kills = kills;
  }
  if (missiles !== game._hudLast.missiles) {
    const maxMissiles = game.player.maxMissiles || missiles;
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
}
