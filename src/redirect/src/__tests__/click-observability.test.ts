import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeClickRecording } from '../services';

describe('background click observability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs rejected click recording once with operation context and resolves', async () => {
    const error = new Error('D1 insert failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      observeClickRecording(Promise.reject(error), {
        shortCode: 'abc123',
        urlId: 'url-1',
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Redirect background analytics failed',
      {
        operation: 'recordClick',
        shortCode: 'abc123',
        urlId: 'url-1',
        error,
      }
    );
  });

  it('does not log when click recording succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await observeClickRecording(Promise.resolve(), {
      shortCode: 'abc123',
      urlId: 'url-1',
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
