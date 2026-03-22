import * as THREE from "three";
import { trainingGroundsMission } from "./trainingGroundsMission.js";
import { beginSpawnWarp } from "../vfx/spawnWarp.js";

const MISSIONS = {
  trainingGrounds: trainingGroundsMission,
};

function createCheckpointVisual(
  radius,
  tube,
  color = 0x00e8ff,
  accent = 0x8affff,
) {
  const group = new THREE.Group();

  const ringMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.6,
    metalness: 0.35,
    roughness: 0.28,
    transparent: true,
    opacity: 0.9,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 4.2,
    metalness: 0.15,
    roughness: 0.2,
    transparent: true,
    opacity: 0.95,
  });
  const greebleMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d2c34,
    emissive: color,
    emissiveIntensity: 1.2,
    metalness: 0.75,
    roughness: 0.35,
  });

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 20, 72),
    ringMaterial,
  );
  group.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.72, tube * 0.32, 16, 56),
    accentMaterial.clone(),
  );
  innerRing.rotation.y = Math.PI / 2;
  group.add(innerRing);

  const arcGeometry = new THREE.TorusGeometry(radius * 1.12, tube * 0.16, 12, 48, 1.55);

  const arcPivotA = new THREE.Group();
  const arcA = new THREE.Mesh(arcGeometry, accentMaterial.clone());
  arcA.rotation.z = 0.45;
  arcPivotA.add(arcA);
  group.add(arcPivotA);

  const arcPivotB = new THREE.Group();
  const arcB = new THREE.Mesh(arcGeometry, accentMaterial.clone());
  arcB.rotation.z = Math.PI + 0.85;
  arcB.rotation.y = Math.PI / 2;
  arcPivotB.add(arcB);
  group.add(arcPivotB);

  const nodeGeometry = new THREE.BoxGeometry(tube * 1.4, tube * 1.4, tube * 3.6);
  const strutGeometry = new THREE.BoxGeometry(tube * 0.42, tube * 0.42, radius * 0.58);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const node = new THREE.Mesh(nodeGeometry, greebleMaterial.clone());
    node.position.set(
      Math.cos(angle) * radius * 0.92,
      Math.sin(angle) * radius * 0.92,
      0,
    );
    node.lookAt(0, 0, 0);
    group.add(node);

    const strut = new THREE.Mesh(strutGeometry, greebleMaterial.clone());
    strut.position.set(
      Math.cos(angle) * radius * 0.56,
      Math.sin(angle) * radius * 0.56,
      0,
    );
    strut.lookAt(0, 0, 0);
    strut.rotateX(Math.PI / 2);
    group.add(strut);
  }

  const coreGeometry = new THREE.CircleGeometry(radius * 0.18, 6);
  const core = new THREE.Mesh(coreGeometry, accentMaterial.clone());
  group.add(core);

  group.userData.arcPivotA = arcPivotA;
  group.userData.arcPivotB = arcPivotB;
  group.userData.innerRing = innerRing;
  group.userData.pulseMaterial = outerRing.material;

  return group;
}

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
    this.updateCheckpoints(delta);
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
    this.checkpointGroup = new THREE.Group();
    this.checkpoints = points.map((point, index) => {
      const mesh = createCheckpointVisual(
        radius,
        tube,
        color,
        options.accentColor ?? 0x8affff,
      );
      mesh.position.copy(point);
      mesh.lookAt(this.getPlayerPosition());
      mesh.visible = index === 0;
      this.checkpointGroup.add(mesh);
      return {
        index,
        position: point.clone(),
        radius: options.triggerRadius ?? radius + 1.5,
        mesh,
        spawnWarp: null,
        reached: false,
      };
    });
    this.activeCheckpointIndex = 0;
    this.game.directionalHelperTarget = {
      type: "checkpoint",
      getWorldPosition: (out) => {
        const checkpoint = this.checkpoints[this.activeCheckpointIndex];
        if (!checkpoint || checkpoint.reached || !checkpoint.mesh?.visible) {
          return null;
        }
        return out.copy(checkpoint.position);
      },
    };
    this.game.scene.add(this.checkpointGroup);
    this._activateCheckpoint(this.checkpoints[0]);
  }

  updateCheckpoints(delta = 0) {
    if (!this.checkpoints.length) return;
    const elapsed = this.game.clock?.getElapsedTime?.() ?? performance.now() / 1000;
    for (const checkpointEntry of this.checkpoints) {
      const mesh = checkpointEntry.mesh;
      checkpointEntry.spawnWarp?.update(delta);
      if (!mesh?.visible) continue;
      mesh.userData.arcPivotA.rotation.z += delta * 0.9;
      mesh.userData.arcPivotB.rotation.z -= delta * 1.35;
      mesh.userData.innerRing.rotation.z -= delta * 0.75;
      mesh.rotation.z = Math.sin(elapsed * 1.8 + checkpointEntry.index * 0.7) * 0.08;
      const pulse = 0.78 + (Math.sin(elapsed * 3.4 + checkpointEntry.index) + 1) * 0.12;
      if (mesh.userData.pulseMaterial) {
        mesh.userData.pulseMaterial.emissiveIntensity = 2.2 + pulse * 1.4;
        mesh.userData.pulseMaterial.opacity = 0.82 + pulse * 0.08;
      }
    }

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
      this._activateCheckpoint(nextCheckpoint);
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
    if (this.game.directionalHelperTarget?.type === "checkpoint") {
      this.game.directionalHelperTarget = null;
    }
  }

  _activateCheckpoint(checkpoint) {
    if (!checkpoint?.mesh) return;
    checkpoint.mesh.visible = true;
    checkpoint.spawnWarp?.dispose?.();
    checkpoint.spawnWarp = beginSpawnWarp(checkpoint.mesh, {
      duration: 2.2,
      color: 0x8affff,
    });
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
