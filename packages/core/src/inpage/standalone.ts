/**
 * Self-booting entry. This is what `dist/inpage.txt` contains, and what the iOS
 * WebView evaluates after each navigation.
 *
 * The host may set `window.__onlyInboxOptions` before evaluating the script to
 * pass the initial pin (a reel the user opened from a DM) or to change the
 * surface. Everything is validated inside `boot`; nothing here trusts the host
 * beyond a plain object.
 */

import { boot, type BootOptions } from './index.js';

declare global {
  interface Window {
    __onlyInboxOptions?: Partial<BootOptions>;
  }
}

try {
  const provided = typeof window !== 'undefined' ? window.__onlyInboxOptions : undefined;
  const options: BootOptions = {
    host: 'ios',
    showNav: false,
    ...(provided && typeof provided === 'object' ? provided : {}),
  };
  // `boot` never throws into the page, but a failure here must not leave the
  // WebView with an unstyled page either.
  boot(options);
} catch {
  /* ignore */
}
