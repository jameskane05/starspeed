/**
 * gameFirstViewLoading.js - LOADING OVERLAY UNTIL FIRST VIEW IS READY
 *
 * Shows a loading overlay from game start until cockpit is loaded and the
 * splat view has enough rendered pages to show the first frame cleanly.
 */

const MIN_DISPLAYED_SPLATS = 50000;
const POLL_INTERVAL_MS = 100;
const MAX_WAIT_MS = 30000;
const COCKPIT_FALLBACK_MS = 5000;
const RAD_URL = /\.(rad|radc)(\?|$)|radc(?:\?|$|\/)/i;

export const radcCounters =
  typeof window !== "undefined" && window.__starspeedRadcCounters
    ? window.__starspeedRadcCounters
    : { requested: 0, completed: 0 };

if (typeof window !== "undefined" && !window.__starspeedRadcCounters) {
  window.__starspeedRadcCounters = radcCounters;
}

let overlayEl = null;
let refreshIntervalId = null;

function getOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.id = "first-view-loading-overlay";
  overlayEl.className = "first-view-loading-overlay";
  overlayEl.innerHTML = `
    <div class="first-view-loading-content">
      <img class="first-view-loading-logo" src="/images/ui/Starspeed_WordMark.png" alt="Starspeed" />
      <div class="first-view-loading-counters" data-counters>
        <span data-pages>Pages Loaded: 0</span>
      </div>
    </div>
  `;
  return overlayEl;
}

function updateOverlayUI() {
  if (!overlayEl || overlayEl.style.display !== "flex") return;
  const pagesEl = overlayEl.querySelector("[data-pages]");
  if (pagesEl) {
    pagesEl.textContent = `Pages Loaded: ${Math.min(radcCounters.completed, radcCounters.requested)}`;
  }
}

function startRefreshLoop() {
  stopRefreshLoop();
  updateOverlayUI();
  refreshIntervalId = setInterval(updateOverlayUI, 200);
}

function stopRefreshLoop() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}

function trackRadRequest(url) {
  if (typeof url !== "string" || !RAD_URL.test(url)) return () => {};
  radcCounters.requested += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    radcCounters.completed += 1;
  };
}

if (typeof window !== "undefined" && !window.__starspeedPatchedRadRequests) {
  window.__starspeedPatchedRadRequests = true;

  const originalFetch = window.fetch?.bind(window);
  if (originalFetch) {
    window.fetch = (...args) => {
      const [input] = args;
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input ?? "");
      const complete = trackRadRequest(url);
      return originalFetch(...args).finally(complete);
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR) {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function (...args) {
      this.__starspeedTrackedUrl = typeof args[1] === "string" ? args[1] : "";
      return originalOpen.apply(this, args);
    };

    OriginalXHR.prototype.send = function (...args) {
      const complete = trackRadRequest(this.__starspeedTrackedUrl);
      this.addEventListener("loadend", complete, { once: true });
      return originalSend.apply(this, args);
    };
  }
}

export function showFirstViewLoading() {
  radcCounters.requested = 0;
  radcCounters.completed = 0;
  const el = getOverlay();
  if (!el.parentNode) document.body.appendChild(el);
  el.style.display = "flex";
  startRefreshLoop();
}

export function hideFirstViewLoading() {
  stopRefreshLoop();
  if (overlayEl) overlayEl.style.display = "none";
}

function getNumSplats(game) {
  return game?.sparkRenderer?.display?.numSplats ?? 0;
}

export function waitForFirstViewReady(game) {
  return new Promise((resolve) => {
    const start = Date.now();

    function poll() {
      if (!game.player) {
        setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }

      const cockpitReady = game.player.cockpit != null;
      const cockpitFallback = Date.now() - start >= COCKPIT_FALLBACK_MS;
      const effectiveCockpitReady = cockpitReady || cockpitFallback;

      const numSplats = getNumSplats(game);
      const elapsed = Date.now() - start;
      const splatsReady = numSplats >= MIN_DISPLAYED_SPLATS;
      const timeout = elapsed >= MAX_WAIT_MS;

      if (effectiveCockpitReady && (splatsReady || timeout)) {
        resolve();
        return;
      }

      if (!effectiveCockpitReady && game.player.cockpitLoaded) {
        game.player.cockpitLoaded.finally(() => setTimeout(poll, 0));
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
  });
}
