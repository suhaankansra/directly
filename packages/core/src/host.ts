/**
 * Host-layer route decision (layer 1 of 2).
 *
 * The host (WKWebView's `onShouldStartLoadWithRequest`, or the extension's
 * `webNavigation.onBeforeNavigate`) only sees *full document loads*. It cannot
 * know about a pin that the in-page script is about to arm, so its job is:
 *
 *   - block the routes that must never load (feed, explore, reels tab, signup)
 *   - allow conditional routes (a single reel/post) only when the load clearly
 *     started on a surface where a user could legitimately tap one — a DM
 *     thread or a profile — and let layer 2 enforce the pin
 *
 * This keeps deep links and redirects from an external page from opening a
 * single reel while preserving "tap the reel my friend sent".
 */

import { isProfilePath, routeVerdict, type RouteContext, type Verdict } from './routes.js';

export type HostDecision = Verdict & { decidedBy: 'host' };

/**
 * @param previousPath path the tab/WebView was on before this load, if known.
 *   `null` when the load is the first one (cold launch, external link).
 */
export function hostVerdict(
  rawUrl: string,
  ctx: RouteContext,
  previousPath?: string | null,
): HostDecision {
  const verdict = routeVerdict(rawUrl, ctx);
  if (verdict.action === 'allow') return { ...verdict, decidedBy: 'host' };

  const fromAllowedSurface =
    typeof previousPath === 'string' &&
    (previousPath.startsWith('/direct') || isProfilePath(previousPath));

  // A single reel/post tapped inside a thread or a profile grid: let the
  // document load, layer 2 will pin it and freeze everything after it.
  if (verdict.reason === 'not-pinned' && fromAllowedSurface) {
    return { action: 'allow', reason: 'opened-from-surface', path: verdict.path, decidedBy: 'host' };
  }

  return { ...verdict, decidedBy: 'host' };
}
