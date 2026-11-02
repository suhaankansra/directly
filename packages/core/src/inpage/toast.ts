/**
 * Tiny toast, in a shadow root so Instagram's CSS cannot touch it.
 *
 * Shown once per blocked navigation so a redirect to the inbox is explained
 * rather than feeling like a bug (D011). It never contains anything from a
 * message or a profile — only a fixed sentence.
 */

export type Toast = {
  show: (message: string) => void;
  destroy: () => void;
};

const STYLE = `
:host { all: initial; }
.pill {
  position: fixed;
  left: 50%;
  bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  transform: translate(-50%, 12px);
  opacity: 0;
  z-index: 2147483001;
  background: #232329;
  color: #f2f2f5;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 999px;
  padding: 10px 16px;
  font: 500 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  transition: opacity 140ms ease, transform 140ms ease;
  pointer-events: none;
  max-width: min(88vw, 380px);
  text-align: center;
}
.pill[data-visible="true"] { opacity: 1; transform: translate(-50%, 0); }
`;

export function createToast(win: Window): Toast {
  const doc = win.document;
  let host: HTMLElement | null = null;
  let pill: HTMLElement | null = null;
  let timer: number | undefined;
  let lastMessage = '';
  let lastAt = 0;

  function ensure(): HTMLElement {
    if (pill) return pill;
    host = doc.createElement('div');
    host.id = 'only-inbox-toast';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLE;
    pill = doc.createElement('div');
    pill.className = 'pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    shadow.append(style, pill);
    doc.documentElement.appendChild(host);
    return pill;
  }

  return {
    show: (message: string) => {
      const element = ensure();
      const now = Date.now();
      // Collapse a burst of identical redirects into one pill.
      if (message === lastMessage && now - lastAt < 1500) return;
      lastMessage = message;
      lastAt = now;
      element.textContent = message;
      element.setAttribute('data-visible', 'true');
      if (timer !== undefined) win.clearTimeout(timer);
      timer = win.setTimeout(() => element.setAttribute('data-visible', 'false'), 2200);
    },
    destroy: () => {
      if (timer !== undefined) win.clearTimeout(timer);
      host?.remove();
      host = null;
      pill = null;
    },
  };
}
