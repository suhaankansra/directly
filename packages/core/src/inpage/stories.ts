/**
 * Story rings, read from the page Instagram already rendered.
 *
 * This is deliberately the smallest possible surface: a handle and whether the
 * ring looks seen. No story frame, no caption, no media URL, no viewer state —
 * the native Stories list only needs to know who to open.
 *
 * Instagram does not render the tray on every route (the DM inbox often has
 * none), so an empty list is a normal answer, not an error. The host shows an
 * empty state rather than inventing friends.
 */

import type { StoryRing } from '../bridge.js';

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;
/** Rings we must never offer as "a friend": Instagram's own aggregates. */
const NOT_PEOPLE = new Set(['highlights', 'archive', 'stories', 'explore']);

function handleFromHref(href: string): string | null {
  // `/stories/<handle>/<storyId>/` and `/stories/<handle>/` are both valid.
  const match = /^\/stories\/([^/?#]+)/.exec(href);
  if (!match) return null;
  const raw = match[1]!;
  try {
    const decoded = decodeURIComponent(raw).toLowerCase();
    if (NOT_PEOPLE.has(decoded)) return null;
    return HANDLE.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * `aria-label` is the only non-class signal for "seen" Instagram gives us, and
 * it is not guaranteed. Unknown reads as unseen, which is the safer default:
 * an unseen ring invites a tap, a wrongly-greyed ring hides a friend.
 */
function looksSeen(anchor: Element): boolean {
  const label = `${anchor.getAttribute('aria-label') ?? ''} ${
    anchor.closest('[aria-label]')?.getAttribute('aria-label') ?? ''
  }`;
  return !/\bunseen\b|\bunviewed\b|\bnot (?:seen|viewed)\b/i.test(label) && /\bseen\b|\bviewed\b/i.test(label);
}

/** Ordered, de-duplicated rings, capped to what the bridge accepts. */
export function readStoryRings(doc: Document, limit = 30): StoryRing[] {
  limit = Math.min(30, Math.max(0, Math.floor(limit)));
  if (!Number.isFinite(limit) || limit === 0) return [];
  const out: StoryRing[] = [];
  const seenHandles = new Set<string>();
  let anchors: Element[];
  try {
    anchors = Array.from(doc.querySelectorAll('a[href^="/stories/"]'));
  } catch {
    return out;
  }
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') ?? '';
    const username = handleFromHref(href);
    if (!username || seenHandles.has(username)) continue;
    seenHandles.add(username);
    out.push({ username, seen: looksSeen(anchor) });
    if (out.length >= limit) break;
  }
  return out;
}
