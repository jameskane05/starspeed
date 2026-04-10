import * as THREE from "three";
import { checkCriteria } from "../data/sceneData.js";
import { getLevelTriggerBindings } from "../data/levelTriggerData.js";

const _local = new THREE.Vector3();

function pointInTriggerVolume(worldPos, volume) {
  if (
    !volume?.inverseWorld ||
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
    this._insideBindingIds = new Set();
  }

  resetSession() {
    this._triggeredOnce.clear();
    this._insideBindingIds.clear();
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
    }

    const volumes = this.game._levelTriggerVolumes;
    if (!volumes?.length || this._bindingsByObjectName.size === 0) return;

    const worldPos =
      this.game.xrManager?.isPresenting && this.game.xrManager.rig
        ? this.game.xrManager.rig.position
        : this.game.camera?.position;
    if (!worldPos) return;

    const nextInside = new Set();

    for (const vol of volumes) {
      if (!pointInTriggerVolume(worldPos, vol)) continue;
      const bindings = this._bindingsByObjectName.get(vol.objectName);
      if (!bindings?.length) continue;

      for (const binding of bindings) {
        if (!binding.criteria || checkCriteria(state, binding.criteria)) {
          nextInside.add(binding.id);
        }
      }
    }

    for (const bindingId of nextInside) {
      if (this._insideBindingIds.has(bindingId)) continue;

      const binding = this._findBindingById(bindingId);
      if (!binding) continue;

      if (binding.once && this._triggeredOnce.has(bindingId)) continue;

      this._fireEnter(binding);
      if (binding.once) {
        this._triggeredOnce.add(bindingId);
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

  _fireEnter(binding) {
    const gm = this.game.gameManager;
    const payload = {
      bindingId: binding.id,
      objectName: binding.objectName,
    };
    const on = binding.onEnter;

    if (on?.setState && typeof on.setState === "object") {
      gm.setState(on.setState);
    }
    if (on?.playDialog && this.game.dialogManager?.playDialog) {
      this.game.dialogManager.playDialog(on.playDialog);
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
