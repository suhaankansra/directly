/**
 * Our four-item navigation, injected on the web (the iOS app uses a native tab
 * bar instead, so this module is only mounted by the extension).
 *
 * Rendered inside a shadow root so Instagram's CSS cannot restyle it and ours
 * cannot leak onto their page. Each item maps to a real Instagram route; the
 * fourth ("Lock") opens our settings surface, because there is no Instagram
 * route for "get out of here".
 */

import type { Layout, TabId } from '../routes.js';
import { tabForPath } from '../routes.js';

export type NavBarDeps = {
  win: Window;
  layout: () => Layout;
  labels: () => boolean;
  onNavigate: (tab: TabId) => void;
  onOpenSettings: () => void;
};

export type NavBar = {
  mount: () => void;
  sync: (url?: string) => void;
  setLayout: (layout: Layout) => void;
  destroy: () => void;
  root: () => HTMLElement | null;
};

const ICONS: Record<TabId, string> = {
  inbox:
    '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.6-.7L3 21l1.9-4.8a8 8 0 0 1-.9-3.7 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 7.4Z"/>',
  activity:
    '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1Z"/>',
  profile:
    '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
};

const LABELS: Record<TabId, string> = {
  inbox: 'DMs',
  activity: 'Activity',
  profile: 'Profile',
  lock: 'Lock',
};

const ORDER: TabId[] = ['inbox', 'activity', 'profile', 'lock'];

const STYLE = `
:host { all: initial; }
.bar {
  position: fixed;
  z-index: 2147483000;
  display: flex;
  background: #111114;
  border-top: 1px solid rgba(255,255,255,0.08);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #e8e8ec;
  box-sizing: border-box;
}
.bar--mobile {
  left: 0; right: 0; bottom: 0;
  height: calc(56px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  align-items: stretch;
  justify-content: space-around;
}
.bar--desktop {
  left: 0; top: 0; bottom: 0;
  width: 76px;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 22px 0;
  border-top: 0;
  border-right: 1px solid rgba(255,255,255,0.08);
}
.item {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  min-height: 48px;
  cursor: pointer;
  font-size: 11px;
  padding: 6px 4px;
  border-radius: 14px;
  transition: background-color 120ms ease;
  box-sizing: border-box;
}
.item svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.item:hover { background: rgba(108,92,231,0.12); }
.item[aria-current="page"] { color: #a89bff; background: rgba(108,92,231,0.18); }
.label { display: none; }
.bar--mobile .label { display: block; }
.bar--desktop .item { flex: 0 0 auto; width: 56px; height: 56px; }
.bar--desktop .label { display: block; font-size: 10px; }
`;

export function createNavBar(deps: NavBarDeps): NavBar {
  const doc = deps.win.document;
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let bar: HTMLElement | null = null;
  let currentLayout: Layout = deps.layout();

  function item(tab: TabId): HTMLButtonElement {
    const button = doc.createElement('button');
    button.className = 'item';
    button.type = 'button';
    button.dataset['tab'] = tab;
    button.setAttribute('aria-label', LABELS[tab]);
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[tab]}</svg><span class="label">${LABELS[tab]}</span>`;
    button.addEventListener('click', () => {
      if (tab === 'lock') deps.onOpenSettings();
      else deps.onNavigate(tab);
    });
    return button;
  }

  function mount(): void {
    if (host) return;
    host = doc.createElement('div');
    host.id = 'directly-nav';
    host.setAttribute('data-directly', 'nav');
    shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);
    bar = doc.createElement('nav');
    bar.className = `bar bar--${currentLayout}`;
    bar.setAttribute('aria-label', 'Directly');
    for (const tab of ORDER) bar.appendChild(item(tab));
    shadow.appendChild(bar);
    doc.documentElement.appendChild(host);
    sync();
  }

  function sync(url?: string): void {
    if (!bar) return;
    const active = tabForPath(url ?? deps.win.location.href);
    for (const button of Array.from(bar.querySelectorAll<HTMLButtonElement>('.item'))) {
      if (button.dataset['tab'] === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  function setLayout(layout: Layout): void {
    currentLayout = layout;
    if (!bar) return;
    bar.className = `bar bar--${layout}`;
    doc.documentElement.style.setProperty('padding-bottom', layout === 'mobile' ? '56px' : '0');
    doc.documentElement.style.setProperty('padding-left', layout === 'desktop' ? '76px' : '0');
  }

  function destroy(): void {
    host?.remove();
    host = null;
    bar = null;
    shadow = null;
  }

  return { mount, sync, setLayout, destroy, root: () => host };
}
