/**
 * Finding the signed-in account's own profile link in the page.
 *
 * The host caches the handle it reads from `di:account`, but that name is only
 * knowable when Instagram has rendered your avatar — on a thread or a story it
 * often has not. The Profile tab then had nowhere to go and quietly loaded the
 * inbox, which looks exactly like a broken tab. The page can do better at the
 * moment of the tap: if your avatar is on screen, its link is your profile.
 *
 * No name is read here beyond the href, and nothing is stored.
 */

/** `/alice/` — a single handle segment, nothing else. */
const PROFILE_HREF = /^\/([A-Za-z0-9._]{1,30})\/$/;

/**
 * The href of the account's own profile link, or null when the page has not
 * rendered one. Requires the `alt` to look like a profile picture and to name
 * the same handle, so somebody else's avatar in a card cannot be mistaken for
 * yours.
 */
export function ownProfilePath(doc: Document): string | null {
  const anchor = doc.querySelector<HTMLAnchorElement>("a[href^='/'][role='link'] img[alt*='profile']");
  const href = anchor?.parentElement?.getAttribute('href');
  if (href && PROFILE_HREF.test(href)) return href;

  for (const candidate of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href^='/']"))) {
    const href = candidate.getAttribute('href') ?? '';
    const name = PROFILE_HREF.exec(href)?.[1];
    if (!name) continue;
    if (candidate.closest('main, article')) continue;
    const alt = candidate.querySelector('img[alt]')?.getAttribute('alt') ?? '';
    if (!/profile picture/i.test(alt)) continue;
    if (!alt.toLowerCase().includes(name.toLowerCase())) continue;
    return href;
  }
  return null;
}
