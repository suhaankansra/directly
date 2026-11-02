/**
 * WebView ⇄ native bridge helpers.
 *
 * Everything the page sends is validated by the shared `parsePageMessage`
 * before the app looks at it: version, known type, path shape and length caps.
 * Nothing is ever evaluated, and no message can carry message content — the
 * protocol has no field for it.
 */

import { parsePageMessage, type PageMessage, type Settings } from '@directly/core';

export type ParsedPageMessage = PageMessage;

export function readPageMessage(raw: string): ParsedPageMessage | null {
  return parsePageMessage(raw);
}

/** Settings payload pushed into the page after a toggle changes. */
export function settingsMessage(settings: Settings): string {
  return `window.postMessage(${JSON.stringify({ v: 1, type: 'di:settings', settings })}, window.location.origin); true;`;
}

/** Ask the page to show one pinned reel/post (used when arming from native). */
export function pinMessage(id: string | null): string {
  return `window.postMessage(${JSON.stringify({ v: 1, type: 'di:pin', id })}, window.location.origin); true;`;
}

/** Navigate the WebView to a path, e.g. when a tab is tapped. */
export function navigateMessage(path: string): string {
  return `window.location.assign(${JSON.stringify(path)}); true;`;
}

/**
 * The script injected at document start.
 *
 * `__directlyOptions` must be set *before* the core evaluates, because a cold
 * load straight into a pinned reel (a tab restored mid-reel) needs its pin from
 * the host: the page has no previous route to infer it from.
 */
export function injectionScript(script: string, options: Record<string, unknown>): string {
  return `window.__directlyOptions = ${JSON.stringify(options)};\n${script}`;
}
