/**
 * Unread DM count.
 *
 * This is the only thing Directly reads that is *about* a conversation, and it
 * is deliberately a number. We look at Instagram's own link to the inbox and at
 * the count it already renders for screen readers; no sender, no preview and no
 * message text ever leaves the page. The host uses the count to draw the Inbox
 * badge and, while the app is open, to raise a local notification.
 *
 * Cosmetic, so it fails open (D017): a broken selector means "no badge", never a
 * hidden or blocked inbox.
 *
 * Returns `null` when the inbox link is not on the page at all (a thread, a
 * story, the login screen). That is *unknown*, not zero: the host keeps the last
 * count instead of flickering to nothing and then alerting again on the way back.
 */

import type { SelectorResolver } from './selector.js';

/** Past 99 a count stops being information, and the badge cannot hold it. */
const MAX_COUNT = 99;

/** `Direct messaging, 3 unread` / `Messages, 2 new notifications`. */
const UNREAD_WORDS = /unread|new (?:message|notification)|message request/i;

function toCount(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_COUNT);
}

function fromLabel(label: string): number | null {
  if (!UNREAD_WORDS.test(label)) return null;
  const match = /\d{1,3}/.exec(label);
  return match ? toCount(match[0]) : null;
}

/** A badge is a node whose whole text is the number: `3`, `12`, `99+`. */
function fromBadgeText(el: Element): number | null {
  const text = (el.textContent ?? '').trim();
  return /^\d{1,3}\+?$/.test(text) ? toCount(text) : null;
}

function inboxLink(doc: Document, resolver: SelectorResolver): Element | null {
  try {
    const direct = doc.querySelector("a[href='/direct/inbox/']");
    if (direct) return direct;
  } catch {
    /* fall through to the candidate list */
  }
  return resolver.one(doc, 'dmInbox');
}

export function readUnread(doc: Document, resolver: SelectorResolver): number | null {
  const anchor = inboxLink(doc, resolver);
  if (!anchor) return null;

  // The label is the most stable source: Instagram puts the count there for
  // screen readers, so it survives a restyle of the badge itself.
  const labelled = [anchor, ...Array.from(anchor.querySelectorAll('[aria-label]'))];
  for (const el of labelled) {
    const count = fromLabel(el.getAttribute('aria-label') ?? '');
    if (count !== null) return count;
  }

  // Otherwise a rendered badge. Scoped to the inbox link's own subtree, so this
  // can only ever read the DM count — never a conversation.
  for (const el of Array.from(anchor.querySelectorAll('span, div, b, strong'))) {
    const count = fromBadgeText(el);
    if (count !== null) return count;
  }

  return 0;
}
