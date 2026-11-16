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

/**
 * Anything that means "this container is part of a conversation": a thread row,
 * a composer or a text field. A container holding one of these is never searched
 * for a badge, so the single number we publish can only ever be the inbox's.
 */
const CONVERSATION =
  "a[href*='/direct/t/'], input, textarea, [contenteditable='true'], [role='textbox']";

function inboxLink(doc: Document, resolver: SelectorResolver): Element | null {
  try {
    const direct = doc.querySelector("a[href='/direct/inbox/']");
    if (direct) return direct;
  } catch {
    /* fall through to the candidate list */
  }
  return resolver.one(doc, 'dmInbox');
}

/** The count from a label, on the element itself or anything inside it. */
function countIn(scope: Element): number | null {
  for (const el of [scope, ...Array.from(scope.querySelectorAll('[aria-label]'))]) {
    const count = fromLabel(el.getAttribute('aria-label') ?? '');
    if (count !== null) return count;
  }
  return null;
}

/** A rendered badge anywhere inside `scope`. */
function badgeIn(scope: Element): number | null {
  for (const el of Array.from(scope.querySelectorAll('span, div, b, strong'))) {
    const count = fromBadgeText(el);
    if (count !== null) return count;
  }
  return null;
}

export function readUnread(doc: Document, resolver: SelectorResolver): number | null {
  const anchor = inboxLink(doc, resolver);
  if (!anchor) return null;

  // The link, plus its parent row. Instagram does not always put the badge
  // *inside* the inbox link — sometimes it is the next node along — and a
  // subtree-only search reported 0 as soon as that happened, which the host
  // reads as "nothing unread" and clears the badge with. The climb is one level
  // only, and stops at anything that looks like a conversation.
  const scopes: Element[] = [anchor];
  const parent = anchor.parentElement;
  if (parent && !parent.querySelector(CONVERSATION)) scopes.push(parent);

  // The label is the most stable source: Instagram puts the count there for
  // screen readers, so it survives a restyle of the badge itself.
  for (const scope of scopes) {
    const count = countIn(scope);
    if (count !== null) return count;
  }

  // Otherwise a rendered badge, still confined to those scopes.
  for (const scope of scopes) {
    const count = badgeIn(scope);
    if (count !== null) return count;
  }

  return 0;
}
