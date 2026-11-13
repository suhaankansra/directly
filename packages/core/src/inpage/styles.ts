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

/**
 * Runs `fn` once the document has a root element to attach to.
 *
 * Android's WebView evaluates the in-page script *before* `<html>` exists, so a
 * `documentElement.appendChild` at that moment throws — and because the
 * bootstrap is one big fail-closed block, that single throw takes the entire
 * injection with it: no styles, no route guard, no cleanup. iOS already has the
 * document skeleton at document start, which is why this only broke on Android.
 */
function whenRoot(doc: Document, fn: () => void): void {
  if (doc.documentElement) {
    fn();
    return;
  }
  const win = doc.defaultView;
  if (!win) return;
  const timer = win.setInterval(() => {
    if (!doc.documentElement) return;
    win.clearInterval(timer);
    fn();
  }, 4);
  // Never leave the poll running on a document that somehow never gets a root.
  win.setTimeout(() => win.clearInterval(timer), 10_000);
}

export function injectStyles(doc: Document): void {
  whenRoot(doc, () => {
    const root = doc.head ?? doc.documentElement;
    if (!root) return;
    for (const sheet of BUNDLED_CSS) {
      if (doc.getElementById(sheet.id)) continue;
      const style = doc.createElement('style');
      style.id = sheet.id;
      style.setAttribute('data-directly', 'style');
      style.textContent = sheet.css;
      root.appendChild(style);
    }
  });
}

export function bootOverlay(doc: Document): { ready: () => void } {
  let node: HTMLElement | null = null;
  let ready = false;
  let gone = false;

  function ensure(): HTMLElement | null {
    if (node) return node;
    const existing = doc.getElementById('directly-boot') as HTMLElement | null;
    if (existing) {
      node = existing;
      return node;
    }
    const root = doc.body ?? doc.documentElement;
    if (!root) return null;
    const element = doc.createElement('div');
    element.id = 'directly-boot';
    element.setAttribute('data-directly', 'boot');
    const mark = doc.createElement('div');
    mark.className = 'di-mark';
    element.appendChild(mark);
    root.appendChild(element);
    node = element;
    return node;
  }

  function paint(): void {
    const element = ensure();
    if (!element) return;
    if (ready) element.setAttribute('data-ready', 'true');
    if (gone) element.setAttribute('data-gone', 'true');
  }

  // Mount as soon as a root exists: at document start on Android there may not
  // be one yet, so this doubles as the retry path.
  whenRoot(doc, paint);

  return {
    ready: () => {
      if (ready) return;
      ready = true;
      paint();
      const win = doc.defaultView;
      const finish = () => {
        gone = true;
        paint();
      };
      if (win) win.setTimeout(finish, 220);
      else finish();
    },
  };
}
