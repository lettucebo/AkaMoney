import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAuthRedirectFuse,
  clearSessionExpiry,
  markSessionExpired,
  readSessionExpiry,
  recordAuthRedirect
} from '../sessionExpiry';

afterEach(() => {
  sessionStorage.clear();
});

describe('session expiry persistence', () => {
  it('returns null when nothing has been marked', () => {
    expect(readSessionExpiry()).toBeNull();
  });

  it('persists and reads back each typed reason', () => {
    for (const reason of [
      'interaction-required',
      'unauthorized',
      'initialization-failed',
      'loop-detected'
    ] as const) {
      markSessionExpired(reason);
      expect(readSessionExpiry()).toBe(reason);
    }
  });

  it('ignores an unrecognized persisted value instead of throwing', () => {
    sessionStorage.setItem('akamoney_session_expiry_reason', 'not-a-real-reason');
    expect(readSessionExpiry()).toBeNull();
  });

  it('clears the persisted reason', () => {
    markSessionExpired('unauthorized');
    clearSessionExpiry();
    expect(readSessionExpiry()).toBeNull();
  });

  it('clearing expiry also clears fuse state', () => {
    recordAuthRedirect(1_000);
    recordAuthRedirect(1_500);
    clearSessionExpiry();

    // A fresh fuse allows two redirects again immediately after clearing.
    expect(recordAuthRedirect(1_600).allowed).toBe(true);
    expect(recordAuthRedirect(1_700).allowed).toBe(true);
  });
});

describe('auth redirect fuse', () => {
  it('allows the first two redirects inside a 10 second window', () => {
    expect(recordAuthRedirect(0).allowed).toBe(true);
    expect(recordAuthRedirect(1_000).allowed).toBe(true);
  });

  it('reports loop-detected on the third redirect inside the window', () => {
    recordAuthRedirect(0);
    recordAuthRedirect(1_000);
    const third = recordAuthRedirect(2_000);

    expect(third.allowed).toBe(false);
    expect(third.loopDetected).toBe(true);
  });

  it('keeps reporting loop-detected for further redirects inside the same window', () => {
    recordAuthRedirect(0);
    recordAuthRedirect(1_000);
    recordAuthRedirect(2_000);

    expect(recordAuthRedirect(3_000).allowed).toBe(false);
  });

  it('allows a redirect again once the window has fully elapsed', () => {
    recordAuthRedirect(0);
    recordAuthRedirect(1_000);
    recordAuthRedirect(2_000);

    // 10s after the earliest counted redirect, that one has aged out.
    expect(recordAuthRedirect(10_001).allowed).toBe(true);
  });

  it('does not increment for a call exactly at the boundary of the window', () => {
    recordAuthRedirect(0);
    recordAuthRedirect(1_000);

    // Still within the 10 second window measured from t=0.
    expect(recordAuthRedirect(9_999).allowed).toBe(false);
  });

  it('clearAuthRedirectFuse resets the window independently of session expiry', () => {
    recordAuthRedirect(0);
    recordAuthRedirect(1_000);
    clearAuthRedirectFuse();

    expect(recordAuthRedirect(1_100).allowed).toBe(true);
  });

  it('persists fuse state across separate calls via sessionStorage', () => {
    recordAuthRedirect(0);
    // Reading the raw persisted value confirms storage - not just in-memory state - backs the fuse.
    expect(sessionStorage.getItem('akamoney_auth_redirect_fuse')).not.toBeNull();
  });
});
