/**
 * Persisted, typed reasons a previously authenticated session stopped being
 * valid. `sessionStorage` (not `localStorage`) is used deliberately: the
 * marker should not silently outlive the tab that observed the failure.
 */
export type SessionExpiryReason =
  | 'interaction-required'
  | 'unauthorized'
  | 'initialization-failed'
  | 'loop-detected';

const EXPIRY_REASON_KEY = 'akamoney_session_expiry_reason';
const FUSE_KEY = 'akamoney_auth_redirect_fuse';

/** At most this many actual auth redirects are allowed inside {@link FUSE_WINDOW_MS}. */
const FUSE_MAX_REDIRECTS = 2;
const FUSE_WINDOW_MS = 10_000;

const SESSION_EXPIRY_REASONS: ReadonlySet<string> = new Set<SessionExpiryReason>([
  'interaction-required',
  'unauthorized',
  'initialization-failed',
  'loop-detected'
]);

const isSessionExpiryReason = (value: unknown): value is SessionExpiryReason =>
  typeof value === 'string' && SESSION_EXPIRY_REASONS.has(value);

/** All storage access is best-effort: private browsing or quota errors must not break auth flows. */
const readStorage = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Best effort: a failed write only means the fuse/expiry cannot be
    // persisted, not that auth handling should throw.
  }
};

const removeStorage = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};

/**
 * Monotonic, in-memory counter bumped every time the session's valid/invalid
 * state changes (an expiry is marked, or a session is confirmed/re-cleared).
 * Callers that span an `await` - notably a silent token acquisition - can
 * capture this before awaiting and compare it after: a mismatch means some
 * other in-flight work (a concurrent 401, or a newer successful login)
 * already changed which session is current, so the awaited result is stale
 * and must not be applied (neither restoring a token nor invalidating a
 * session it no longer corresponds to).
 */
let sessionGeneration = 0;

/** Current session generation. See {@link sessionGeneration}. */
export function getSessionGeneration(): number {
  return sessionGeneration;
}

/** Marks the current session as expired for the given reason. */
export function markSessionExpired(reason: SessionExpiryReason): void {
  writeStorage(EXPIRY_REASON_KEY, reason);
  sessionGeneration += 1;
}

/** Reads the persisted expiry reason, or `null` when no valid marker exists. */
export function readSessionExpiry(): SessionExpiryReason | null {
  const value = readStorage(EXPIRY_REASON_KEY);
  return isSessionExpiryReason(value) ? value : null;
}

/**
 * Clears the persisted expiry marker and the redirect fuse together: a
 * session that is valid again must not carry over stale loop-detection state.
 */
export function clearSessionExpiry(): void {
  removeStorage(EXPIRY_REASON_KEY);
  clearAuthRedirectFuse();
  sessionGeneration += 1;
}

interface FuseState {
  readonly timestamps: number[];
}

const readFuseState = (): FuseState => {
  const raw = readStorage(FUSE_KEY);
  if (!raw) {
    return { timestamps: [] };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const timestamps = (parsed as { timestamps?: unknown })?.timestamps;
    if (Array.isArray(timestamps) && timestamps.every((value) => typeof value === 'number')) {
      return { timestamps };
    }
  } catch {
    // fall through to an empty state below
  }

  return { timestamps: [] };
};

const writeFuseState = (state: FuseState): void => {
  writeStorage(FUSE_KEY, JSON.stringify(state));
};

/** Resets the redirect fuse window without touching the expiry reason. */
export function clearAuthRedirectFuse(): void {
  removeStorage(FUSE_KEY);
}

export interface AuthRedirectFuseResult {
  /** Whether this call may proceed with an actual auth redirect. */
  readonly allowed: boolean;
  /** True once the fuse has been exhausted for the current window. */
  readonly loopDetected: boolean;
}

/**
 * Records one attempted auth redirect and reports whether it may proceed.
 *
 * Only genuine redirect attempts should call this - concurrent API failures
 * that are coalesced into a single transition (see the API interceptor) must
 * call it at most once, so unrelated simultaneous failures never inflate the
 * count independently.
 */
export function recordAuthRedirect(now: number = Date.now()): AuthRedirectFuseResult {
  const state = readFuseState();
  const withinWindow = state.timestamps.filter((timestamp) => now - timestamp < FUSE_WINDOW_MS);

  if (withinWindow.length >= FUSE_MAX_REDIRECTS) {
    writeFuseState({ timestamps: withinWindow });
    return { allowed: false, loopDetected: true };
  }

  withinWindow.push(now);
  writeFuseState({ timestamps: withinWindow });
  return { allowed: true, loopDetected: false };
}
