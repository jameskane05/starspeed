import * as THREE from "three";
import NetworkManager from "../network/NetworkManager.js";

export function showDamageIndicator(game, hitWorldPos) {
  const camPos = game.camera.position.clone();
  const camDir = new THREE.Vector3();
  game.camera.getWorldDirection(camDir);

  const toHit = hitWorldPos.clone().sub(camPos).normalize();

  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  camRight.crossVectors(camDir, game.camera.up).normalize();
  camUp.crossVectors(camRight, camDir).normalize();

  const dotRight = toHit.dot(camRight);
  const dotUp = toHit.dot(camUp);
  const dotForward = toHit.dot(camDir);

  const indicators = [];
  const threshold = 0.3;

  if (dotForward < 0.5) {
    if (dotRight > threshold) indicators.push("right");
    if (dotRight < -threshold) indicators.push("left");
    if (dotUp > threshold) indicators.push("top");
    if (dotUp < -threshold) indicators.push("bottom");
  }

  indicators.push("center");

  indicators.forEach((dir) => {
    const el = document.querySelector(`.damage-indicator-${dir}`);
    if (el) {
      el.classList.remove("fading");
      el.classList.add("active");

      setTimeout(() => {
        el.classList.remove("active");
        el.classList.add("fading");
      }, 80);

      setTimeout(() => {
        el.classList.remove("fading");
      }, 450);
    }
  });
}

export function handleLocalPlayerDeath(game) {
  if (game.player?.cockpit) game.player.cockpit.visible = false;

  const overlay = document.getElementById("respawn-overlay");
  overlay.classList.add("active");

  let timeLeft = 5;
  const timerEl = document.getElementById("respawn-time");
  timerEl.textContent = timeLeft;

  const interval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(interval);
    }
  }, 1000);
}

export function startSoloRespawn(game) {
  game._soloRespawning = true;
  if (game.player?.cockpit) game.player.cockpit.visible = false;

  const overlay = document.getElementById("respawn-overlay");
  overlay.classList.add("active");

  let timeLeft = 3;
  const timerEl = document.getElementById("respawn-time");
  timerEl.textContent = timeLeft;

  const interval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(interval);
      finishSoloRespawn(game);
    }
  }, 1000);
}

export function finishSoloRespawn(game) {
  const overlay = document.getElementById("respawn-overlay");
  overlay.classList.remove("active");

  game.player.health = game.player.maxHealth;
  game.player.missiles = game.player.maxMissiles;
  game.player.lastDamageTime = 0;

  if (game.playerSpawnPoints?.length > 0) {
    const sp =
      game.playerSpawnPoints[
        Math.floor(Math.random() * game.playerSpawnPoints.length)
      ];
    game.camera.position.copy(sp);
  } else {
    game.camera.position.set(0, 0, 0);
  }
  game.camera.quaternion.setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -Math.PI / 2,
  );

  game._hudLast.health = null;
  game._hudLast.missiles = null;
  game._soloRespawning = false;
  if (game.player?.cockpit) game.player.cockpit.visible = true;
}

export function handleLocalPlayerRespawn(game) {
  const overlay = document.getElementById("respawn-overlay");
  overlay.classList.remove("active");
  if (game.player?.cockpit) game.player.cockpit.visible = true;

  const localPlayer = NetworkManager.getLocalPlayer();
  if (localPlayer && game.player) {
    game.player.health = localPlayer.health;
    game.player.maxHealth = localPlayer.maxHealth;
    game.player.missiles = localPlayer.missiles;
    game.player.boostFuel = localPlayer.boostFuel ?? game.player.maxBoostFuel;
    game.player.maxBoostFuel =
      localPlayer.maxBoostFuel ?? game.player.maxBoostFuel;
    game.player.lastDamageTime = 0;
    game.camera.position.set(localPlayer.x, localPlayer.y, localPlayer.z);
    game.camera.quaternion.set(
      localPlayer.qx,
      localPlayer.qy,
      localPlayer.qz,
      localPlayer.qw,
    );

    game._hudLast.health = null;
    game._hudLast.missiles = null;
  }
}

export function showKillFeed(game, killer, victim) {
  const feed = document.getElementById("kill-feed");
  const entry = document.createElement("div");
  entry.className = "kill-entry";
  entry.innerHTML = `<span class="killer">${killer}</span> → <span class="victim">${victim}</span>`;
  feed.appendChild(entry);

  setTimeout(() => entry.remove(), 5000);
}
