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

  function tick(): void {
    if (disposed) return;
    const root = doc.documentElement;
    if (!pin) {
      root.removeAttribute(LOCK_ATTR);
      for (const el of allSlides()) {
        el.removeAttribute(ACTIVE_ATTR);
        el.removeAttribute(HIDDEN_ATTR);
      }
      return;
    }

    root.setAttribute(LOCK_ATTR, pin);
    const slides = allSlides();
    if (slides.length === 0) return;
    const active = pickActive(slides);

    for (const el of slides) {
      if (el === active) {
        el.setAttribute(ACTIVE_ATTR, 'true');
        el.removeAttribute(HIDDEN_ATTR);
        // Loop instead of advancing: Instagram's "next" is normally triggered
        // by the `ended` event, so looping removes the trigger entirely.
        for (const video of Array.from(el.querySelectorAll('video'))) {
          if (!video.loop) video.loop = true;
        }
      } else {
        el.removeAttribute(ACTIVE_ATTR);
        el.setAttribute(HIDDEN_ATTR, 'true');
      }
    }

    // Desktop arrows/chevrons if they survive the CSS pass.
    for (const key of ['reelNext', 'reelPrev'] as const) {
      for (const el of resolver.all(doc, key)) {
        (el as HTMLElement).setAttribute(HIDDEN_ATTR, 'true');
      }
    }
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
      doc.documentElement.removeAttribute(LOCK_ATTR);
    },
  };
}
