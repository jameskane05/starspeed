import { SCREENS } from "../constants.js";

export function renderJoinGame(manager) {
  manager.menuContent.innerHTML = `
    <div class="menu-screen join-game">
      <div class="join-game-wrapper">
        <div class="menu-header join-game-header">
          <button class="back-btn" id="btn-back">← BACK</button>
          <h2>JOIN MATCH</h2>
        </div>
        <div class="menu-content">
        <div class="join-code-section">
          <label>JOIN BY CODE</label>
          <div class="code-input-group">
            <input type="text" id="room-code" placeholder="Enter room code..." maxlength="16" />
            <button class="menu-btn" id="btn-join-code">JOIN</button>
          </div>
        </div>
        <div class="divider"><span>OR</span></div>
        <div class="room-list-section">
          <div class="room-list-header">
            <label>PUBLIC GAMES</label>
            <button class="refresh-btn" id="btn-refresh">↻ REFRESH</button>
          </div>
          <div class="room-list" id="room-list">
            <div class="loading">Searching for matches...</div>
          </div>
        </div>
      </div>
      </div>
    </div>
  `;

  document.getElementById("btn-back").addEventListener("click", () => {
    manager.stopRefreshing();
    manager.showScreen(SCREENS.MAIN_MENU);
  });

  document.getElementById("btn-join-code").addEventListener("click", () => {
    const code = document.getElementById("room-code").value.trim();
    if (code) manager.joinByCode(code);
  });

  document.getElementById("btn-refresh").addEventListener("click", () => {
    manager.refreshRoomList();
  });

  manager.refreshRoomList();
  manager.startRefreshing();
}
