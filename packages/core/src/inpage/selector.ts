/**
 * Layout detection and selector resolution.
 *
 * Rule: never depend on Instagram's obfuscated class names. Candidates are
 * ordered href → aria-label → role → structural. A remote config may replace
 * the candidate lists, but only as *data*: known keys, arrays of strings, no
 * code, no new keys (D018, docs/02-architecture.md §8).
 */

import desktopConfig from '../selectors/desktop.json';
import mobileConfig from '../selectors/mobile.json';
import type { Layout } from '../routes.js';

export type SelectorMap = Record<string, string[]>;
export type SelectorConfig = { version: number; layout: Layout; selectors: SelectorMap };

const MOBILE = mobileConfig as SelectorConfig;
const DESKTOP = desktopConfig as SelectorConfig;

export const KNOWN_SELECTOR_KEYS = new Set(Object.keys(MOBILE.selectors).concat(Object.keys(DESKTOP.selectors)));

/** Failures are recorded locally so a broken selector is diagnosable offline. */
export type SelectorDiagnostics = { key: string; layout: Layout; at: number };

const diagnostics: SelectorDiagnostics[] = [];

export function selectorFailures(): ReadonlyArray<SelectorDiagnostics> {
  return diagnostics;
}

export function detectLayout(win: Window = window): Layout {
  const width = typeof win.innerWidth === 'number' ? win.innerWidth : 390;
  if (width >= 1024) return 'desktop';
  // A visible desktop sidebar is a stronger signal than a window size that the
  // user has zoomed or that sits on a boundary.
  if (width >= 768) {
    const doc = win.document;
    if (doc && doc.querySelector("nav[role='navigation'] a[href='/reels/']")) return 'desktop';
  }
  return 'mobile';
}

export function selectorsFor(layout: Layout): SelectorConfig {
  return layout === 'desktop' ? DESKTOP : MOBILE;
}

/**
 * Merge a fetched config over the bundled one.
 *
 * Accepts only: `{version: 1, layout, selectors: {knownKey: string[]}}`.
 * Everything else is ignored, so a bad remote file degrades to the bundle.
 */
export function mergeSelectorConfig(
  base: SelectorConfig,
  remote: unknown,
): { config: SelectorConfig; applied: number; rejected: number } {
  let applied = 0;
  let rejected = 0;
  const config: SelectorConfig = { ...base, selectors: { ...base.selectors } };

  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) {
    return { config, applied, rejected: 1 };
  }
  const record = remote as Record<string, unknown>;
  if (record['version'] !== 1) return { config, applied, rejected: 1 };

  const incoming = record['selectors'];
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { config, applied, rejected: 1 };
  }

  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    if (!KNOWN_SELECTOR_KEYS.has(key) || !Array.isArray(value)) {
      rejected += 1;
      continue;
    }
    const candidates: string[] = [];
    for (const candidate of value) {
      if (typeof candidate !== 'string') continue;
      if (candidate.length === 0 || candidate.length > 400) continue;
      if (candidate.includes('{') || candidate.includes('\n')) continue;
      candidates.push(candidate);
    }
    if (candidates.length === 0) {
      rejected += 1;
      continue;
    }
    config.selectors[key] = candidates;
    applied += 1;
  }

  return { config, applied, rejected };
}

export class SelectorResolver {
  private config: SelectorConfig;
  private layout: Layout;

  constructor(layout: Layout) {
    this.layout = layout;
    this.config = selectorsFor(layout);
  }

  get currentLayout(): Layout {
    return this.layout;
  }

  setLayout(layout: Layout): void {
    if (layout === this.layout) return;
    this.layout = layout;
    this.config = selectorsFor(layout);
  }

  setConfig(config: SelectorConfig): void {
    this.config = config;
  }

  candidates(key: string): string[] {
    return this.config.selectors[key] ?? [];
  }

  one(root: ParentNode, key: string): Element | null {
    for (const selector of this.candidates(key)) {
      try {
        const found = root.querySelector(selector);
        if (found) return found;
      } catch {
        /* invalid selector from a remote config: skip */
      }
    }
    diagnostics.push({ key, layout: this.layout, at: Date.now() });
    if (diagnostics.length > 50) diagnostics.shift();
    return null;
  }

  all(root: ParentNode, key: string): Element[] {
    for (const selector of this.candidates(key)) {
      try {
        const found = Array.from(root.querySelectorAll(selector));
        if (found.length > 0) return found;
      } catch {
        /* skip */
      }
    }
    diagnostics.push({ key, layout: this.layout, at: Date.now() });
    if (diagnostics.length > 50) diagnostics.shift();
    return [];
  }
}
