/**
 * The host-facing API: everything the iOS app needs to make route decisions and
 * to talk to the in-page script, with no DOM access at import time.
 *
 * The in-page modules live behind `@only-inbox/core/inpage` so that importing
 * this package in React Native does not pull in `window`/`document` code.
 */

export {
  ACTIVITY_PATH,
  INBOX_PATH,
  isBlocked,
  isProfilePath,
  normalizePath,
  pathForTab,
  reelIdForPath,
  routeVerdict,
  tabForPath,
  type BlockReason,
  type Layout,
  type RouteContext,
  type TabId,
  type Verdict,
} from './routes.js';

export {
  DEFAULT_SETTINGS,
  mergeSettings,
  settingsEqual,
  SETTINGS_SCHEMA_VERSION,
  type Settings,
} from './settings.js';

export {
  MAX_MESSAGE_BYTES,
  parseHostMessage,
  parsePageMessage,
  PROTOCOL_VERSION,
  type HostMessage,
  type PageMessage,
} from './bridge.js';

export { hostVerdict, type HostDecision } from './host.js';

export const CORE_VERSION = '0.1.0';
