/**
 * Optional remote selector config.
 *
 * Store policy (§1.2 of the research in docs/02-architecture.md) allows
 * fetching *data* (JSON/CSS) but forbids executing remote code. This module
 * therefore fetches a JSON document of selector strings only, validates it, and
 * hands it to `mergeSelectorConfig` — there is no `eval`, no `new Function`, and
 * no way for the payload to introduce behaviour. When the fetch fails, the
 * bundled selectors are used (D018).
 */

import { mergeSelectorConfig, type SelectorConfig } from './selector.js';

export type RemoteConfigResult = {
  config: SelectorConfig;
  source: 'bundled' | 'remote';
  applied: number;
  rejected: number;
};

export async function fetchSelectorConfig(
  base: SelectorConfig,
  url: string | null,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<RemoteConfigResult> {
  if (!url) return { config: base, source: 'bundled', applied: 0, rejected: 0 };

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { config: base, source: 'bundled', applied: 0, rejected: 0 };
  }

  const timeoutMs = options.timeoutMs ?? 4000;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller?.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`config ${response.status}`);
    const text = await response.text();
    if (text.length > 64_000) throw new Error('config too large');
    const merged = mergeSelectorConfig(base, JSON.parse(text));
    if (merged.applied === 0) {
      return { config: base, source: 'bundled', applied: 0, rejected: merged.rejected };
    }
    return { config: merged.config, source: 'remote', applied: merged.applied, rejected: merged.rejected };
  } catch {
    return { config: base, source: 'bundled', applied: 0, rejected: 0 };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
