import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installReelLock, type ReelLock } from '../src/inpage/reelLock';
import { SelectorResolver } from '../src/inpage/selector';

const SLIDES = `
  <div id="scroller">
    <article data-test="a"><video></video><p>first</p></article>
    <article data-test="b"><video></video><p>second</p></article>
    <article data-test="c"><video></video><p>third</p></article>
  </div>`;

function slides(): HTMLElement[] {
  return Array.from(document.querySelectorAll('article')) as HTMLElement[];
}

function touch(type: 'touchstart' | 'touchmove', x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] });
  return event;
}

let lock: ReelLock;

beforeEach(() => {
  lock?.dispose();
  document.documentElement.removeAttribute('data-di-reel-locked');
  document.body.innerHTML = SLIDES;
  lock = installReelLock({
    win: window,
    resolver: new SelectorResolver('mobile'),
    layout: () => 'mobile',
  });
});

afterEach(() => {
  lock.dispose();
});

describe('arm / disarm', () => {
  it('marks the document as locked with the pinned id', () => {
    lock.arm('Cabc');
    expect(document.documentElement.getAttribute('data-di-reel-locked')).toBe('Cabc');
    expect(lock.pinned()).toBe('Cabc');
  });

  it('keeps exactly one slide visible', () => {
    lock.arm('Cabc');
    const [first, second, third] = slides();
    expect(first!.getAttribute('data-di-slide-active')).toBe('true');
    expect(first!.hasAttribute('data-di-slide-hidden')).toBe(false);
    expect(second!.getAttribute('data-di-slide-hidden')).toBe('true');
    expect(third!.getAttribute('data-di-slide-hidden')).toBe('true');
  });

  it('loops the active video so the ended event never advances to the next reel', () => {
    lock.arm('Cabc');
    const video = slides()[0]!.querySelector('video')!;
    expect(video.loop).toBe(true);
  });

  it('hides slides that appear later, on the next tick', () => {
    lock.arm('Cabc');
    const extra = document.createElement('article');
    extra.innerHTML = '<video></video>';
    document.getElementById('scroller')!.appendChild(extra);
    lock.tick();
    expect(extra.getAttribute('data-di-slide-hidden')).toBe('true');
  });

  it('restores every slide on disarm', () => {
    lock.arm('Cabc');
    lock.disarm();
    expect(document.documentElement.hasAttribute('data-di-reel-locked')).toBe(false);
    for (const slide of slides()) {
      expect(slide.hasAttribute('data-di-slide-hidden')).toBe(false);
      expect(slide.hasAttribute('data-di-slide-active')).toBe(false);
    }
    expect(lock.pinned()).toBeNull();
  });
});

describe('gestures', () => {
  it('cancels a vertical swipe while pinned', () => {
    lock.arm('Cabc');
    document.body.dispatchEvent(touch('touchstart', 20, 300));
    const move = touch('touchmove', 22, 180);
    document.body.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
  });

  it('lets a horizontal swipe through so carousels still work', () => {
    lock.arm('Cabc');
    document.body.dispatchEvent(touch('touchstart', 300, 300));
    const move = touch('touchmove', 120, 305);
    document.body.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
  });

  it('does not interfere when nothing is pinned', () => {
    document.body.dispatchEvent(touch('touchstart', 20, 300));
    const move = touch('touchmove', 20, 120);
    document.body.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
  });

  it('cancels a vertical wheel while pinned', () => {
    lock.arm('Cabc');
    const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    document.body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
  });

  it('leaves wheel scrolling inside the reply box alone', () => {
    lock.arm('Cabc');
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    textarea.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
  });
});

describe('keyboard', () => {
  it.each(['ArrowDown', 'ArrowUp', ' ', 'j', 'k', 'PageDown'])(
    'swallows %s while pinned',
    (key) => {
      lock.arm('Cabc');
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it('lets you type in the message composer', () => {
    lock.arm('Cabc');
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores combinations like Cmd+R', () => {
    lock.arm('Cabc');
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
