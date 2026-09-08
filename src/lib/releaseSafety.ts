export const RELEASE_ID = import.meta.env.VITE_APP_VERSION || 'development';

export function isChunkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .+ failed|Unable to preload CSS|Expected a JavaScript.or.Wasm module script/i.test(message);
}

export function requestUpdateNotice() {
  window.dispatchEvent(new Event('spas:update-needed'));
}

// Always user initiated. Never reload on controllerchange or during a mutation.
export function reloadWhenReady(): void {
  if (document.querySelector('[role="dialog"], [data-unsaved="true"], [aria-busy="true"]')) {
    window.alert('Finish or close the open form before updating. Your current page will stay open.');
    return;
  }
  if (!window.confirm('Saved changes are safe. Finish any unsaved edits or uploads before continuing. Update SPAS 360 now?')) return;
  window.location.reload();
}
