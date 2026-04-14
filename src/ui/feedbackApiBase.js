import NetworkManager from "../network/NetworkManager.js";

export function getFeedbackApiBase() {
  const base = (NetworkManager.serverUrl || "")
    .replace(/^ws:/, "http:")
    .replace(/^wss:/, "https:");
  return base || window.location.origin;
}
