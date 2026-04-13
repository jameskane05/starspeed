import * as THREE from "three";
import { checkCriteria } from "../data/sceneData.js";
import { getLevelTriggerBindings } from "../data/levelTriggerData.js";

const _local = new THREE.Vector3();

/** Baked trigger volumes with no levelTriggerData binding (handled elsewhere). */
const LEVEL_TRIGGER_UNBOUND_OK = {
  charon: new Set(["Trigger.007"]),
};

/** @param {string|{ desktop?: string, mobile?: string }|null|undefined} playDialog */
function resolvePlatformDialogId(playDialog, gameManager) {
  if (playDialog == null) return null;
  if (typeof playDialog === "string") return playDialog;
  if (typeof playDialog !== "object") return null;
  const mobile = gameManager?.getState?.()?.isMobile === true;
  const hasDesktop = Object.prototype.hasOwnProperty.call(playDialog, "desktop");
  const hasMobile = Object.prototype.hasOwnProperty.call(playDialog, "mobile");
  if (hasDesktop || hasMobile) {
    if (mobile) {
      return hasMobile ? playDialog.mobile ?? null : null;
    }
    return hasDesktop ? playDialog.desktop ?? null : null;
  }
  return playDialog.desktop || playDialog.mobile || null;
}

function copyTriggerVolumeWorldCenterTo(out, volume) {
  if (!volume?.worldMin || !volume?.worldMax) return false;
  const a = volume.worldMin;
  const b = volume.worldMax;
  out.set(
    (a.x + b.x) * 0.5,
    (a.y + b.y) * 0.5,
    (a.z + b.z) * 0.5,
  );
  return true;
}

function pointInTriggerVolume(worldPos, volume) {
  if (!volume) return false;

  if (volume.worldMin && volume.worldMax) {
    const { worldMin: a, worldMax: b } = volume;
    return (
      worldPos.x >= a.x &&
      worldPos.x <= b.x &&
      worldPos.y >= a.y &&
      worldPos.y <= b.y &&
      worldPos.z >= a.z &&
      worldPos.z <= b.z
    );
  }

  if (
    !volume.inverseWorld ||
    volume.min == null ||
    volume.max == null
  ) {
    return false;
  }
  _local.copy(worldPos).applyMatrix4(volume.inverseWorld);
  return (
    _local.x >= volume.min.x &&
    _local.x <= volume.max.x &&
    _local.y >= volume.min.y &&
    _local.y <= volume.max.y &&
    _local.z >= volume.min.z &&
    _local.z <= volume.max.z
  );
}

export class LevelTriggerManager {
  constructor(game) {
    this.game = game;
    this._bindingsByObjectName = new Map();
    this._lastLevelId = null;
    this._triggeredOnce = new Set();
    this._insideBindingIds = new Map();
    this._warnedMissingBinding = new Set();
    this._criteriaWarned = new Set();
    this._disabledTriggerObjectNames = new Set();
  }

  resetSession() {
    this._triggeredOnce.clear();
    this._insideBindingIds.clear();
    this._warnedMissingBinding.clear();
    this._criteriaWarned.clear();
    this._disabledTriggerObjectNames.clear();
    if (this.game) this.game._lastTriggerRespawnWorldPos = null;
  }

  _rebuildBindings(levelId) {
    this._bindingsByObjectName.clear();
    const list = getLevelTriggerBindings(levelId);
    for (const b of list) {
      const name = b.objectName;
      if (!name) continue;
      if (!this._bindingsByObjectName.has(name)) {
        this._bindingsByObjectName.set(name, []);
      }
      this._bindingsByObjectName.get(name).push(b);
    }
  }

  update() {
    const gm = this.game.gameManager;
    if (!gm?.isPlaying?.()) return;

    const state = gm.getState();
    const levelId = state.currentLevel;
    if (levelId !== this._lastLevelId) {
      this._lastLevelId = levelId;
      this.resetSession();
      this._rebuildBindings(levelId);
      const vols = this.game._levelTriggerVolumes;
      const volNames =
        vols?.map((v) => v.objectName).join(", ") || "(none)";
      const bindNames =
        [...this._bindingsByObjectName.keys()].join(", ") || "(none)";
      console.log(
        `[LevelTrigger] level="${levelId}" volumes=${vols?.length ?? 0} names=[${volNames}] binding objectNames=[${bindNames}]`,
      );
      if (!vols?.length) {
        console.warn(
          "[LevelTrigger] No levelTriggerVolumes on game — GLB may lack Trigger meshes or extractSpawnPoints ran before level loaded.",
        );
      }
      if (this._bindingsByObjectName.size === 0) {
        console.warn(
          `[LevelTrigger] No trigger bindings for level "${levelId}" (see levelTriggerData.js).`,
        );
      }
    }

    const volumes = this.game._levelTriggerVolumes;
    if (!volumes?.length || this._bindingsByObjectName.size === 0) return;

    const worldPos =
      this.game.xrManager?.isPresenting && this.game.xrManager.rig
        ? this.game.xrManager.rig.position
        : this.game.camera?.position;
    if (!worldPos) return;

    if (levelId === "charon" && (state.charonReactorCoreDestroyed === true || state.charonEscapeActive === true)) {
      this._insideBindingIds = new Map();
      return;
    }

    const nextInside = new Map();

    for (const vol of volumes) {
      if (this._disabledTriggerObjectNames.has(vol.objectName)) continue;
      if (!pointInTriggerVolume(worldPos, vol)) continue;
      const bindings = this._bindingsByObjectName.get(vol.objectName);
      if (!bindings?.length) {
        const allowUnbound =
          LEVEL_TRIGGER_UNBOUND_OK[levelId]?.has(vol.objectName) === true;
        if (!allowUnbound) {
          const key = `${levelId}:${vol.objectName}`;
          if (!this._warnedMissingBinding.has(key)) {
            this._warnedMissingBinding.add(key);
            const bound = [...this._bindingsByObjectName.keys()].join(", ");
            console.warn(
              `[LevelTrigger] Player inside volume "${vol.objectName}" but no binding uses that exact objectName. Bound keys: [${bound}]`,
            );
          }
        }
        continue;
      }

      for (const binding of bindings) {
        if (!binding.criteria || checkCriteria(state, binding.criteria)) {
          if (!nextInside.has(binding.id)) {
            nextInside.set(binding.id, vol);
          }
        } else if (!this._criteriaWarned.has(binding.id)) {
          this._criteriaWarned.add(binding.id);
          console.warn(
            `[LevelTrigger] Inside "${vol.objectName}" but criteria failed for binding "${binding.id}".`,
            {
              criteria: binding.criteria,
              currentMissionId: state.currentMissionId,
              currentState: state.currentState,
              missionStepId: state.missionStepId,
            },
          );
        }
      }
    }

    for (const [bindingId, vol] of nextInside) {
      if (this._insideBindingIds.has(bindingId)) continue;

      const binding = this._findBindingById(bindingId);
      if (!binding) continue;

      if (binding.once && this._triggeredOnce.has(bindingId)) continue;

      this._fireEnter(binding, vol);
      if (binding.once) {
        this._triggeredOnce.add(bindingId);
        if (binding.objectName) {
          this._disabledTriggerObjectNames.add(binding.objectName);
        }
      }
    }

    this._insideBindingIds = nextInside;
  }

  _findBindingById(id) {
    for (const arr of this._bindingsByObjectName.values()) {
      const b = arr.find((x) => x.id === id);
      if (b) return b;
    }
    return null;
  }

  _fireEnter(binding, volume = null) {
    const gm = this.game.gameManager;
    if (volume && this.game) {
      if (!this.game._lastTriggerRespawnWorldPos) {
        this.game._lastTriggerRespawnWorldPos = new THREE.Vector3();
      }
      copyTriggerVolumeWorldCenterTo(this.game._lastTriggerRespawnWorldPos, volume);
    }

    const payload = {
      bindingId: binding.id,
      objectName: binding.objectName,
    };
    const on = binding.onEnter;
    const dialogId = resolvePlatformDialogId(on?.playDialog, gm);

    console.log("[LevelTrigger] enter", {
      bindingId: binding.id,
      objectName: binding.objectName,
      playDialog: dialogId,
      emitMissionEvent: on?.emitMissionEvent ?? null,
      hasDialogManager: Boolean(this.game.dialogManager?.playDialog),
    });

    if (on?.setState && typeof on.setState === "object") {
      gm.setState(on.setState);
    }
    if (dialogId && this.game.dialogManager?.playDialog) {
      this.game.dialogManager.playDialog(dialogId);
    }
    if (on?.emitMissionEvent) {
      const missionPayload = {
        ...payload,
        ...(on.missionPayload && typeof on.missionPayload === "object"
          ? on.missionPayload
          : {}),
      };
      this.game.missionManager?.reportEvent?.(
        on.emitMissionEvent,
        missionPayload,
      );
    }

    gm.emit("levelTrigger:enter", payload);
  }
}
