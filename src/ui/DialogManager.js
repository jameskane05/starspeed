import * as THREE from "three";
import { getDialogsForState, getDialogById } from "../data/dialogData.js";

export class DialogManager {
  constructor(options = {}) {
    this.gameManager = options.gameManager;
    this.lipSyncManager = options.lipSyncManager ?? null;
    this.defaultSpeakerId = options.defaultSpeakerId ?? "alcair";
    this.vrmAvatarRenderer = options.vrmAvatarRenderer ?? null;
    this.speakerRenderers = options.speakerRenderers ?? null;
    if (!this.speakerRenderers && this.vrmAvatarRenderer) {
      this.speakerRenderers = {
        [this.defaultSpeakerId]: this.vrmAvatarRenderer,
      };
    }
    this.onSpeakerChanged = options.onSpeakerChanged ?? null;
    this.captionParent = options.captionParent ?? null;

    this.currentDialog = null;
    this.isPlaying = false;
    this.dialogStartTime = 0;
    this._playbackActive = false;
    this._audioPlaybackRenderer = null;
    this.activeSpeakerId = this.defaultSpeakerId;
    this.activeSpeakerRenderer = this._getSpeakerRenderer(
      this.defaultSpeakerId,
    );

    this.captions = [];
    this.currentCaptionIndex = -1;
    this.captionMesh = null;
    this.textCanvas = null;
    this.textContext = null;
    this.textTexture = null;

    this.captionOffset =
      options.captionOffset?.clone?.() ??
      options.captionOffset ??
      this._getResponsiveCaptionOffset();
    this.captionScale = options.captionScale ?? 0.3;
    this.fontSize = options.fontSize ?? 36;
    this.fontFamily = options.fontFamily ?? "Arial, sans-serif";
    this.maxWidth = options.maxWidth ?? 600;
    this.padding = options.padding ?? 14;
    this.captionTargetLines = options.captionTargetLines ?? 2;
    this.captionMaxLines = options.captionMaxLines ?? 3;
    this.minCaptionDuration = options.minCaptionDuration ?? 0.9;
    this.baseCanvasHeight = options.baseCanvasHeight ?? 140;
    this.basePanelHeight = options.basePanelHeight ?? 0.2;
    this.captionRenderLayer = options.captionRenderLayer ?? 31;

    this.playedDialogs = new Set();
    this.pendingDialogs = new Map();
    this.activeAutoplayDialogs = new Set();
    this._stateHandler = null;

    this._waitingForGesture = false;
    this._gestureCleanup = null;
    this._captionUsesResponsiveOffset = options.captionOffset == null;
    this._viewportResizeHandler = null;
  }

  async initialize() {
    if (
      !this.gameManager ||
      (!this.lipSyncManager &&
        !this.vrmAvatarRenderer &&
        !this.speakerRenderers)
    ) {
      return false;
    }
    if (this.captionParent) this._createCaptionPanel();
    this._subscribeToState();
    const state = this.gameManager.getState();
    if (state) this._checkAutoPlayDialogs(state);
    this._bindViewportResize();
    return true;
  }

  _isMobilePortrait() {
    if (typeof window === "undefined") return false;
    const width = window.visualViewport?.width ?? window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    return width <= 1050 && height > width;
  }

  _getResponsiveCaptionOffset() {
    return this._isMobilePortrait()
      ? new THREE.Vector3(0, -0.145, -0.42)
      : new THREE.Vector3(0, -0.2, -0.5);
  }

  _applyCaptionOffset() {
    if (!this._captionUsesResponsiveOffset) return;
    this.captionOffset.copy(this._getResponsiveCaptionOffset());
    this.captionMesh?.position.copy(this.captionOffset);
  }

  _bindViewportResize() {
    if (!this._captionUsesResponsiveOffset || typeof window === "undefined")
      return;
    if (this._viewportResizeHandler) return;
    this._viewportResizeHandler = () => this._applyCaptionOffset();
    window.addEventListener("resize", this._viewportResizeHandler);
    window.visualViewport?.addEventListener(
      "resize",
      this._viewportResizeHandler,
    );
  }

  _createCaptionPanel() {
    this.textCanvas = document.createElement("canvas");
    this.textCanvas.width = this.maxWidth;
    this.textCanvas.height = this._getCanvasHeight();
    this.textContext = this.textCanvas.getContext("2d");

    this.textTexture = new THREE.CanvasTexture(this.textCanvas);
    this.textTexture.minFilter = THREE.LinearFilter;
    this.textTexture.magFilter = THREE.LinearFilter;

    const panelHeight =
      this.basePanelHeight * (this.textCanvas.height / this.baseCanvasHeight);
    const panelWidth =
      panelHeight * (this.textCanvas.width / this.textCanvas.height);
    const geometry = new THREE.PlaneGeometry(panelWidth, panelHeight);
    const material = new THREE.MeshBasicMaterial({
      map: this.textTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.captionMesh = new THREE.Mesh(geometry, material);
    this.captionMesh.scale.set(this.captionScale, this.captionScale, 1);
    this.captionMesh.position.copy(this.captionOffset);
    this.captionMesh.visible = false;
    this.captionMesh.renderOrder = 9999;
    this.captionMesh.layers.set(this.captionRenderLayer);
    this.captionParent.add(this.captionMesh);
    this._applyCaptionOffset();
    this._clearCanvas();
  }

  _getLineHeight() {
    return this.fontSize * 1.25;
  }

  _getSpeakerRenderer(speakerId = this.defaultSpeakerId) {
    if (this.speakerRenderers instanceof Map) {
      return (
        this.speakerRenderers.get(speakerId) ??
        this.speakerRenderers.get(this.defaultSpeakerId) ??
        this.vrmAvatarRenderer ??
        null
      );
    }
    if (this.speakerRenderers) {
      return (
        this.speakerRenderers[speakerId] ??
        this.speakerRenderers[this.defaultSpeakerId] ??
        this.vrmAvatarRenderer ??
        null
      );
    }
    return this.vrmAvatarRenderer ?? null;
  }

  _getSpeakerId(caption = null) {
    return caption?.speakerId ?? this.defaultSpeakerId;
  }

  _forEachSpeakerRenderer(callback) {
    const seen = new Set();
    const renderers =
      this.speakerRenderers instanceof Map
        ? this.speakerRenderers.values()
        : Object.values(this.speakerRenderers ?? {});
    for (const renderer of renderers) {
      if (!renderer || seen.has(renderer)) continue;
      seen.add(renderer);
      callback(renderer);
    }
    if (this.vrmAvatarRenderer && !seen.has(this.vrmAvatarRenderer)) {
      callback(this.vrmAvatarRenderer);
    }
  }

  _setActiveSpeaker(speakerId = this.defaultSpeakerId) {
    const nextRenderer = this._getSpeakerRenderer(speakerId);
    if (
      this.activeSpeakerId === speakerId &&
      this.activeSpeakerRenderer === nextRenderer
    ) {
      return nextRenderer;
    }

    if (
      this.activeSpeakerRenderer &&
      this.activeSpeakerRenderer !== nextRenderer &&
      this.activeSpeakerRenderer !== this._audioPlaybackRenderer
    ) {
      this.activeSpeakerRenderer.stop?.();
    }

    this.activeSpeakerId = speakerId;
    this.activeSpeakerRenderer = nextRenderer;
    this.onSpeakerChanged?.(speakerId, nextRenderer);
    return nextRenderer;
  }

  _resetActiveSpeaker() {
    this._setActiveSpeaker(this.defaultSpeakerId);
  }

  _getCanvasHeight() {
    return Math.ceil(
      this.padding * 2 + this._getLineHeight() * this.captionMaxLines + 24,
    );
  }

  _clearCanvas() {
    if (!this.textContext || !this.textTexture) return;
    this.textContext.clearRect(
      0,
      0,
      this.textCanvas.width,
      this.textCanvas.height,
    );
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
    const lines = this._wrapCaptionText(text);
    const lineHeight = this._getLineHeight();
    const textHeight = lines.length * lineHeight;
    const textStartY = Math.max(
      this.padding + lineHeight / 2,
      (canvas.height - textHeight) / 2 + lineHeight / 2,
    );
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

  _wrapCaptionText(text) {
    if (!this.textContext) return [text];
    const ctx = this.textContext;
    ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;

    const maxTextWidth = this.textCanvas.width - this.padding * 2;
    const paragraphs = String(text ?? "").split("\n");
    const lines = [];

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) {
        lines.push("");
        continue;
      }

      const words = trimmed.split(/\s+/);
      let currentLine = "";

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
    }

    return lines.length > 0 ? lines : [""];
  }

  _splitCaptionIntoChunks(caption) {
    const wrappedLines = this._wrapCaptionText(caption.text);
    if (wrappedLines.length <= this.captionTargetLines) {
      return [{ ...caption, text: caption.text }];
    }

    const groupedTexts = [];
    for (let i = 0; i < wrappedLines.length; i += this.captionTargetLines) {
      groupedTexts.push(
        wrappedLines.slice(i, i + this.captionTargetLines).join("\n"),
      );
    }

    const totalDuration = caption.duration || 3.0;
    const minimumDuration = Math.min(
      this.minCaptionDuration,
      totalDuration / groupedTexts.length,
    );
    const reservedDuration = minimumDuration * groupedTexts.length;
    const distributableDuration = Math.max(0, totalDuration - reservedDuration);
    const weights = groupedTexts.map(
      (text) => text.replace(/\s+/g, "").length || 1,
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

    let elapsed = 0;
    return groupedTexts.map((text, index) => {
      const isLast = index === groupedTexts.length - 1;
      const duration = isLast
        ? totalDuration - elapsed
        : minimumDuration +
          distributableDuration * (weights[index] / totalWeight);
      const chunk = {
        ...caption,
        text,
        duration,
      };

      if (caption.startTime !== undefined) {
        chunk.startTime = caption.startTime + elapsed;
      } else {
        delete chunk.startTime;
      }

      elapsed += duration;
      return chunk;
    });
  }

  _normalizeCaptions(captions = []) {
    if (!this.textContext) return captions;
    const normalized = [];
    for (const caption of captions) {
      normalized.push(...this._splitCaptionIntoChunks(caption));
    }
    return normalized;
  }

  _findCaptionIndex(currentTimeMs) {
    let cumulativeTime = 0;
    for (let i = 0; i < this.captions.length; i++) {
      const caption = this.captions[i];
      const startTime =
        caption.startTime !== undefined
          ? caption.startTime * 1000
          : cumulativeTime;
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
    const lastEnd =
      last.startTime !== undefined
        ? (last.startTime + (last.duration || 3.0)) * 1000
        : this.captions.reduce((sum, c) => sum + (c.duration || 3.0) * 1000, 0);
    return currentTimeMs >= lastEnd;
  }

  _getDialogDurationSeconds(dialog = this.currentDialog) {
    const captions = dialog?.captions || [];
    if (captions.length === 0) return 0;
    const last = captions[captions.length - 1];
    if (last.startTime !== undefined) {
      return last.startTime + (last.duration || 3.0);
    }
    return captions.reduce(
      (sum, caption) => sum + (caption.duration || 3.0),
      0,
    );
  }

  _subscribeToState() {
    this._stateHandler = (newState, oldState) => {
      if (newState !== oldState) this._checkAutoPlayDialogs(newState);
    };
    this.gameManager.on("state:changed", this._stateHandler);
  }

  _checkAutoPlayDialogs(state) {
    if (this.isPlaying) return;
    const matching = getDialogsForState(state, this.playedDialogs);
    const matchingIds = new Set(matching.map((dialog) => dialog.id));

    for (const dialogId of this.activeAutoplayDialogs) {
      if (!matchingIds.has(dialogId)) {
        this.activeAutoplayDialogs.delete(dialogId);
      }
    }

    for (const dialog of matching) {
      if (this.currentDialog?.id === dialog.id) continue;
      if (this.pendingDialogs.has(dialog.id)) continue;
      if (this.activeAutoplayDialogs.has(dialog.id)) continue;
      if (dialog.once) this.playedDialogs.add(dialog.id);
      this.activeAutoplayDialogs.add(dialog.id);
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
    this.captions = this._normalizeCaptions(dialog.captions || []);
    this.currentCaptionIndex = -1;
    this.isPlaying = true;
    this.dialogStartTime = performance.now();
    this._audioPlaybackRenderer = null;

    const faceDataUrl =
      dialog.faceDataUrl ??
      (dialog.audio
        ? dialog.audio.replace(/\.(mp3|webm)$/i, ".face.json")
        : null);
    const dialogSpeakerId =
      dialog.speakerId ?? this._getSpeakerId(this.captions[0]);
    const playbackRenderer = this._setActiveSpeaker(dialogSpeakerId);
    if (dialog.audio && playbackRenderer && faceDataUrl) {
      this._audioPlaybackRenderer = playbackRenderer;
      try {
        if (dialog.requiresGesture) {
          this._waitingForGesture = true;
          const start = () => {
            this._waitingForGesture = false;
            this._gestureCleanup = null;
            playbackRenderer.play(dialog.audio, faceDataUrl);
            this._playbackActive = true;
          };
          this._gestureCleanup = () => {
            document.removeEventListener("click", start);
            document.removeEventListener("keydown", start);
          };
          document.addEventListener("click", start, { once: true });
          document.addEventListener("keydown", start, { once: true });
        } else {
          await playbackRenderer.play(dialog.audio, faceDataUrl);
          this._playbackActive = true;
        }
      } catch (e) {
        this.isPlaying = false;
        this.currentDialog = null;
        this._audioPlaybackRenderer = null;
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
      const placeholderDuration = this._getDialogDurationSeconds(dialog);
      if (dialog.placeholderAnimation !== false) {
        playbackRenderer?.playPlaceholder?.(
          this.captions[0]?.duration || placeholderDuration,
        );
        this.lipSyncManager?.playPlaceholder?.(placeholderDuration);
      }
      this._playbackActive = true;
    }
  }

  _updatePlayback() {
    if (!this.isPlaying || !this._playbackActive || this._waitingForGesture)
      return;

    const captionsEnabled =
      this.gameManager?.getState?.()?.captionsEnabled ?? true;

    let currentTimeMs;
    if (
      this._audioPlaybackRenderer &&
      this._playbackActive &&
      this.currentDialog?.audio
    ) {
      currentTimeMs = this._audioPlaybackRenderer.getCurrentTime() * 1000;
      if (!this._audioPlaybackRenderer.isPlaying()) {
        this._handleDialogComplete();
        return;
      }
    } else {
      const audio = this.lipSyncManager?.audioElement;
      if (audio) {
        currentTimeMs = audio.currentTime * 1000;
        const reachedEnd =
          audio.ended ||
          (audio.duration > 0 && audio.currentTime >= audio.duration - 0.05);
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

    const captionIndex =
      this.captions.length > 0 ? this._findCaptionIndex(currentTimeMs) : -1;
    if (captionIndex !== this.currentCaptionIndex) {
      this.currentCaptionIndex = captionIndex;
      if (captionIndex >= 0 && captionIndex < this.captions.length) {
        const activeCaption = this.captions[captionIndex];
        const speakerRenderer = this._setActiveSpeaker(
          this._getSpeakerId(activeCaption),
        );
        if (
          !this.currentDialog?.audio &&
          this.currentDialog?.placeholderAnimation !== false
        ) {
          speakerRenderer?.playPlaceholder?.(activeCaption.duration || 3.0);
        }
      }
    }

    if (captionsEnabled && this.captions.length > 0 && this.captionMesh) {
      if (captionIndex >= 0 && captionIndex < this.captions.length) {
        this._renderCaption(this.captions[captionIndex].text);
        this.captionMesh.visible = true;
      } else {
        this._clearCanvas();
        this.captionMesh.visible = false;
      }
    } else if (this.captionMesh) {
      this.captionMesh.visible = false;
    }

    if (this.lipSyncManager && !this.vrmAvatarRenderer)
      this.lipSyncManager.updateAnalysis();
  }

  _handleDialogComplete() {
    const completed = this.currentDialog;
    this.isPlaying = false;
    this._playbackActive = false;
    this.currentDialog = null;
    this.currentCaptionIndex = -1;
    this._forEachSpeakerRenderer((renderer) => renderer.stop?.());
    this._audioPlaybackRenderer = null;
    this._resetActiveSpeaker();
    if (this.lipSyncManager) this.lipSyncManager.stop();
    this._clearCanvas();
    if (this.captionMesh) this.captionMesh.visible = false;

    if (completed?.onComplete) completed.onComplete(this.gameManager);
    this.gameManager?.emit?.("dialog:completed", completed);
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
    this.currentCaptionIndex = -1;
    this._forEachSpeakerRenderer((renderer) => renderer.stop?.());
    this._audioPlaybackRenderer = null;
    this._resetActiveSpeaker();
    if (this.lipSyncManager) this.lipSyncManager.stop();
    this.currentDialog = null;
    this._clearCanvas();
    if (this.captionMesh) this.captionMesh.visible = false;
  }

  destroy() {
    this.stop();
    if (this._viewportResizeHandler) {
      window.removeEventListener("resize", this._viewportResizeHandler);
      window.visualViewport?.removeEventListener(
        "resize",
        this._viewportResizeHandler,
      );
      this._viewportResizeHandler = null;
    }
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
