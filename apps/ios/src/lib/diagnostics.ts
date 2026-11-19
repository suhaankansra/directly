/**
 * The app's own decisions, in order, held in memory on this phone.
 *
 * A phone has no console, so a bug that only happens on a device ("it keeps
 * opening Safari") is otherwise invisible: all the evidence is a memory of what
 * the screen did. This records the few facts the app already knows — which route
 * the page reported, which verdict a navigation got, and the host and path it was
 * given for — so the Lock screen can show them and a copy can leave the phone.
 *
 * Nothing else is stored. A query string is dropped before anything is kept (the
 * link shim puts an outbound address there), and the page protocol has no field
 * for message content, so nothing said in a DM can reach this log. Entries are
 * bounded in both count and length, and they are gone when the app is killed.
 */

import { useSyncExternalStore } from 'react';

export type DiagnosticEntry = {
  /** When it happened, `Date.now()`. */
  at: number;
  /** The decision, e.g. `block`, `browser`, `route`, `tab`. */
  kind: string;
  /** What it was about: a route, a host and path, a count. Never content. */
  detail: string;
};

const LIMIT = 50;
const DETAIL_LIMIT = 96;

let entries: readonly DiagnosticEntry[] = [];
const listeners = new Set<() => void>();

/**
 * A URL reduced to what is safe and useful to keep: host and path, lowercased
 * host, no query, no fragment, no scheme. Two different shim links that only
 * differ in their destination therefore record the same string.
 */
export function shortUrl(url: string): string {
  const trimmed = (url.split('#')[0] ?? '').split('?')[0]?.replace(/^[a-z]+:\/\//i, '') ?? '';
  return trimmed.slice(0, DETAIL_LIMIT - 1);
}

export function logEvent(kind: string, detail = ''): void {
  const entry: DiagnosticEntry = { at: Date.now(), kind, detail: detail.slice(0, DETAIL_LIMIT) };
  // A new array rather than a push: the snapshot has to change identity for
  // `useSyncExternalStore` to see it.
  entries = [...entries, entry].slice(-LIMIT);
  listeners.forEach((listener) => listener());
}

export function clearDiagnostics(): void {
  if (entries.length === 0) return;
  entries = [];
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly DiagnosticEntry[] {
  return entries;
}

/** Newest last, as recorded. */
export function useDiagnostics(): readonly DiagnosticEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** `20:01:03` — fixed width, so a copied log reads as columns. */
export function clock(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** The log as lines, oldest first, for the copied report. */
export function reportLines(): string[] {
  return entries.map((entry) => `${clock(entry.at)} ${entry.kind}${entry.detail ? ` ${entry.detail}` : ''}`);
}
