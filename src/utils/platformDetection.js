/**
 * Detects platform capabilities (mobile, iOS, Safari, fullscreen support)
 * and sets corresponding flags in gameManager state via setState().
 *
 * Usage: Call detectPlatform(gameManager) early in initialization.
 * Other systems check gameState.isIOS, gameState.isMobile, etc.
 */
export function detectPlatform(gameManager) {
  if (!gameManager) return;

  const isMobile =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const userAgent = navigator.userAgent.toLowerCase();
  const isSafari =
    (userAgent.includes("safari") &&
      !userAgent.includes("chrome") &&
      !userAgent.includes("chromium") &&
      !userAgent.includes("edge")) ||
    (navigator.vendor?.indexOf("Apple") > -1 &&
      !userAgent.includes("chrome") &&
      !userAgent.includes("chromium"));

  const isFullscreenSupported =
    !isIOS &&
    (document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.mozFullScreenEnabled ||
      document.msFullscreenEnabled);

  gameManager.setState({
    isMobile,
    isIOS,
    isSafari,
    isFullscreenSupported,
  });

  return { isMobile, isIOS, isSafari, isFullscreenSupported };
}
