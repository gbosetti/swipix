/**
 * Tracks which screen's async work is the app's one active foreground
 * process — SwipeScreen's own scan, or CategoryPickerScreen's preview
 * refresh, never both. Beginning a session anywhere supersedes whatever
 * was previously current, wherever it was started; a superseded session's
 * `isCurrent()` flips to `false` for good.
 *
 * @remarks
 * A single module-level counter, not one scoped per screen: two
 * independently-scoped tokens can't tell each other apart, which is
 * exactly the gap that let an abandoned Big Pictures scan starve a
 * freshly-opened Swipe tab even after per-item cancellation was added
 * (confirmed on a real device). Deliberately doesn't reach into
 * PhotoLibraryService's concurrency pool itself — callers decide what
 * "no longer current" means for their own work (SwipeScreen hard-cancels
 * its own undispatched native calls via `isCancelled`; CategoryPicker-
 * Screen only drops a stale preview's `setState`, since a background
 * preview finishing late is still a useful thumbnail worth keeping).
 */

let currentToken = 0;

export interface ForegroundSession {
  isCurrent(): boolean;
  end(): void;
}

export function beginForegroundSession(): ForegroundSession {
  const token = ++currentToken;
  return {
    isCurrent: () => token === currentToken,
    end: () => {
      if (token === currentToken) currentToken++;
    },
  };
}
