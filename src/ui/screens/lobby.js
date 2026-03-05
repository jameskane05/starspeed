import NetworkManager from "../../network/NetworkManager.js";
import { LEVELS } from "../../data/gameData.js";
import { SCREENS } from "../constants.js";

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
                ([sessionId, player]) => `
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
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
          
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
            <img class="map-preview" src="${LEVELS[state.level]?.preview || "/hull_lights_emit.png"}" alt="" />
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
  };
  document.addEventListener("click", manager._shareTooltipOutsideClick);

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
