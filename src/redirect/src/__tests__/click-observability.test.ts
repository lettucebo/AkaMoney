import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_ANALYTICS_ERROR_MESSAGE } from '../observability';
import type { ClickRecordingErrorReporter } from '../observability';

type ObserveClickRecording = typeof import('../services').observeClickRecording;

const CONTEXT = { shortCode: 'abc123', urlId: 'url-1' };

let observeClickRecording: ObserveClickRecording;
let nativeConsoleError: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  nativeConsoleError = vi.fn();
  const originalConsoleError = console.error;
  console.error = nativeConsoleError as typeof console.error;

  try {
    ({ observeClickRecording } = await import('../services'));
  } finally {
    console.error = originalConsoleError;
  }
});

describe('background click observability', () => {
  it('writes one native console error and forwards the failure to the reporter', async () => {
    const error = new Error('D1 insert failed');
    const reporter = vi.fn<ClickRecordingErrorReporter>();

    await expect(
      observeClickRecording(Promise.reject(error), CONTEXT, reporter)
    ).resolves.toBeUndefined();

    expect(nativeConsoleError).toHaveBeenCalledTimes(1);
    expect(nativeConsoleError).toHaveBeenCalledWith(BACKGROUND_ANALYTICS_ERROR_MESSAGE, {
      operation: 'recordClick',
      shortCode: 'abc123',
      urlId: 'url-1',
      error,
    });
    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(error, CONTEXT);
  });

  it('still logs once to the native console when no reporter is available', async () => {
    const error = new Error('D1 insert failed');

    await expect(
      observeClickRecording(Promise.reject(error), CONTEXT, undefined)
    ).resolves.toBeUndefined();

    expect(nativeConsoleError).toHaveBeenCalledTimes(1);
  });

  it('swallows a reporter that throws synchronously', async () => {
    const reporter = vi.fn<ClickRecordingErrorReporter>(() => {
      throw new Error('reporter exploded');
    });

    await expect(
      observeClickRecording(Promise.reject(new Error('D1 insert failed')), CONTEXT, reporter)
    ).resolves.toBeUndefined();

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(nativeConsoleError).toHaveBeenCalledTimes(1);
  });

  it('swallows a reporter that returns a rejected promise', async () => {
    const reporter = vi.fn<ClickRecordingErrorReporter>(() =>
      Promise.reject(new Error('reporter rejected'))
    );

    await expect(
      observeClickRecording(Promise.reject(new Error('D1 insert failed')), CONTEXT, reporter)
    ).resolves.toBeUndefined();

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(nativeConsoleError).toHaveBeenCalledTimes(1);
  });

  it('awaits an asynchronous reporter before resolving', async () => {
    let released = false;
    const reporter = vi.fn<ClickRecordingErrorReporter>(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            released = true;
            resolve();
          }, 5);
        })
    );

    await observeClickRecording(Promise.reject(new Error('D1 insert failed')), CONTEXT, reporter);

    expect(released).toBe(true);
  });

  it('does not log or report when click recording succeeds', async () => {
    const reporter = vi.fn<ClickRecordingErrorReporter>();

    await observeClickRecording(Promise.resolve(), CONTEXT, reporter);

    expect(nativeConsoleError).not.toHaveBeenCalled();
    expect(reporter).not.toHaveBeenCalled();
  });
});
