/**
 * CSS is bundled as text and injected by us, not declared in the manifest.
 *
 * Two reasons: the iOS WebView has no manifest and must receive the exact same
 * styles, and injecting at `document_start` beats Instagram's first paint so
 * there is no white flash and no unstyled nav.
 */

import blocked from '../styles/blocked.css?raw';
import hideChrome from '../styles/hide-chrome.css?raw';
import skeleton from '../styles/skeleton.css?raw';
import theme from '../styles/theme.css?raw';

export const BUNDLED_CSS: ReadonlyArray<{ id: string; css: string }> = [
  { id: 'di-theme', css: theme },
  { id: 'di-hide-chrome', css: hideChrome },
  { id: 'di-blocked', css: blocked },
  { id: 'di-skeleton', css: skeleton },
];

export function injectStyles(doc: Document): void {
  for (const sheet of BUNDLED_CSS) {
    if (doc.getElementById(sheet.id)) continue;
    const style = doc.createElement('style');
    style.id = sheet.id;
    style.setAttribute('data-directly', 'style');
    style.textContent = sheet.css;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
}

export function bootOverlay(doc: Document): { ready: () => void } {
  let element = doc.getElementById('directly-boot') as HTMLElement | null;
  if (!element) {
    element = doc.createElement('div');
    element.id = 'directly-boot';
    element.setAttribute('data-directly', 'boot');
    const mark = doc.createElement('div');
    mark.className = 'di-mark';
    element.appendChild(mark);
    doc.documentElement.appendChild(element);
  }
  const node = element;
  let done = false;
  return {
    ready: () => {
      if (done) return;
      done = true;
      node.setAttribute('data-ready', 'true');
      const win = doc.defaultView;
      const finish = () => node.setAttribute('data-gone', 'true');
      if (win) win.setTimeout(finish, 220);
      else finish();
    },
  };
}
