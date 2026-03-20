/**
 * results.js - MATCH RESULTS SCREEN
 * =============================================================================
 *
 * ROLE: Renders post-match scoreboard: rank, pilot, kills, deaths, K/D; team
 * scores for team mode. Data from NetworkManager.getState() and getPlayers().
 *
 * RELATED: MenuManager.js, menuNetwork.js, NetworkManager.js.
 *
 * =============================================================================
 */

import NetworkManager from "../../network/NetworkManager.js";
import { SCREENS } from "../MenuManager.js";

export function renderResults(manager) {
  const state = NetworkManager.getState();
  if (!state) return;

  const players = NetworkManager.getPlayers().sort(
    (a, b) => b[1].kills - a[1].kills,
  );

  manager.container.classList.remove("hidden");
  manager.menuContent.innerHTML = `
    <div class="menu-screen results">
      <div class="results-header">
        <h1>MATCH COMPLETE</h1>
        ${
          state.mode === "team"
            ? `
          <div class="team-scores">
            <div class="team-score team-1">RED: ${state.team1Score}</div>
            <div class="team-score team-2">BLUE: ${state.team2Score}</div>
          </div>
        `
            : ""
        }
      </div>
      <div class="scoreboard">
        <div class="scoreboard-header">
          <span>RANK</span>
          <span>PILOT</span>
          <span>DEATHS</span>
        </div>
        ${players
          .map(
            ([sessionId, player], index) => `
          <div class="scoreboard-row ${sessionId === NetworkManager.sessionId ? "local" : ""} ${state.mode === "team" ? `team-${player.team}` : ""}">
            <span class="rank">#${index + 1}</span>
            <span class="name">${player.name}</span>
            <span class="deaths">${player.deaths}</span>
          </div>
        `,
          )
          .join("")}
      </div>
      <div class="results-footer">
        <p>Returning to lobby in 10 seconds...</p>
      </div>
    </div>
  `;
}
