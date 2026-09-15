import { getCurrentScope, onScopeDispose } from 'vue';

export interface DebouncedCallback<TArgs extends unknown[]> {
  (...args: TArgs): void;
  /** Drops a pending invocation without running it. */
  cancel: () => void;
  /** Runs a pending invocation immediately, if one is scheduled. */
  flush: () => void;
}

/**
 * Debounces a callback and ties its timer to the owning effect scope.
 *
 * `cancel` matters as much as the debounce itself: when the route changes from
 * outside the component (browser back/forward), a search keystroke that is
 * still pending must not fire afterwards and navigate the user away from the
 * entry they just returned to.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number
): DebouncedCallback<TArgs> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: TArgs | null = null;

  const cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingArgs = null;
  };

  const flush = (): void => {
    if (timeoutId === null || pendingArgs === null) {
      return;
    }
    const args = pendingArgs;
    cancel();
    callback(...args);
  };

  const debounced = ((...args: TArgs): void => {
    pendingArgs = args;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      pendingArgs = null;
      callback(...args);
    }, delay);
  }) as DebouncedCallback<TArgs>;

  debounced.cancel = cancel;
  debounced.flush = flush;

  // Guarded so the helper is also usable outside a component/effect scope.
  if (getCurrentScope()) {
    onScopeDispose(cancel);
  }

  return debounced;
}
