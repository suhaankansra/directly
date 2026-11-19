/**
 * Where a top-level navigation is actually going.
 *
 * The WebView hook used to answer this with one regex, `^(www\.)?instagram\.com`,
 * and hand anything else to `Linking.openURL`. That is wrong in two ways that
 * both end up at facebook.com:
 *
 *   - Instagram's own link shim, `l.instagram.com/?u=…`, wraps every outbound
 *     link. It is Instagram, but the regex did not match it, so a link a friend
 *     sent left the app instead of being unwrapped and judged by the route rules.
 *   - Facebook's OAuth dialog is how "Continue with Facebook" signs in. Handed to
 *     Safari, the login lands in Safari's cookie store, which this app can never
 *     see, so the button appears to do nothing — and tapping it again repeats the
 *     trip. Sign-in has to happen here or not at all, and it is said out loud
 *     rather than silently punted.
 *
 * Pure functions: no DOM, no navigation. The host decides what to do with the
 * kind it gets back.
 */

export type LinkKind =
  /** Instagram, including its subdomains; route rules apply to the path. */
  | 'instagram'
  /** Facebook's own login dialog: an Instagram sign-in attempt, not a link. */
  | 'meta-login'
  /** Somewhere else entirely: the host opens it outside the app. */
  | 'external'
  /** Unparsable, or a shim nesting we refuse to follow. */
  | 'invalid';

export type LinkTarget = {
  kind: LinkKind;
  /** The effective destination: for a shim, the URL it points at. */
  url: string;
  /** True when `url` came out of a shim and is not what was requested. */
  unwrapped?: boolean;
};

const INSTAGRAM = 'instagram.com';
const META = 'facebook.com';
/** The outbound link shim: `l.instagram.com/?u=<encoded target>`. */
const SHIM_HOST = 'l.instagram.com';
/** A shim inside a shim is already suspicious; two hops is plenty. */
const MAX_SHIM_HOPS = 2;

/**
 * Schemes a link may use. Anything else (`javascript:`, `data:`, `file:`) is
 * refused outright rather than passed to the OS to open.
 */
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

/** `/v19.0/dialog/oauth/…` or the older `/dialog/oauth`, and `/login.php`. */
const META_LOGIN_PATH = /^(?:\/v\d+(?:\.\d+)?)?\/(?:dialog\/oauth|login\.php)/;

function inDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** True for instagram.com and every subdomain of it — but not lookalikes. */
export function isInstagramHost(hostname: string): boolean {
  return inDomain(hostname.toLowerCase(), INSTAGRAM);
}

/** True for facebook.com and every subdomain of it — but not lookalikes. */
export function isMetaHost(url: string): boolean {
  const parsed = parse(url);
  return parsed !== null && inDomain(parsed.hostname.toLowerCase(), META);
}

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function shimTarget(url: URL): string | null {
  const inner = url.searchParams.get('u');
  if (!inner) return null;
  // `searchParams` decodes once. Some shims double-encode, so try one more
  // decode only when the result still cannot be parsed as a URL.
  if (parse(inner)) return inner;
  try {
    return decodeURIComponent(inner);
  } catch {
    return inner;
  }
}

export function classifyLink(rawUrl: string): LinkTarget {
  let current = rawUrl;
  let unwrapped = false;

  for (let hop = 0; hop <= MAX_SHIM_HOPS; hop += 1) {
    const url = parse(current);
    if (!url) return { kind: 'invalid', url: rawUrl };
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { kind: 'invalid', url: rawUrl };

    if (url.hostname.toLowerCase() === SHIM_HOST) {
      const inner = shimTarget(url);
      // A shim with nothing to unwrap is still Instagram's own redirector; let
      // it load so its own 302 comes back through this classifier.
      if (!inner) return { kind: 'instagram', url: url.href, unwrapped };
      current = inner;
      unwrapped = true;
      continue;
    }

    if (!isInstagramHost(url.hostname)) {
      const meta = inDomain(url.hostname.toLowerCase(), META);
      const kind: LinkKind = meta && META_LOGIN_PATH.test(url.pathname) ? 'meta-login' : 'external';
      return { kind, url: url.href, unwrapped };
    }

    // Plain http would be a downgrade; the app only ever loads https.
    if (url.protocol !== 'https:') return { kind: 'external', url: url.href, unwrapped };
    return { kind: 'instagram', url: url.href, unwrapped };
  }

  return { kind: 'invalid', url: rawUrl };
}
