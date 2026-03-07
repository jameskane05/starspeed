/**
 * feedbackDashboard.js - FEEDBACK LIST AND API BASE
 * =============================================================================
 *
 * ROLE: Renders feedback dashboard screen (list of submitted feedback) and
 * provides getFeedbackApiBase() for modal submit URL. Fetches feedback from API.
 *
 * RELATED: MenuManager.js, feedbackModal.js, NetworkManager.js.
 *
 * =============================================================================
 */

import NetworkManager from "../../network/NetworkManager.js";
import { SCREENS } from "../MenuManager.js";

export function getFeedbackApiBase() {
  const base = (NetworkManager.serverUrl || "")
    .replace(/^ws:/, "http:")
    .replace(/^wss:/, "https:");
  return base || window.location.origin;
}

export function renderFeedbackDashboard(manager) {
  manager.feedbackDashboardData = manager.feedbackDashboardData || [];

  const escapeHtml = (s) => {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  };
  const formatRatings = (r) => {
    if (!r || typeof r !== "object") return "—";
    const parts = [];
    if (typeof r.gameplay === "number") parts.push("G:" + r.gameplay);
    if (typeof r.performance === "number") parts.push("P:" + r.performance);
    if (typeof r.graphics === "number") parts.push("Gr:" + r.graphics);
    if (typeof r.overall === "number") parts.push("O:" + r.overall);
    return parts.length ? parts.join(" ") : "—";
  };

  manager.menuContent.innerHTML = `
    <div class="menu-screen feedback-dashboard-screen">
      <div class="feedback-dashboard-header">
        <button class="back-btn" id="feedback-dashboard-back">← BACK</button>
        <h2>FEEDBACK DASHBOARD</h2>
      </div>
      <div class="feedback-dashboard-toolbar">
        <label class="feedback-dashboard-label">Key: <input type="password" id="feedback-dashboard-key" placeholder="Optional dashboard key" class="feedback-dashboard-input" /></label>
        <button type="button" class="menu-btn" id="feedback-dashboard-load">LOAD</button>
        <label class="feedback-dashboard-label">Type: <select id="feedback-dashboard-filter" class="menu-select feedback-dashboard-select"><option value="">All</option><option value="feedback">Feedback</option><option value="bug">Bug Report</option></select></label>
        <button type="button" class="menu-btn secondary" id="feedback-dashboard-export">EXPORT CSV</button>
      </div>
      <div id="feedback-dashboard-error" class="feedback-dashboard-error" style="display:none;"></div>
      <div id="feedback-dashboard-table-wrap" class="feedback-dashboard-table-wrap"></div>
    </div>
  `;

  const renderTable = () => {
    const filterType = document.getElementById("feedback-dashboard-filter").value;
    const list = !filterType ? manager.feedbackDashboardData : manager.feedbackDashboardData.filter((r) => r.type === filterType);
    const wrap = document.getElementById("feedback-dashboard-table-wrap");
    if (list.length === 0) {
      wrap.innerHTML = "<p class=\"feedback-dashboard-empty\">No feedback entries.</p>";
      return;
    }
    wrap.innerHTML = "<table class=\"feedback-dashboard-table\"><thead><tr><th>Date</th><th>Type</th><th>Name</th><th>Email</th><th>Message</th><th>Ratings</th><th></th></tr></thead><tbody>" +
      list.map((row, i) => {
        const msg = row.message || "";
        const shortMsg = msg.slice(0, 60) + (msg.length > 60 ? "…" : "");
        return "<tr data-i=\"" + i + "\"><td>" + new Date(row.createdAt).toLocaleString() + "</td><td>" + (row.type || "") + "</td><td>" + escapeHtml(row.name || "") + "</td><td>" + escapeHtml(row.email || "") + "</td><td class=\"feedback-dashboard-msg\" title=\"" + escapeHtml(msg).replace(/"/g, "&quot;") + "\">" + escapeHtml(shortMsg) + "</td><td>" + formatRatings(row.ratings) + "</td><td><span class=\"feedback-dashboard-expand\" data-i=\"" + i + "\">Details</span></td></tr><tr data-detail=\"" + i + "\" style=\"display:none;\"><td colspan=\"7\"><div class=\"feedback-dashboard-system-info\">" + escapeHtml(JSON.stringify(row.systemInfo || {}, null, 2)) + "</div><div class=\"feedback-dashboard-system-info\" style=\"margin-top:0.5rem;\"><strong>Full message:</strong><br/>" + escapeHtml(msg) + "</div></td></tr>";
      }).join("") +
      "</tbody></table>";
    wrap.querySelectorAll(".feedback-dashboard-expand").forEach((el) => {
      el.addEventListener("click", () => {
        const i = el.dataset.i;
        const detail = wrap.querySelector("tr[data-detail=\"" + i + "\"]");
        detail.style.display = detail.style.display === "none" ? "table-row" : "none";
      });
    });
  };

  document.getElementById("feedback-dashboard-back").addEventListener("click", () => {
    manager.showScreen(SCREENS.MAIN_MENU);
  });

  document.getElementById("feedback-dashboard-load").addEventListener("click", async () => {
    const key = document.getElementById("feedback-dashboard-key").value.trim();
    const base = getFeedbackApiBase();
    const url = key ? base + "/api/feedback?key=" + encodeURIComponent(key) : base + "/api/feedback";
    const errEl = document.getElementById("feedback-dashboard-error");
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401) throw new Error("Invalid or missing key");
        throw new Error(res.statusText || "Load failed");
      }
      manager.feedbackDashboardData = await res.json();
      errEl.style.display = "none";
      errEl.textContent = "";
      renderTable();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = "block";
      manager.feedbackDashboardData = [];
      renderTable();
    }
  });

  document.getElementById("feedback-dashboard-filter").addEventListener("change", () => renderTable());

  document.getElementById("feedback-dashboard-export").addEventListener("click", () => {
    const filterType = document.getElementById("feedback-dashboard-filter").value;
    const list = !filterType ? manager.feedbackDashboardData : manager.feedbackDashboardData.filter((r) => r.type === filterType);
    if (list.length === 0) return;
    const headers = ["createdAt", "type", "name", "email", "message", "gameplay", "performance", "graphics", "overall"];
    const rows = list.map((r) => {
      const ratings = r.ratings || {};
      return [r.createdAt, r.type, r.name || "", r.email || "", (r.message || "").replace(/"/g, '""'), ratings.gameplay ?? "", ratings.performance ?? "", ratings.graphics ?? "", ratings.overall ?? ""].map((c) => "\"" + String(c).replace(/"/g, '""') + "\"").join(",");
    });
    const csv = [headers.join(",")].concat(rows).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "feedback-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  });

  renderTable();

  setTimeout(() => {
    manager.updateFocusableElements();
    const loadIdx = manager.focusableElements.findIndex((el) => el.id === "feedback-dashboard-load");
    if (loadIdx >= 0) {
      manager.focusIndex = loadIdx;
      manager.updateFocus();
    }
  }, 60);
}
