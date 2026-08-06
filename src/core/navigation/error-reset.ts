type ResetCallback = () => void;

const resetCallbacks = new Set<ResetCallback>();

export function registerAppReset(callback: ResetCallback): () => void {
  resetCallbacks.add(callback);
  return () => {
    resetCallbacks.delete(callback);
  };
}

export function requestInAppReset(): boolean {
  if (resetCallbacks.size === 0) return false;
  for (const callback of [...resetCallbacks]) {
    callback();
  }
  return true;
}

export function hasAppResetHandlers(): boolean {
  return resetCallbacks.size > 0;
}
