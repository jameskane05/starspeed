export default class LoadingProgressManager {
  constructor() {
    this.loadingTasks = new Map();
    this.onProgress = null;
    this.onComplete = null;
    this.isComplete = false;
  }

  reset({ onProgress, onComplete } = {}) {
    this.loadingTasks.clear();
    this.isComplete = false;

    if (onProgress !== undefined) {
      this.onProgress = onProgress;
    }
    if (onComplete !== undefined) {
      this.onComplete = onComplete;
    }

    this._notify();
  }

  setCallbacks({ onProgress, onComplete } = {}) {
    if (onProgress !== undefined) {
      this.onProgress = onProgress;
    }
    if (onComplete !== undefined) {
      this.onComplete = onComplete;
    }

    this._notify();
  }

  clearCallbacks() {
    this.onProgress = null;
    this.onComplete = null;
  }

  getTaskCount() {
    return this.loadingTasks.size;
  }

  registerTask(taskName) {
    if (!taskName || this.loadingTasks.has(taskName)) return;
    this.loadingTasks.set(taskName, { progress: 0 });
    this._notify();
  }

  updateTask(taskName, progress) {
    if (!taskName) return;

    if (!this.loadingTasks.has(taskName)) {
      this.loadingTasks.set(taskName, { progress: 0 });
    }

    const task = this.loadingTasks.get(taskName);
    task.progress = Math.max(0, Math.min(1, progress));
    this._notify();
  }

  completeTask(taskName) {
    this.updateTask(taskName, 1);
  }

  getProgress() {
    if (this.loadingTasks.size === 0) {
      return 0;
    }

    let totalProgress = 0;
    for (const task of this.loadingTasks.values()) {
      totalProgress += task.progress;
    }

    return totalProgress / this.loadingTasks.size;
  }

  isLoadingComplete() {
    if (this.loadingTasks.size === 0) {
      return false;
    }

    for (const task of this.loadingTasks.values()) {
      if (task.progress < 1) {
        return false;
      }
    }

    return true;
  }

  _notify() {
    const progress = this.getProgress();
    this.onProgress?.(progress);

    if (this.isLoadingComplete()) {
      if (!this.isComplete) {
        this.isComplete = true;
        this.onComplete?.();
      }
      return;
    }

    this.isComplete = false;
  }
}
