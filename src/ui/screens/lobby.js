/**
 * lobby.js - LOBBY SCREEN AND CHAT
 * =============================================================================
 *
 * ROLE: Renders lobby screen: room info, player list, ready/kick, level select,
 * chat messages. Handles addChatMessage, updateChatDisplay, mute; bindings
 * for start match, leave, ready. Used by MenuManager and menuNetwork.
 *
 * RELATED: MenuManager.js, menuNetwork.js, NetworkManager.js, gameData.js.
 *
 * =============================================================================
 */

import NetworkManager from "../../network/NetworkManager.js";
import { LEVELS } from "../../data/gameData.js";
import {
  LOBBY_COLOR_PALETTE,
  normalizeLobbyHex,
} from "../../data/lobbyColors.js";
function isPaletteColorTakenByOther(players, sessionId, hex) {
  const n = normalizeLobbyHex(hex);
  for (const [sid, p] of players) {
    if (sid === sessionId) continue;
    if (normalizeLobbyHex(p.accentColor || "#00ffff") === n) return true;
  }
  return false;
}

function positionLobbyColorPopover() {
  const btn = document.getElementById("btn-lobby-color");
  const pop = document.getElementById("lobby-color-popover");
  if (!btn || !pop) return;
  const r = btn.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.top = `${r.bottom + 6}px`;
  pop.style.right = `${window.innerWidth - r.right}px`;
  pop.style.left = "auto";
  pop.style.bottom = "auto";
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function addChatMessage(manager, data) {
  if (manager.mutedPlayers.has(data.senderId)) return;

  manager.chatMessages.push({
    senderId: data.senderId,
    senderName: data.senderName,
    text: data.text,
    timestamp: data.timestamp,
    isLocal: data.senderId === NetworkManager.sessionId,
  });

  if (manager.chatMessages.length > manager.maxChatMessages) {
    manager.chatMessages.shift();
  }

  updateChatDisplay(manager);
}

export function updateChatDisplay(manager) {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return;

  chatMessages.innerHTML = manager.chatMessages
    .map(
      (msg) => `
    <div class="chat-message ${msg.isLocal ? "local" : ""}">
      <span class="chat-sender">${msg.senderName}:</span>
      <span class="chat-text">${escapeHtml(msg.text)}</span>
    </div>
  `,
    )
    .join("");

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function sendChatMessage(manager) {
  const input = document.getElementById("chat-input");
  if (!input) return;

  const text = input.value.trim();
  if (text) {
    NetworkManager.sendChat(text);
    input.value = "";
  }
}

export function toggleMute(manager, sessionId) {
  if (manager.mutedPlayers.has(sessionId)) {
    manager.mutedPlayers.delete(sessionId);
  } else {
    manager.mutedPlayers.add(sessionId);
  }
  localStorage.setItem(
    "starspeed_muted",
    JSON.stringify([...manager.mutedPlayers]),
  );
  manager.renderLobby();
}

export function renderLobby(manager) {
  const state = NetworkManager.getState();
  if (!state) return;

  const isHost = NetworkManager.isHost();
  const localPlayer = NetworkManager.getLocalPlayer();
  const players = NetworkManager.getPlayers();

  const isCountdown = state.phase === "countdown";
  const allReady = players.every(([, p]) => p.ready);
  const canStart =
    isHost && players.length >= 1 && (allReady || players.length === 1);

  const localAccent = (p) => normalizeLobbyHex(p.accentColor || "#00ffff");

  const colorPickerHtml =
    !isCountdown && state.phase === "lobby"
      ? `
      <div class="lobby-color-popover" id="lobby-color-popover">
        <div class="lobby-color-grid">
          ${LOBBY_COLOR_PALETTE.map((hex) => {
            const taken = isPaletteColorTakenByOther(
              players,
              NetworkManager.sessionId,
              hex,
            );
            return `
            <button type="button" class="lobby-color-option${taken ? " taken" : ""}"
              data-color="${hex}"
              style="--swatch:${hex}"
              ${taken ? "disabled" : ""}
              aria-label="${taken ? "Taken" : "Select color"}"
            ></button>`;
          }).join("")}
        </div>
      </div>
    `
      : "";

  manager.menuContent.innerHTML = `
    <div class="menu-screen lobby">
      <div class="lobby-wrapper">
        <div class="menu-header lobby-header">
          <button class="back-btn" id="btn-leave">← LEAVE</button>
          <h2>${state.roomName || "GAME LOBBY"}</h2>
          <div class="room-info">
          <div class="room-code-wrapper">
            <span class="room-code" id="room-code-btn">CODE: ${NetworkManager.room?.roomId?.toUpperCase() || "..."}</span>
            <div class="share-tooltip" id="share-tooltip">
              <label>SHARE LINK</label>
              <div class="share-input-group">
                <input type="text" id="share-url" readonly value="${window.location.origin}${window.location.pathname}?join=${NetworkManager.room?.roomId || ""}" />
                <button class="copy-btn" id="btn-copy">📋</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      ${
        isCountdown
          ? `
        <div class="countdown-overlay">
          <div class="countdown-overlay-inner">
            <div class="countdown-number">${state.countdown}</div>
            <div class="countdown-text">GET READY</div>
          </div>
        </div>
      `
          : ""
      }
      
      <div class="lobby-content">
        <div class="players-section">
          <h3>PILOTS (${players.length}/8)</h3>
          <div class="player-list">
            ${players
              .map(
                ([sessionId, player]) => {
                  const accent = localAccent(player);
                  const showPicker =
                    sessionId === NetworkManager.sessionId &&
                    !isCountdown &&
                    state.phase === "lobby";
                  const swatchEl = showPicker
                    ? `
                  <div class="lobby-color-wrap">
                    <button type="button" class="lobby-color-swatch" id="btn-lobby-color" style="background:${accent}" aria-label="Choose accent color"></button>
                  </div>`
                    : `
                  <span class="lobby-color-swatch readonly" style="background:${accent}" title="" aria-hidden="true"></span>`;
                  return `
              <div class="player-card ${player.ready ? "ready" : ""} ${sessionId === NetworkManager.sessionId ? "local" : ""} ${state.mode === "team" ? `team-${player.team}` : ""}">
                <div class="player-info">
                  <span class="player-name">${player.name}${state.hostId === sessionId ? " ★" : ""}</span>
                </div>
                <div class="player-actions">
                  ${
                    sessionId !== NetworkManager.sessionId
                      ? `
                    <button class="mute-btn ${manager.mutedPlayers.has(sessionId) ? "muted" : ""}" data-session="${sessionId}" title="${manager.mutedPlayers.has(sessionId) ? "Unmute" : "Mute"}">
                      ${manager.mutedPlayers.has(sessionId) ? "🔇" : "🔊"}
                    </button>
                    ${
                      isHost && !isCountdown
                        ? `
                      <button class="kick-btn" data-session="${sessionId}" title="Kick">×</button>
                    `
                        : ""
                    }
                  `
                      : ""
                  }
                  <div class="player-status">${player.ready ? "READY" : "..."}</div>
                  ${swatchEl}
                </div>
              </div>
            `;
                },
              )
              .join("")}
          </div>
          ${
            !isCountdown && state.phase === "lobby" ? colorPickerHtml : ""
          }
          
          <div class="chat-section">
            <div class="chat-messages" id="chat-messages">
              ${manager.chatMessages
                .map(
                  (msg) => `
                <div class="chat-message ${msg.isLocal ? "local" : ""}">
                  <span class="chat-sender">${msg.senderName}:</span>
                  <span class="chat-text">${escapeHtml(msg.text)}</span>
                </div>
              `,
                )
                .join("")}
            </div>
            <div class="chat-input-row">
              <input type="text" id="chat-input" placeholder="Type a message..." maxlength="200" />
              <button class="chat-send-btn" id="btn-send-chat">SEND</button>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <div class="lobby-map-info">
            <img class="map-preview" src="${LEVELS[state.level]?.preview || "/ships/hull_lights_emit.png"}" alt="" />
            <div class="map-details">
              <h3>MAP</h3>
              ${
                isHost
                  ? `
                <select id="lobby-level-select" class="menu-select">
                  ${Object.values(LEVELS)
                    .map(
                      (level) => `
                    <option value="${level.id}" ${level.id === state.level ? "selected" : ""}>${level.name}</option>
                  `,
                    )
                    .join("")}
                </select>
              `
                  : `
                <div class="map-name">${LEVELS[state.level]?.name || state.level || "Unknown"}</div>
              `
              }
              <div class="lobby-map-meta">
                <span class="mode-badge ${state.mode}">${state.mode === "ffa" ? "FFA" : "TEAM"}</span>
                <span class="visibility-badge ${state.isPublic !== false ? "public" : "private"}">${state.isPublic !== false ? "PUBLIC" : "PRIVATE"}</span>
              </div>
            </div>
          </div>
          
          <div class="lobby-actions">
            <label class="ready-checkbox">
              <input type="checkbox" id="chk-ready" ${localPlayer?.ready ? "checked" : ""} />
              <span class="ready-checkmark"></span>
              <span class="ready-label">READY</span>
            </label>
            ${
              isHost
                ? `
              <button class="menu-btn primary ${canStart ? "" : "disabled"}" id="btn-start" ${canStart ? "" : "disabled"}>
                START MATCH
              </button>
            `
                : ""
            }
          </div>
        </div>
      </div>
      </div>
    </div>
  `;

  document.getElementById("btn-leave").addEventListener("click", () => {
    NetworkManager.leaveRoom();
  });

  const shareTooltip = document.getElementById("share-tooltip");
  document.getElementById("room-code-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    shareTooltip.classList.toggle("active");
    if (shareTooltip.classList.contains("active")) {
      document.getElementById("share-url").select();
    }
  });

  document.getElementById("btn-copy").addEventListener("click", async (e) => {
    e.stopPropagation();
    const btn = e.target;
    const url = document.getElementById("share-url").value;
    await navigator.clipboard.writeText(url);
    btn.textContent = "✓";
    setTimeout(() => {
      btn.textContent = "📋";
      shareTooltip.classList.remove("active");
    }, 500);
  });

  if (manager._shareTooltipOutsideClick) {
    document.removeEventListener("click", manager._shareTooltipOutsideClick);
  }
  manager._shareTooltipOutsideClick = (e) => {
    const tooltip = document.getElementById("share-tooltip");
    if (
      tooltip?.classList.contains("active") &&
      !e.target.closest(".room-code-wrapper")
    ) {
      tooltip.classList.remove("active");
    }
    const colorPop = document.getElementById("lobby-color-popover");
    if (
      colorPop?.classList.contains("active") &&
      !e.target.closest(".lobby-color-wrap") &&
      !e.target.closest("#lobby-color-popover")
    ) {
      colorPop.classList.remove("active");
    }
  };
  document.addEventListener("click", manager._shareTooltipOutsideClick);

  if (manager._lobbyColorOverlayCleanup) {
    manager._lobbyColorOverlayCleanup();
    manager._lobbyColorOverlayCleanup = null;
  }

  const swatchBtn = document.getElementById("btn-lobby-color");
  const colorPop = document.getElementById("lobby-color-popover");
  if (swatchBtn && colorPop) {
    swatchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = !colorPop.classList.contains("active");
      if (opening) {
        colorPop.classList.add("active");
        requestAnimationFrame(() => positionLobbyColorPopover());
      } else {
        colorPop.classList.remove("active");
      }
    });
    colorPop.querySelectorAll(".lobby-color-option:not(.taken)").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        NetworkManager.sendLobbyColor(opt.dataset.color);
        colorPop.classList.remove("active");
      });
    });

    const closeColorPop = () =>
      document.getElementById("lobby-color-popover")?.classList.remove("active");
    const playerListEl = document.querySelector(".lobby .player-list");
    const onListScroll = () => closeColorPop();
    const onResize = () => closeColorPop();
    if (playerListEl) {
      playerListEl.addEventListener("scroll", onListScroll, { passive: true });
    }
    window.addEventListener("resize", onResize);
    manager._lobbyColorOverlayCleanup = () => {
      if (playerListEl) {
        playerListEl.removeEventListener("scroll", onListScroll);
      }
      window.removeEventListener("resize", onResize);
    };
  }

  document.getElementById("chk-ready")?.addEventListener("change", () => {
    NetworkManager.toggleReady();
  });

  document.getElementById("btn-start")?.addEventListener("click", () => {
    NetworkManager.startGame();
  });

  document
    .getElementById("lobby-level-select")
    ?.addEventListener("change", (e) => {
      const level = e.target.value;
      NetworkManager.setLevel(level);
    });

  document.getElementById("btn-send-chat")?.addEventListener("click", () => {
    sendChatMessage(manager);
  });

  document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage(manager);
    }
  });

  document.querySelectorAll(".mute-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMute(manager, btn.dataset.session);
    });
  });

  document.querySelectorAll(".kick-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      NetworkManager.kickPlayer(btn.dataset.session);
    });
  });

  const chatMessagesEl = document.getElementById("chat-messages");
  if (chatMessagesEl) {
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
}
