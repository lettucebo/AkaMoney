import { describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND_ANALYTICS_ERROR_MESSAGE,
  BACKGROUND_CLICK_RECORDING_OPERATION,
  BACKGROUND_OPERATION_TAG_KEY,
  CLICK_RECORDING_OPERATION_NAME,
  MAX_REPORTED_ERROR_MESSAGE_LENGTH,
  toBoundedErrorMessage,
  toErrorName,
} from '../observability';

async function importObservabilityWithConsoleError(consoleError: (...args: unknown[]) => void) {
  vi.resetModules();
  const originalConsoleError = console.error;
  console.error = consoleError as typeof console.error;

  try {
    return await import('../observability');
  } finally {
    console.error = originalConsoleError;
  }
}

describe('background observability primitives', () => {
  it('binds the console error function that existed at module evaluation', async () => {
    const nativeConsoleError = vi.fn();
    const observability = await importObservabilityWithConsoleError(nativeConsoleError);

    const lateConsoleError = vi.fn();
    const originalConsoleError = console.error;
    console.error = lateConsoleError as typeof console.error;

    try {
      observability.nativeConsoleError('boom', { shortCode: 'abc123' });
    } finally {
      console.error = originalConsoleError;
    }

    expect(nativeConsoleError).toHaveBeenCalledTimes(1);
    expect(nativeConsoleError).toHaveBeenCalledWith('boom', { shortCode: 'abc123' });
    expect(lateConsoleError).not.toHaveBeenCalled();
  });

  it('exposes stable identifiers for background click recording reports', () => {
    expect(BACKGROUND_ANALYTICS_ERROR_MESSAGE).toBe('Redirect background analytics failed');
    expect(BACKGROUND_OPERATION_TAG_KEY).toBe('background_operation');
    expect(BACKGROUND_CLICK_RECORDING_OPERATION).toBe('redirect.click_recording');
    expect(CLICK_RECORDING_OPERATION_NAME).toBe('recordClick');
  });

  it('derives the error name from Error instances and falls back for unknown throwables', () => {
    expect(toErrorName(new TypeError('bad'))).toBe('TypeError');
    expect(toErrorName(new Error('bad'))).toBe('Error');
    expect(toErrorName('a string failure')).toBe('UnknownError');
    expect(toErrorName({ secret: 'value' })).toBe('UnknownError');
  });

  it('bounds the reported error message and never serializes non-error payloads', () => {
    const longMessage = 'x'.repeat(MAX_REPORTED_ERROR_MESSAGE_LENGTH + 50);

    expect(toBoundedErrorMessage(new Error('D1 insert failed'))).toBe('D1 insert failed');
    expect(toBoundedErrorMessage(longMessage)).toBe(
      `${'x'.repeat(MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`
    );
    expect(toBoundedErrorMessage(new Error(longMessage))).toBe(
      `${'x'.repeat(MAX_REPORTED_ERROR_MESSAGE_LENGTH)}...`
    );
    expect(toBoundedErrorMessage({ authorization: 'Bearer secret' })).toBe('');
    expect(toBoundedErrorMessage(undefined)).toBe('');
  });
});
