import * as THREE from "three";
import {
  getDialogsForState,
  getDialogById,
} from "../data/dialogData.js";

export class DialogManager {
  constructor(options = {}) {
    this.gameManager = options.gameManager;
    this.lipSyncManager = options.lipSyncManager ?? null;
    this.vrmAvatarRenderer = options.vrmAvatarRenderer ?? null;
    this.captionParent = options.captionParent ?? null;

    this.currentDialog = null;
    this.isPlaying = false;
    this.dialogStartTime = 0;
    this._playbackActive = false;

    this.captions = [];
    this.currentCaptionIndex = -1;
    this.captionMesh = null;
    this.textCanvas = null;
    this.textContext = null;
    this.textTexture = null;

    this.captionOffset = options.captionOffset ?? new THREE.Vector3(0, -0.2, -0.5);
    this.captionScale = options.captionScale ?? 0.3;
    this.fontSize = options.fontSize ?? 36;
    this.fontFamily = options.fontFamily ?? "Arial, sans-serif";
    this.maxWidth = options.maxWidth ?? 600;
    this.padding = options.padding ?? 14;

    this.playedDialogs = new Set();
    this.pendingDialogs = new Map();
    this._stateHandler = null;

    this._waitingForGesture = false;
    this._gestureCleanup = null;
  }

  async initialize() {
    if (!this.gameManager || (!this.lipSyncManager && !this.vrmAvatarRenderer)) return false;
    if (this.captionParent) this._createCaptionPanel();
    this._subscribeToState();
    const state = this.gameManager.getState();
    if (state) this._checkAutoPlayDialogs(state);
    return true;
  }

  _createCaptionPanel() {
    this.textCanvas = document.createElement("canvas");
    this.textCanvas.width = this.maxWidth;
    this.textCanvas.height = 140;
    this.textContext = this.textCanvas.getContext("2d");

    this.textTexture = new THREE.CanvasTexture(this.textCanvas);
    this.textTexture.minFilter = THREE.LinearFilter;
    this.textTexture.magFilter = THREE.LinearFilter;

    const aspect = this.textCanvas.width / this.textCanvas.height;
    const geometry = new THREE.PlaneGeometry(aspect * 0.2, 0.2);
    const material = new THREE.MeshBasicMaterial({
      map: this.textTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.captionMesh = new THREE.Mesh(geometry, material);
    this.captionMesh.scale.set(this.captionScale, this.captionScale, 1);
    this.captionMesh.position.copy(this.captionOffset);
    this.captionMesh.visible = false;
    this.captionMesh.renderOrder = 9999;
    this.captionParent.add(this.captionMesh);
    this._clearCanvas();
  }

  _clearCanvas() {
    if (!this.textContext || !this.textTexture) return;
    this.textContext.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
    this.textTexture.needsUpdate = true;
  }

  _renderCaption(text) {
    if (!this.textContext || !this.textTexture) return;
    const ctx = this.textContext;
    const canvas = this.textCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!text) {
      this.textTexture.needsUpdate = true;
      return;
    }
    ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";
    const maxTextWidth = canvas.width - this.padding * 2;
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    const lineHeight = this.fontSize * 1.25;
    const textHeight = lines.length * lineHeight;
    const textStartY = (canvas.height - textHeight) / 2 + lineHeight / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    for (let i = 0; i < lines.length; i++) {
      const y = textStartY + i * lineHeight;
      ctx.strokeText(lines[i], canvas.width / 2, y);
    }
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < lines.length; i++) {
      const y = textStartY + i * lineHeight;
      ctx.fillText(lines[i], canvas.width / 2, y);
    }
    this.textTexture.needsUpdate = true;
  }

  _findCaptionIndex(currentTimeMs) {
    let cumulativeTime = 0;
    for (let i = 0; i < this.captions.length; i++) {
      const caption = this.captions[i];
      const startTime =
        caption.startTime !== undefined ? caption.startTime * 1000 : cumulativeTime;
      const duration = (caption.duration || 3.0) * 1000;
      const endTime = startTime + duration;
      if (currentTimeMs >= startTime && currentTimeMs < endTime) return i;
      if (caption.startTime === undefined) cumulativeTime += duration;
    }
    return -1;
  }

  _isDialogComplete(currentTimeMs) {
    if (this.captions.length === 0) return true;
    const last = this.captions[this.captions.length - 1];
    const lastEnd = last.startTime !== undefined
      ? (last.startTime + (last.duration || 3.0)) * 1000
      : this.captions.reduce((sum, c) => sum + (c.duration || 3.0) * 1000, 0);
    return currentTimeMs >= lastEnd;
  }

  _subscribeToState() {
    this._stateHandler = (newState, oldState) => {
      const relevant =
        newState?.currentState !== oldState?.currentState ||
        newState?.cockpitIntroPlayed !== oldState?.cockpitIntroPlayed;
      if (relevant) this._checkAutoPlayDialogs(newState);
    };
    this.gameManager.on("state:changed", this._stateHandler);
  }

  _checkAutoPlayDialogs(state) {
    if (this.isPlaying) return;
    const matching = getDialogsForState(state, this.playedDialogs);
    for (const dialog of matching) {
      if (this.currentDialog?.id === dialog.id) continue;
      if (this.pendingDialogs.has(dialog.id)) continue;
      if (dialog.once) this.playedDialogs.add(dialog.id);
      if (dialog.delay && dialog.delay > 0) {
        this.pendingDialogs.set(dialog.id, {
          dialog,
          timer: 0,
          delay: dialog.delay,
        });
      } else {
        this.playDialog(dialog);
      }
      break;
    }
  }

  async playDialog(dialogOrId) {
    const dialog =
      typeof dialogOrId === "string" ? getDialogById(dialogOrId) : dialogOrId;
    if (!dialog) return;

    if (this.isPlaying) this.stop();

    this.currentDialog = dialog;
    this.captions = dialog.captions || [];
    this.currentCaptionIndex = -1;
    this.isPlaying = true;
    this.dialogStartTime = performance.now();

    const faceDataUrl = dialog.faceDataUrl ?? (dialog.audio ? dialog.audio.replace(/\.(mp3|webm)$/i, ".face.json") : null);
    if (dialog.audio && this.vrmAvatarRenderer && faceDataUrl) {
      try {
        if (dialog.requiresGesture) {
          this._waitingForGesture = true;
          const start = () => {
            this._waitingForGesture = false;
            this._gestureCleanup = null;
            this.vrmAvatarRenderer.play(dialog.audio, faceDataUrl);
            this._playbackActive = true;
          };
          this._gestureCleanup = () => {
            document.removeEventListener("click", start);
            document.removeEventListener("keydown", start);
          };
          document.addEventListener("click", start, { once: true });
          document.addEventListener("keydown", start, { once: true });
        } else {
          await this.vrmAvatarRenderer.play(dialog.audio, faceDataUrl);
          this._playbackActive = true;
        }
      } catch (e) {
        this.isPlaying = false;
        this.currentDialog = null;
      }
    } else if (dialog.audio && this.lipSyncManager) {
      try {
        await this.lipSyncManager.loadAudio(dialog.audio);
        if (dialog.requiresGesture) {
          this._waitingForGesture = true;
          const start = () => {
            this._waitingForGesture = false;
            this._gestureCleanup = null;
            this.lipSyncManager.play();
            this._playbackActive = true;
          };
          this._gestureCleanup = () => {
            document.removeEventListener("click", start);
            document.removeEventListener("keydown", start);
          };
          document.addEventListener("click", start, { once: true });
          document.addEventListener("keydown", start, { once: true });
        } else {
          this.lipSyncManager.play();
          this._playbackActive = true;
        }
      } catch (e) {
        this.isPlaying = false;
        this.currentDialog = null;
      }
    } else {
      this._playbackActive = true;
    }
  }

  _updatePlayback() {
    if (!this.isPlaying || !this._playbackActive || this._waitingForGesture)
      return;

    const captionsEnabled = this.gameManager?.getState?.()?.captionsEnabled ?? true;

    let currentTimeMs;
    if (this.vrmAvatarRenderer && this._playbackActive) {
      currentTimeMs = this.vrmAvatarRenderer.getCurrentTime() * 1000;
      if (!this.vrmAvatarRenderer.isPlaying()) {
        this._handleDialogComplete();
        return;
      }
    } else {
      const audio = this.lipSyncManager?.audioElement;
      if (audio) {
        currentTimeMs = audio.currentTime * 1000;
        const reachedEnd = audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration - 0.05);
        if (reachedEnd) {
          this._handleDialogComplete();
          return;
        }
      } else {
        currentTimeMs = performance.now() - this.dialogStartTime;
        if (this._isDialogComplete(currentTimeMs)) {
          this._handleDialogComplete();
          return;
        }
      }
    }

    if (captionsEnabled && this.captions.length > 0 && this.captionMesh) {
      const captionIndex = this._findCaptionIndex(currentTimeMs);
      if (captionIndex !== this.currentCaptionIndex) {
        this.currentCaptionIndex = captionIndex;
        if (captionIndex >= 0 && captionIndex < this.captions.length) {
          this._renderCaption(this.captions[captionIndex].text);
          this.captionMesh.visible = true;
        } else {
          this._clearCanvas();
          this.captionMesh.visible = false;
        }
      }
    } else if (this.captionMesh) {
      this.captionMesh.visible = false;
    }

    if (this.lipSyncManager && !this.vrmAvatarRenderer) this.lipSyncManager.updateAnalysis();
  }

  _handleDialogComplete() {
    const completed = this.currentDialog;
    this.isPlaying = false;
    this._playbackActive = false;
    this.currentDialog = null;
    if (this.vrmAvatarRenderer) this.vrmAvatarRenderer.stop();
    if (this.lipSyncManager) this.lipSyncManager.stop();
    this._clearCanvas();
    if (this.captionMesh) this.captionMesh.visible = false;

    if (completed?.onComplete) completed.onComplete(this.gameManager);
    if (completed?.playNext) {
      const next = getDialogById(completed.playNext);
      if (next) {
        if (next.delay && next.delay > 0) {
          this.pendingDialogs.set(next.id, {
            dialog: next,
            timer: 0,
            delay: next.delay,
          });
        } else {
          this.playDialog(next);
        }
        return;
      }
    }
    const state = this.gameManager.getState();
    if (state) this._checkAutoPlayDialogs(state);
  }

  update(dt) {
    for (const [dialogId, pending] of this.pendingDialogs) {
      pending.timer += dt;
    }
    for (const [dialogId, pending] of this.pendingDialogs) {
      if (pending.timer >= pending.delay) {
        this.pendingDialogs.delete(dialogId);
        this.playDialog(pending.dialog);
        break;
      }
    }
    this._updatePlayback();
  }

  stop() {
    if (this._gestureCleanup) {
      this._gestureCleanup();
      this._gestureCleanup = null;
    }
    this._waitingForGesture = false;
    this.isPlaying = false;
    this._playbackActive = false;
    if (this.vrmAvatarRenderer) this.vrmAvatarRenderer.stop();
    if (this.lipSyncManager) this.lipSyncManager.stop();
    this.currentDialog = null;
    this._clearCanvas();
    if (this.captionMesh) this.captionMesh.visible = false;
  }

  destroy() {
    this.stop();
    if (this._stateHandler) {
      this.gameManager.off("state:changed", this._stateHandler);
      this._stateHandler = null;
    }
    if (this.captionMesh) {
      this.captionMesh.parent?.remove(this.captionMesh);
      this.captionMesh.geometry?.dispose();
      this.captionMesh.material?.dispose();
      this.captionMesh = null;
    }
    if (this.textTexture) {
      this.textTexture.dispose();
      this.textTexture = null;
    }
    this.textCanvas = null;
    this.textContext = null;
  }
}
