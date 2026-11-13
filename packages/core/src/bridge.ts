/**
 * The message protocol between the in-page script and its host
 * (iOS WKWebView bridge or extension popup/background).
 *
 * Every inbound message is validated: version, known type, shape and length
 * caps. Unknown or malformed messages are dropped — never forwarded, never
 * evaluated (docs/02-architecture.md §5).
 */

import type { Layout, TabId } from './routes.js';
import { mergeSettings, type Settings } from './settings.js';

export const PROTOCOL_VERSION = 1 as const;
export const MAX_MESSAGE_BYTES = 4096;

const MAX_PATH_LENGTH = 512;

export type PageMessage =
  | { v: 1; type: 'di:url'; path: string; layout: Layout; pinId: string | null }
  | { v: 1; type: 'di:blocked'; path: string; reason: string }
  | { v: 1; type: 'di:live'; layout: Layout }
  | { v: 1; type: 'di:tab'; tab: TabId | null }
  | { v: 1; type: 'di:account'; username: string | null; signedIn: boolean };

export type HostMessage =
  | { v: 1; type: 'di:settings'; settings: Settings }
  | { v: 1; type: 'di:navigate'; path: string }
  | { v: 1; type: 'di:pin'; id: string | null };

const TAB_IDS = new Set<TabId>(['inbox', 'activity', 'profile', 'lock']);
const LAYOUTS = new Set<Layout>(['mobile', 'desktop']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_PATH_LENGTH) return null;
  if (!value.startsWith('/')) return null;
  if (value.includes('\\')) return null;
  return value;
}

/** Validate a message coming *from* the page. Returns null to drop it. */
export function parsePageMessage(input: unknown): PageMessage | null {
  let value = input;
  if (typeof input === 'string') {
    if (input.length > MAX_MESSAGE_BYTES) return null;
    try {
      value = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  if (value['v'] !== PROTOCOL_VERSION) return null;

  const type = value['type'];
  const path = safePath(value['path']);

  switch (type) {
    case 'di:url': {
      if (!path) return null;
      const layout = value['layout'];
      if (typeof layout !== 'string' || !LAYOUTS.has(layout as Layout)) return null;
      const pinId = value['pinId'];
      const safePin =
        typeof pinId === 'string' && pinId.length <= 128 && /^[A-Za-z0-9_-]+$/.test(pinId)
          ? pinId
          : null;
      return { v: 1, type: 'di:url', path, layout: layout as Layout, pinId: safePin };
    }
    case 'di:blocked': {
      if (!path) return null;
      const reason = value['reason'];
      if (typeof reason !== 'string' || reason.length > 64) return null;
      return { v: 1, type: 'di:blocked', path, reason };
    }
    case 'di:live': {
      const layout = value['layout'];
      if (typeof layout !== 'string' || !LAYOUTS.has(layout as Layout)) return null;
      return { v: 1, type: 'di:live', layout: layout as Layout };
    }
    case 'di:tab': {
      const tab = value['tab'];
      if (tab === null) return { v: 1, type: 'di:tab', tab: null };
      if (typeof tab !== 'string' || !TAB_IDS.has(tab as TabId)) return null;
      return { v: 1, type: 'di:tab', tab: tab as TabId };
    }
    case 'di:account': {
      // Only the *name* of the signed-in account, read from a profile link in the
      // page, plus whether a session is present at all. It is displayed in the
      // Lock tab and never stored or transmitted.
      const username = value['username'];
      const signedIn = value['signedIn'];
      if (typeof signedIn !== 'boolean') return null;
      if (username === null) return { v: 1, type: 'di:account', username: null, signedIn };
      if (typeof username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(username)) return null;
      return { v: 1, type: 'di:account', username, signedIn };
    }
    default:
      return null;
  }
}

/** Validate a message coming *from* the host, in the page. */
export function parseHostMessage(input: unknown): HostMessage | null {
  let value = input;
  if (typeof input === 'string') {
    if (input.length > MAX_MESSAGE_BYTES) return null;
    try {
      value = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  if (value['v'] !== PROTOCOL_VERSION) return null;

  switch (value['type']) {
    case 'di:settings':
      return { v: 1, type: 'di:settings', settings: mergeSettings(value['settings']) };
    case 'di:navigate': {
      const path = safePath(value['path']);
      if (!path) return null;
      return { v: 1, type: 'di:navigate', path };
    }
    case 'di:pin': {
      const id = value['id'];
      if (id === null) return { v: 1, type: 'di:pin', id: null };
      if (typeof id !== 'string' || id.length > 128 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
      return { v: 1, type: 'di:pin', id };
    }
    default:
      return null;
  }
}
