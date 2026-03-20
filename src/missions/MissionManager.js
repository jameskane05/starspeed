import * as THREE from "three";
import { trainingGroundsMission } from "./trainingGroundsMission.js";

const MISSIONS = {
  trainingGrounds: trainingGroundsMission,
};

function cloneObjectives(objectives = []) {
  return objectives.map((objective, index) => ({
    id: objective.id ?? `objective-${index}`,
    text: objective.text ?? "",
    completed: objective.completed === true,
  }));
}

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.gameManager = game.gameManager;
    this.currentMission = null;
    this.currentStep = null;
    this.currentObjectives = [];
    this.runtime = {};
    this.checkpointGroup = null;
    this.checkpoints = [];
    this.activeCheckpointIndex = 0;
    this._dialogCompleteHandler = (dialog) => {
      this.reportEvent("dialogCompleted", {
        id: dialog?.id ?? null,
        dialog,
      });
    };
    this.gameManager.on("dialog:completed", this._dialogCompleteHandler);
  }

  async startMission(missionId, options = {}) {
    const mission = MISSIONS[missionId];
    if (!mission) {
      throw new Error(`Unknown mission: ${missionId}`);
    }

    this.stopMission({ preserveState: true });
    this.currentMission = mission;
    this.runtime = {};

    const missionLevelId = options.levelId ?? mission.defaultLevelId ?? null;
    this.gameManager.setState({
      currentMissionId: mission.id,
      missionLevelId,
      missionStatus: "active",
      missionStepId: null,
      missionStepTitle: "",
      currentObjectives: [],
    });

    if (mission.start) {
      await mission.start(this, options);
    }

    await this.enterStep(mission.startStepId);
  }

  stopMission(options = {}) {
    this.clearCheckpoints();
    this.currentMission = null;
    this.currentStep = null;
    this.currentObjectives = [];
    this.runtime = {};

    if (!options.preserveState) {
      this.gameManager.clearMissionState();
    }
  }

  destroy() {
    this.stopMission({ preserveState: true });
    this.gameManager.off("dialog:completed", this._dialogCompleteHandler);
  }

  isActive() {
    return this.currentMission != null;
  }

  shouldSuppressRespawns() {
    return this.isActive();
  }

  async enterStep(stepId) {
    if (!this.currentMission) return;
    const step = this.currentMission.steps?.[stepId];
    if (!step) {
      throw new Error(`Unknown mission step: ${stepId}`);
    }

    this.clearCheckpoints();
    this.currentStep = step;
    this.currentObjectives = [];
    this.runtime.stepId = stepId;

    this.gameManager.setState({
      missionStepId: stepId,
      missionStepTitle: step.title ?? "",
      currentObjectives: [],
    });

    if (step.enter) {
      await step.enter(this);
    }
  }

  update(delta) {
    if (!this.isActive() || !this.gameManager.isPlaying()) return;
    this.updateCheckpoints();
    this.currentStep?.update?.(this, delta);
  }

  reportEvent(type, payload = {}) {
    if (!this.isActive()) return;
    this.currentStep?.onEvent?.(this, type, payload);
  }

  setObjectives(title, objectives = []) {
    this.currentObjectives = cloneObjectives(objectives);
    this.gameManager.setState({
      missionStepTitle: title ?? "",
      currentObjectives: this.currentObjectives,
    });
  }

  updateObjective(id, patch = {}) {
    const objective = this.currentObjectives.find((entry) => entry.id === id);
    if (!objective) return;
    Object.assign(objective, patch);
    this.gameManager.setState({
      currentObjectives: [...this.currentObjectives],
    });
  }

  completeObjective(id) {
    this.updateObjective(id, { completed: true });
  }

  areObjectivesComplete(ids = null) {
    const relevant = ids
      ? this.currentObjectives.filter((entry) => ids.includes(entry.id))
      : this.currentObjectives;
    return relevant.length > 0 && relevant.every((entry) => entry.completed);
  }

  getPlayerPosition() {
    return this.game.xrManager?.isPresenting
      ? this.game.xrManager.rig.position
      : this.game.camera.position;
  }

  setCheckpointSequence(points, options = {}) {
    this.clearCheckpoints();
    if (!points?.length) return;

    const color = options.color ?? 0x00e8ff;
    const radius = options.radius ?? 5;
    const tube = options.tube ?? 0.45;
    const geometry = new THREE.TorusGeometry(radius, tube, 16, 48);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
    });
    this.checkpointGroup = new THREE.Group();
    this.checkpoints = points.map((point, index) => {
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.position.copy(point);
      mesh.lookAt(this.getPlayerPosition());
      mesh.visible = index === 0;
      this.checkpointGroup.add(mesh);
      return {
        index,
        position: point.clone(),
        radius: options.triggerRadius ?? radius + 1.5,
        mesh,
        reached: false,
      };
    });
    this.activeCheckpointIndex = 0;
    this.game.scene.add(this.checkpointGroup);
  }

  updateCheckpoints() {
    if (!this.checkpoints.length) return;
    const checkpoint = this.checkpoints[this.activeCheckpointIndex];
    if (!checkpoint || checkpoint.reached) return;

    const playerPos = this.getPlayerPosition();
    checkpoint.mesh.lookAt(playerPos);
    if (playerPos.distanceTo(checkpoint.position) > checkpoint.radius) return;

    checkpoint.reached = true;
    checkpoint.mesh.visible = false;
    this.reportEvent("checkpointReached", {
      index: checkpoint.index,
      completed: checkpoint.index + 1,
      total: this.checkpoints.length,
    });

    this.activeCheckpointIndex += 1;
    const nextCheckpoint = this.checkpoints[this.activeCheckpointIndex];
    if (nextCheckpoint) {
      nextCheckpoint.mesh.visible = true;
      return;
    }

    this.reportEvent("checkpointSequenceCompleted", {
      total: this.checkpoints.length,
    });
  }

  clearCheckpoints() {
    if (this.checkpointGroup) {
      this.game.scene.remove(this.checkpointGroup);
      this.checkpointGroup.traverse((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
    }
    this.checkpointGroup = null;
    this.checkpoints = [];
    this.activeCheckpointIndex = 0;
  }

  spawnEnemyWave(positions = []) {
    if (!positions.length) return;
    this.game.enemyRespawnQueue.length = 0;
    for (const position of positions) {
      this.game.spawnAtPoint(position);
    }
  }

  refillMissiles() {
    if (!this.game.player) return;
    this.game.player.missiles = this.game.player.maxMissiles;
    this.game.updateHUD();
  }

  completeMission(message = "TRAINING COMPLETE") {
    this.clearCheckpoints();
    this.currentStep = null;
    this.currentObjectives = this.currentObjectives.map((objective) => ({
      ...objective,
      completed: true,
    }));
    this.gameManager.setState({
      missionStatus: "complete",
      missionStepTitle: "Training Complete",
      currentObjectives: [...this.currentObjectives],
    });
    this.game.showPickupMessage?.(message);
  }
}

export default MissionManager;
