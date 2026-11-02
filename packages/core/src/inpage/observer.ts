/**
 * One MutationObserver for the whole in-page script.
 *
 * Instagram re-renders constantly, so observing is unavoidable — but per-module
 * observers (or an unthrottled callback) will burn a phone battery. Mutations
 * are coalesced and the callback runs at most every `minInterval` ms, on an
 * idle slot where the browser offers one.
 */

export type Observer = {
  start: () => void;
  stop: () => void;
  /** Force a run (route changes call this). */
  flush: () => void;
  dispose: () => void;
};

export type ObserverDeps = {
  win: Window;
  onMutate: () => void;
  minInterval?: number;
};

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function createObserver(deps: ObserverDeps): Observer {
  const { win } = deps;
  const doc = win.document;
  const minInterval = deps.minInterval ?? 150;
  const idle = win as IdleWindow;

  let observer: MutationObserver | null = null;
  let scheduled = false;
  let lastRun = 0;
  let timeout: number | undefined;
  let idleHandle: number | undefined;
  let disposed = false;

  function run(): void {
    if (disposed) return;
    scheduled = false;
    lastRun = Date.now();
    deps.onMutate();
  }

  function schedule(): void {
    if (disposed || scheduled) return;
    scheduled = true;
    const wait = Math.max(0, minInterval - (Date.now() - lastRun));
    if (wait === 0 && typeof idle.requestIdleCallback === 'function') {
      idleHandle = idle.requestIdleCallback(() => run(), { timeout: minInterval });
      return;
    }
    timeout = win.setTimeout(run, wait);
  }

  function start(): void {
    if (disposed || observer) return;
    const created = new MutationObserver((mutations: MutationRecord[]) => {
      // Ignore our own attribute writes, which would otherwise loop forever.
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          const name = mutation.attributeName ?? '';
          if (name.startsWith('data-di-')) continue;
        }
        schedule();
        return;
      }
    });
    observer = created;
    created.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false,
    });
  }

  function stop(): void {
    observer?.disconnect();
    observer = null;
  }

  return {
    start,
    stop,
    flush: () => {
      if (timeout !== undefined) win.clearTimeout(timeout);
      if (idleHandle !== undefined && typeof idle.cancelIdleCallback === 'function') {
        idle.cancelIdleCallback(idleHandle);
      }
      run();
    },
    dispose: () => {
      disposed = true;
      stop();
      if (timeout !== undefined) win.clearTimeout(timeout);
      if (idleHandle !== undefined && typeof idle.cancelIdleCallback === 'function') {
        idle.cancelIdleCallback(idleHandle);
      }
    },
  };
}
