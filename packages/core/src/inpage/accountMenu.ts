/**
 * Opens Instagram's own account menu.
 *
 * This app keeps one session in one cookie jar, so it cannot hold two accounts
 * and swap between them the way a native client does — that would mean storing
 * a second session, which invariant 2 forbids. Instagram's own switcher is the
 * only place a second account can come from, and it lives behind the chevron in
 * the page header (teardown A6: leave it intact if it works). Cleanup hides the
 * *navigation* containers, not the header, so the chevron is still there; what
 * was missing was a way to reach it once our tab bar replaced Instagram's.
 *
 * So this is a click on a control Instagram already draws — no credentials, no
 * internal endpoint, no automation of anything a user could not tap themselves.
 * Cosmetic, therefore fail-open: when the chevron is absent the caller says so
 * rather than pretending something opened.
 */

import type { SelectorResolver } from './selector.js';

export type AccountMenuDeps = {
  win: Window;
  resolver: SelectorResolver;
};

/** True when a click was dispatched; false when the page has no switcher. */
export function openAccountMenu(deps: AccountMenuDeps): boolean {
  const { win, resolver } = deps;
  let chevron: Element | null = null;
  try {
    chevron = resolver.one(win.document, 'accountChevron');
  } catch {
    return false;
  }
  if (!chevron) return false;

  // The candidate is usually the <svg>. Instagram's menu is opened by the button
  // (or link) wrapped around it, and React listens at the root, so the click has
  // to bubble from an element inside that handler's subtree.
  const target = (chevron.closest("button, a, [role='button']") ?? chevron) as HTMLElement;
  // `win.MouseEvent` rather than the global one: an injected script runs against
  // the page's own realm, and a cross-realm event can be ignored by React.
  const MouseEventCtor = (win as unknown as { MouseEvent?: typeof MouseEvent }).MouseEvent;
  try {
    if (MouseEventCtor) {
      target.dispatchEvent(new MouseEventCtor('click', { bubbles: true, cancelable: true }));
    } else {
      target.click();
    }
    return true;
  } catch {
    return false;
  }
}
