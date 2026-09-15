import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useDebouncedCallback } from '../useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not invoke the callback before the delay elapses', () => {
    const spy = vi.fn();
    const debounced = useDebouncedCallback(spy, 300);

    debounced('a');
    vi.advanceTimersByTime(299);

    expect(spy).not.toHaveBeenCalled();
  });

  it('invokes the callback once the delay elapses', () => {
    const spy = vi.fn();
    const debounced = useDebouncedCallback(spy, 300);

    debounced('a');
    vi.advanceTimersByTime(300);

    expect(spy).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('collapses rapid calls into a single invocation with the latest arguments', () => {
    const spy = vi.fn();
    const debounced = useDebouncedCallback(spy, 300);

    debounced('a');
    vi.advanceTimersByTime(100);
    debounced('ab');
    vi.advanceTimersByTime(100);
    debounced('abc');
    vi.advanceTimersByTime(300);

    expect(spy).toHaveBeenCalledExactlyOnceWith('abc');
  });

  it('cancel drops a pending invocation', () => {
    const spy = vi.fn();
    const debounced = useDebouncedCallback(spy, 300);

    debounced('a');
    debounced.cancel();
    vi.advanceTimersByTime(1000);

    expect(spy).not.toHaveBeenCalled();
  });

  it('cancel is safe when nothing is pending', () => {
    const spy = vi.fn();
    const debounced = useDebouncedCallback(spy, 300);

    expect(() => debounced.cancel()).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('flush runs a pending invocation immediately and only once', () => {
    const spy = vi.fn();
    const debounced = useDebouncedCallback(spy, 300);

    debounced('a');
    debounced.flush();
    vi.advanceTimersByTime(1000);

    expect(spy).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('flush is a no-op when nothing is pending', () => {
    const spy = vi.fn();
    const debounced = useDebouncedCallback(spy, 300);

    debounced.flush();

    expect(spy).not.toHaveBeenCalled();
  });

  it('cancels a pending invocation when the owning scope is disposed', () => {
    const spy = vi.fn();
    const scope = effectScope();
    let debounced!: (value: string) => void;
    scope.run(() => {
      debounced = useDebouncedCallback(spy, 300);
    });

    debounced('a');
    scope.stop();
    vi.advanceTimersByTime(1000);

    expect(spy).not.toHaveBeenCalled();
  });

  it('works outside an effect scope without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = vi.fn();

    const debounced = useDebouncedCallback(spy, 10);
    debounced('a');
    vi.advanceTimersByTime(10);

    expect(spy).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });
});
