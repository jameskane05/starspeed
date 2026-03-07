/**
 * menuNetwork.js - MENU NETWORK EVENT HANDLERS
 * =============================================================================
 *
 * ROLE: Connects MenuManager to NetworkManager events: roomJoined, stateChange,
 * roomLeft, etc. Drives screen transitions (lobby, playing, results) and
 * countdown/chat/kick modals.
 *
 * KEY RESPONSIBILITIES:
 * - setupNetworkListeners(manager): subscribe to roomJoined, stateChange, roomLeft
 * - Show lobby/playing/results screens; renderLobby on countdown/lobby; procedural countdown beep
 * - showKickedModal, chat message handling
 *
 * RELATED: MenuManager.js, NetworkManager.js, ProceduralAudio.js.
 *
 * =============================================================================
 */

import NetworkManager from "../network/NetworkManager.js";
import { SCREENS } from "./MenuManager.js";
import proceduralAudio from "../audio/ProceduralAudio.js";

export function setupNetworkListeners(manager) {
  NetworkManager.on("roomJoined", () => {
    manager.showScreen(SCREENS.LOBBY);
  });

  NetworkManager.on("stateChange", (state) => {
    if (state.phase === "playing" && manager.currentScreen !== SCREENS.PLAYING) {
      manager.showScreen(SCREENS.PLAYING);
      manager.emit("gameStart");
    } else if (
      state.phase === "results" &&
      manager.currentScreen !== SCREENS.RESULTS
    ) {
      manager.showScreen(SCREENS.RESULTS);
    } else if (
      state.phase === "lobby" &&
      manager.currentScreen === SCREENS.RESULTS
    ) {
      manager.showScreen(SCREENS.LOBBY);
    } else if (state.phase === "countdown" || state.phase === "lobby") {
      if (
        state.phase === "countdown" &&
        state.countdown !== manager._lastCountdown
      ) {
        manager._lastCountdown = state.countdown;
        proceduralAudio.uiCountdown(state.countdown === 1);
      }
      manager.renderLobby();
    }
  });

  NetworkManager.on("roomLeft", (data) => {
    manager.chatMessages = [];
    if (data?.code === 4000) {
      showKickedModal(manager);
    } else {
      manager.showScreen(SCREENS.MAIN_MENU);
    }
  });

  NetworkManager.on("chat", (data) => {
    manager.addChatMessage(data);
  });

  NetworkManager.on("error", (err) => {
    console.error("[Menu] Network error:", err);
    let message = "Connection error";

    if (err.error?.message) {
      message = err.error.message;
    } else if (err.message) {
      message = err.message;
    }

    if (message.includes("already exists") || message.includes("roomId")) {
      message = "Room code already in use. Try a different code.";
    } else if (message.includes("not found")) {
      message = "Room not found. Check the code and try again.";
    } else if (message.includes("full")) {
      message = "Room is full.";
    }

    showError(manager, message);

    if (manager.currentScreen === SCREENS.PLAYING) return;
    if (manager.lastScreen) {
      manager.showScreen(manager.lastScreen);
    } else {
      manager.showScreen(SCREENS.MAIN_MENU);
    }
  });
}

export async function checkJoinUrl(manager) {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get("join");

  if (joinCode) {
    window.history.replaceState({}, "", window.location.pathname);
    await joinByCode(manager, joinCode);
  }
}

export function saveCallsign(manager, name) {
  manager.playerName = name;
  localStorage.setItem("starspeed_callsign", name);
}

export async function joinByCode(manager, code) {
  await NetworkManager.connect();
  await NetworkManager.joinRoom(code, { playerName: manager.playerName });
}

export async function refreshRoomList(manager) {
  const listEl = document.getElementById("room-list");
  if (!listEl) return;

  if (!NetworkManager.connected) {
    await NetworkManager.connect();
  }

  const rooms = await NetworkManager.getAvailableRooms();
  manager.roomList = rooms;

  if (rooms.length === 0) {
    listEl.innerHTML = `<div class="empty">No public matches found. Create one!</div>`;
    return;
  }

  listEl.innerHTML = rooms
    .map(
      (room) => `
      <div class="room-item" data-room-id="${room.roomId}">
        <div class="room-details">
          <span class="room-name">${room.metadata?.roomName || "Match"}</span>
          <span class="room-mode ${room.metadata?.mode || "ffa"}">${room.metadata?.mode === "team" ? "TEAM" : "FFA"}</span>
        </div>
        <div class="room-players">${room.clients}/${room.maxClients}</div>
        <button class="join-btn">JOIN</button>
      </div>
    `,
    )
    .join("");

  listEl.querySelectorAll(".room-item").forEach((item) => {
    item.querySelector(".join-btn").addEventListener("click", () => {
      joinByCode(manager, item.dataset.roomId);
    });
  });
}

export function startRefreshing(manager) {
  manager.refreshInterval = setInterval(
    () => refreshRoomList(manager),
    5000,
  );
}

export function stopRefreshing(manager) {
  if (manager.refreshInterval) {
    clearInterval(manager.refreshInterval);
    manager.refreshInterval = null;
  }
}

export function showKickedModal(manager) {
  manager.showScreen(SCREENS.MAIN_MENU);

  const overlay = document.createElement("div");
  overlay.className = "kicked-modal";
  overlay.innerHTML = `
    <div class="kicked-modal-content">
      <p>You were kicked out of a multiplayer lobby.</p>
      <button class="menu-btn" id="kicked-modal-ok">OK</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const dismiss = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };

  const onKey = (e) => {
    if (e.code === "Enter" || e.code === "Escape") dismiss();
  };
  document.addEventListener("keydown", onKey);

  overlay
    .querySelector("#kicked-modal-ok")
    .addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) dismiss();
  });
}

export function showError(manager, message) {
  const errorEl = document.createElement("div");
  errorEl.className = "error-toast";
  errorEl.textContent = message;
  document.body.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 3000);
}
