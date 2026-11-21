/**
 * Our five-item navigation, injected on the web (the iOS app uses a native tab
 * bar instead, so this module is only mounted by the extension).
 *
 * Rendered inside a shadow root so Instagram's CSS cannot restyle it and ours
 * cannot leak onto their page. Each item maps to a real Instagram route; the
 * fifth ("More") opens our settings surface, because there is no Instagram
 * route for "get out of here".
 */

import type { Layout, TabId } from '../routes.js';
import { tabForPath } from '../routes.js';
import type { StoryRing } from '../bridge.js';
import { whenRoot } from './styles.js';

export type NavBarDeps = {
  win: Window;
  layout: () => Layout;
  labels: () => boolean;
  onNavigate: (tab: TabId) => void;
  onOpenSettings: () => void;
  getStories: () => StoryRing[];
  storiesEnabled: () => boolean;
  onOpenStory: (user: string) => void;
};

export type NavBar = {
  mount: () => void;
  sync: (url?: string) => void;
  setLayout: (layout: Layout) => void;
  destroy: () => void;
  root: () => HTMLElement | null;
  refreshStories: () => void;
};

const ICONS: Record<TabId, string> = {
  inbox:
    '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.6-.7L3 21l1.9-4.8a8 8 0 0 1-.9-3.7 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 7.4Z"/>',
  activity:
    '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1Z"/>',
  profile:
    '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  stories: '<circle cx="12" cy="12" r="9" stroke-dasharray="5 3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};

const LABELS: Record<TabId, string> = {
  inbox: 'Chats',
  activity: 'Activity',
  profile: 'Profile',
  stories: 'Stories',
  more: 'More',
};

const ORDER: TabId[] = ['inbox', 'stories', 'activity', 'profile', 'more'];

const STYLE = `
:host { all: initial; }
.bar {
  position: fixed;
  z-index: 2147483000;
  display: flex;
  background: rgba(22,22,29,.86);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  box-shadow: 0 12px 38px #0007;
  border-radius: 32px;
  border: 1px solid #ffffff26;
  border-top: 1px solid rgba(255,255,255,0.08);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #e8e8ec;
  box-sizing: border-box;
}
.bar--mobile {
  left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom, 0px));
  min-height: 64px;
  padding: 5px;
  align-items: stretch;
  justify-content: space-around;
}
.bar--desktop {
  left: 12px; top: 24px; bottom: 24px;
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
  transition: background-color 160ms ease;
  box-sizing: border-box;
}
.item svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.item:hover { background: rgba(108,92,231,0.12); }
.item[aria-current="page"] { color: #c9bdff; }
.selection { position: absolute; pointer-events: none; background: #b4a2f52b; border-radius: 27px; transition: transform 180ms ease; }
.bar--mobile .selection { left: 5px; top: 5px; bottom: 5px; width: calc((100% - 10px) / 5); transform: translateX(calc(var(--selected, 0) * 100%)); }
.bar--desktop .selection { left: 10px; top: 22px; width: 56px; height: 56px; transform: translateY(calc(var(--selected, 0) * 66px)); }
.label { display: none; }
.bar--mobile .label { display: block; }
.bar--desktop .item { flex: 0 0 auto; width: 56px; height: 56px; }
.bar--desktop .label { display: block; font-size: 10px; }
.panel { position: fixed; inset: 16px 16px 100px; z-index: 2147482999; background: #101015; color: #eee;
 border: 1px solid #ffffff26; border-radius: 26px; padding: 24px; overflow: auto; font: 15px -apple-system, sans-serif; }
.panel h1 { font-size: 28px; } .panel p { color: #aaaab8; max-width: 48ch; line-height: 1.6; }
.rings { display: flex; gap: 16px; flex-wrap: wrap; margin: 24px 0; }
.ring { background: none; color: inherit; border: 0; width: 88px; cursor: pointer; overflow-wrap: anywhere; }
.ring span { display: grid; place-items: center; width: 60px; height: 60px; margin: 0 auto 10px; border-radius: 50%;
 border: 3px solid #bf70e8; background: #292334; font-size: 22px; }
.ring[data-seen="true"] span { border-color: #666674; }
.close { float: right; } .panel button { min-height: 44px; }
.item:focus-visible, .panel button:focus-visible { outline: 2px solid #b7aaff; outline-offset: 2px; }
@media (min-width: 768px) { .panel { left: 110px; bottom: 24px; } }
@media (prefers-reduced-motion: reduce) { .item, .selection { transition: none; } }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .bar { background: #19191f; } }
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .bar { background: #19191f; backdrop-filter: none; -webkit-backdrop-filter: none; } }
`;

export function createNavBar(deps: NavBarDeps): NavBar {
  const doc = deps.win.document;
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let bar: HTMLElement | null = null;
  let currentLayout: Layout = deps.layout();
  let panel: HTMLElement | null = null;
  let disposed = false;
  let previousFocus: HTMLElement | null = null;

  function closeStories(): void {
    panel?.remove(); panel = null;
    sync();
    previousFocus?.focus();
  }
  function refreshStories(): void {
    sync();
    if (!panel) return;
    const rings = panel.querySelector('.rings');
    const detail = panel.querySelector('p');
    if (!rings || !detail) return;
    rings.replaceChildren();
    const stories = deps.storiesEnabled() ? deps.getStories() : [];
    detail.textContent = !deps.storiesEnabled() ? 'Stories are off. Enable them in More.' : stories.length
      ? 'Choose a person. Auto-advance is off by default.'
      : 'No story links are available on this page. Open a friend’s profile, then return to Stories. Directly does not load the feed to find stories.';
    for (const story of stories) {
      const button = doc.createElement('button');
      button.className = 'ring'; button.dataset['seen'] = String(story.seen);
      button.setAttribute('aria-label', `Open ${story.username}’s stories`);
      const avatar = doc.createElement('span'); avatar.textContent = story.username[0]?.toUpperCase() ?? '';
      button.append(avatar, doc.createTextNode(story.username));
      button.onclick = () => { closeStories(); deps.onOpenStory(story.username); };
      rings.append(button);
    }
  }
  function showStories(): void {
    if (panel || !shadow) return;
    previousFocus = shadow.activeElement as HTMLElement | null;
    panel = doc.createElement('section'); panel.className = 'panel'; panel.setAttribute('aria-label', 'Stories');
    const close = doc.createElement('button'); close.className = 'close'; close.textContent = 'Close'; close.onclick = closeStories;
    const title = doc.createElement('h1'); title.textContent = 'Stories';
    const detail = doc.createElement('p');
    const rings = doc.createElement('div'); rings.className = 'rings';
    const settings = doc.createElement('button'); settings.textContent = 'Story settings'; settings.onclick = deps.onOpenSettings;
    panel.append(close, title, detail, rings, settings);
    panel.onkeydown = (event) => { if (event.key === 'Escape') closeStories(); event.stopPropagation(); };
    shadow.append(panel); refreshStories(); sync(); close.focus();
  }

  function item(tab: TabId): HTMLButtonElement {
    const button = doc.createElement('button');
    button.className = 'item';
    button.type = 'button';
    button.dataset['tab'] = tab;
    button.setAttribute('aria-label', LABELS[tab]);
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[tab]}</svg><span class="label">${LABELS[tab]}</span>`;
    button.addEventListener('click', () => {
      if (tab === 'stories') { showStories(); return; }
      closeStories();
      if (tab === 'more') deps.onOpenSettings();
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
    const selection = doc.createElement('div'); selection.className = 'selection'; selection.setAttribute('aria-hidden', 'true'); bar.appendChild(selection);
    for (const tab of ORDER) bar.appendChild(item(tab));
    shadow.appendChild(bar);
    const element = host;
    whenRoot(doc, () => { if (!disposed) doc.documentElement.appendChild(element); });
    sync();
  }

  function sync(url?: string): void {
    if (!bar) return;
    const active = panel ? 'stories' : tabForPath(url ?? deps.win.location.href);
    bar.style.setProperty('--selected', String(active ? Math.max(0, ORDER.indexOf(active)) : 0));
    const selection = bar.querySelector<HTMLElement>('.selection');
    if (selection) selection.hidden = !active;
    for (const button of Array.from(bar.querySelectorAll<HTMLButtonElement>('.item'))) {
      const label = button.querySelector<HTMLElement>('.label');
      if (label) label.style.display = deps.labels() ? 'block' : 'none';
      if (button.dataset['tab'] === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  function setLayout(layout: Layout): void {
    currentLayout = layout;
    if (!bar) return;
    bar.className = `bar bar--${layout}`;
    whenRoot(doc, () => {
      if (disposed) return;
      doc.documentElement.style.setProperty('padding-bottom', currentLayout === 'mobile' ? '96px' : '0');
      doc.documentElement.style.setProperty('padding-left', currentLayout === 'desktop' ? '100px' : '0');
    });
  }

  function destroy(): void {
    disposed = true;
    panel?.remove();
    host?.remove();
    host = null;
    bar = null;
    shadow = null;
  }

  return { mount, sync, setLayout, destroy, root: () => host, refreshStories };
}
