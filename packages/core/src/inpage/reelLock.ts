/**
 * Reel / post lock (docs/02-architecture.md §7).
 *
 * The product promise is "watch the reel a friend sent you, but the next one
 * does not exist". That needs four independent mechanisms, because each one
 * alone has a hole:
 *
 *   1. URL pin       — the guard rejects any other reel/post id (routes.ts)
 *   2. slide hiding  — non-active slides get display:none, so there is nothing
 *                      to scroll to and nothing to autoplay
 *   3. gesture       — vertical touchmove/wheel is cancelled while pinned;
 *                      horizontal swipes still pass so carousels work
 *   4. keyboard      — desktop arrow/j/k/space shortcuts are swallowed unless
 *                      the user is typing in the reply box
 *
 * Nothing here reads message content or touches credentials.
 */

import type { Layout } from '../routes.js';
import type { SelectorResolver } from './selector.js';

const ACTIVE_ATTR = 'data-di-slide-active';
const HIDDEN_ATTR = 'data-di-slide-hidden';
const LOCK_ATTR = 'data-di-reel-locked';

export type ReelLock = {
  arm: (id: string) => void;
  disarm: () => void;
  pinned: () => string | null;
  /** Re-scan the DOM; call after every mutation batch and route change. */
  tick: () => void;
  dispose: () => void;
};

export type ReelLockDeps = {
  win: Window;
  resolver: SelectorResolver;
  layout: () => Layout;
  onChange?: (pinId: string | null) => void;
};

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true;
}

export function installReelLock(deps: ReelLockDeps): ReelLock {
  const { win, resolver } = deps;
  const doc = win.document;

  let pin: string | null = null;
  let disposed = false;
  let touchStartX = 0;
  let touchStartY = 0;

  /** The reel we are locking, and its scroller, resolved on every tick. */
  let activeSurface: Element | null = null;
  let scroller: Element | null = null;

  /**
   * Videos we set `loop` on, with the value Instagram had before. Restoring is
   * not cosmetic politeness: leaving `loop = true` behind means the player we
   * touched never fires `ended` again, on any later page that shows it.
   */
  const looped = new Map<HTMLVideoElement, boolean>();

  function applyLoop(video: HTMLVideoElement): void {
    if (!looped.has(video)) looped.set(video, video.loop);
    if (!video.loop) video.loop = true;
  }

  function restoreLoop(video: HTMLVideoElement): void {
    const original = looped.get(video);
    if (original === undefined) return;
    video.loop = original;
    looped.delete(video);
  }

  function restoreAllLoops(): void {
    for (const [video, original] of looped) video.loop = original;
    looped.clear();
  }

  function allSlides(): HTMLElement[] {
    const articles = Array.from(doc.querySelectorAll('article')).filter(
      (el) => el.querySelector('video') !== null,
    ) as HTMLElement[];
    if (articles.length > 0) return articles;

    return resolver.all(doc, 'reelSlide').filter((el): el is HTMLElement => el instanceof HTMLElement);
  }

  function pickActive(list: HTMLElement[]): HTMLElement | null {
    if (list.length === 0) return null;
    const marked = list.find((el) => el.getAttribute(ACTIVE_ATTR) === 'true');
    if (marked) return marked;

    const playing = list.find((el) =>
      Array.from(el.querySelectorAll('video')).some(
        (video) => !video.paused && !video.ended && video.readyState > 0,
      ),
    );
    if (playing) return playing;

    const vh = win.innerHeight || 844;
    let best: HTMLElement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const el of list) {
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) continue;
      const score = Math.abs(rect.top + rect.height / 2 - vh / 2);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best ?? list[0] ?? null;
  }

  /**
   * The reel's scroll container, if one of the candidates wraps the active
   * slide. Resolved through the candidate list directly rather than
   * `resolver.all` so a miss does not fill the selector-failure ring buffer on
   * every mutation batch.
   */
  function findScroller(active: HTMLElement | null): Element | null {
    if (!active) return null;
    for (const selector of resolver.candidates('reelScroller')) {
      try {
        const found = Array.from(doc.querySelectorAll(selector)).find((el) => el.contains(active));
        if (found) return found;
      } catch {
        /* invalid selector from a remote config: skip */
      }
    }
    return null;
  }

  function tick(): void {
    if (disposed) return;
    const root = doc.documentElement;
    if (!pin) {
      root.removeAttribute(LOCK_ATTR);
      activeSurface = null;
      scroller = null;
      restoreAllLoops();
      for (const el of allSlides()) {
        el.removeAttribute(ACTIVE_ATTR);
        el.removeAttribute(HIDDEN_ATTR);
      }
      return;
    }

    root.setAttribute(LOCK_ATTR, pin);
    const slides = allSlides();
    if (slides.length === 0) {
      activeSurface = null;
      scroller = null;
      return;
    }
    const active = pickActive(slides);
    activeSurface = active;
    scroller = findScroller(active);

    for (const el of slides) {
      if (el === active) {
        el.setAttribute(ACTIVE_ATTR, 'true');
        el.removeAttribute(HIDDEN_ATTR);
        // Loop instead of advancing: Instagram's "next" is normally triggered
        // by the `ended` event, so looping removes the trigger entirely.
        for (const video of Array.from(el.querySelectorAll('video'))) applyLoop(video);
      } else {
        el.removeAttribute(ACTIVE_ATTR);
        el.setAttribute(HIDDEN_ATTR, 'true');
        for (const video of Array.from(el.querySelectorAll('video'))) restoreLoop(video);
      }
    }

    // Desktop arrows/chevrons if they survive the CSS pass.
    for (const key of ['reelNext', 'reelPrev'] as const) {
      for (const el of resolver.all(doc, key)) {
        (el as HTMLElement).setAttribute(HIDDEN_ATTR, 'true');
      }
    }
  }

  /**
   * Did this gesture start on the reel we locked?
   *
   * The listeners are on the document because the reel can be re-rendered at
   * any moment, but cancelling *every* vertical gesture also froze the comment
   * sheet, the caption and whatever the thread behind the modal was scrolling.
   * So we cancel inside the locked slide (and its scroller) and leave the rest
   * of the page alone. If the selectors fail and no surface is resolved we fall
   * back to the old, wider net — the gesture layer may never become a bypass.
   */
  function insideLock(target: EventTarget | null): boolean {
    if (!activeSurface) return true;
    const node = target as Node | null;
    if (!node || typeof (node as Element).nodeType !== 'number') return false;
    const el = (node as Element).nodeType === 1 ? (node as Element) : node.parentElement;
    if (!el) return false;
    if (activeSurface.contains(el)) return true;
    return scroller !== null && scroller.contains(el);
  }

  function onTouchStart(event: TouchEvent): void {
    if (!pin) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }

  function onTouchMove(event: TouchEvent): void {
    if (!pin) return;
    if (!insideLock(event.target)) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dy = touch.clientY - touchStartY;
    const dx = touch.clientX - touchStartX;
    // Vertical intent only: horizontal carousel swipes must keep working.
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onWheel(event: WheelEvent): void {
    if (!pin) return;
    if (!insideLock(event.target)) return;
    if (isEditable(event.target as Element | null)) return;
    const target = event.target as Element | null;
    if (target && target.closest('textarea, input, [contenteditable="true"]')) return;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  const BLOCKED_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'PageUp',
    'PageDown',
    'Home',
    'End',
    'j',
    'k',
    ' ',
  ]);

  function onKeyDown(event: KeyboardEvent): void {
    if (!pin) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditable(event.target as Element | null)) return;
    if (!BLOCKED_KEYS.has(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  const touchOptions: AddEventListenerOptions = { capture: true, passive: false };
  const wheelOptions: AddEventListenerOptions = { capture: true, passive: false };

  doc.addEventListener('touchstart', onTouchStart, touchOptions);
  doc.addEventListener('touchmove', onTouchMove, touchOptions);
  doc.addEventListener('wheel', onWheel, wheelOptions);
  doc.addEventListener('keydown', onKeyDown, true);

  return {
    arm: (id: string) => {
      if (disposed) return;
      pin = id;
      tick();
      deps.onChange?.(pin);
    },
    disarm: () => {
      if (disposed) return;
      if (pin === null) return;
      pin = null;
      tick();
      deps.onChange?.(null);
    },
    pinned: () => pin,
    tick,
    dispose: () => {
      disposed = true;
      pin = null;
      doc.removeEventListener('touchstart', onTouchStart, touchOptions);
      doc.removeEventListener('touchmove', onTouchMove, touchOptions);
      doc.removeEventListener('wheel', onWheel, wheelOptions);
      doc.removeEventListener('keydown', onKeyDown, true);
      activeSurface = null;
      scroller = null;
      restoreAllLoops();
      doc.documentElement.removeAttribute(LOCK_ATTR);
    },
  };
}
