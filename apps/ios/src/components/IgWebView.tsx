import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import {
  INBOX_PATH,
  classifyLink,
  hostVerdict,
  isMetaHost,
  normalizePath,
  tabForPath,
  storyUserForPath,
  type StoryRing,
  type Layout,
  type Settings,
  type TabId,
} from '@directly/core';

import {
  accountMenuMessage,
  injectionScript,
  navigateMessage,
  openProfileMessage,
  readPageMessage,
  settingsMessage,
} from '../lib/bridge';
import { logEvent, shortUrl } from '../lib/diagnostics';
import { inpageScript } from '../lib/injectedScript';
import { colors } from '../theme';
import { LoadingSurface } from './LoadingSurface';

export type IgWebViewHandle = {
  /** Returns false when there is nothing to go back to. */
  goBack: () => boolean;
  navigate: (path: string) => void;
  /** Opens Instagram's own account menu, or says it is not on this screen. */
  openAccountMenu: () => void;
  /** Opens your own profile, asking the page for the handle when it is unknown. */
  openProfile: () => void;
  pushSettings: (settings: Settings) => void;
  reload: () => void;
  /** Drops the WebView's shared resource cache (used on sign-out). */
  clearCache: (includeDiskFiles: boolean) => void;
};

type Props = {
  settings: Settings;
  onRoute: (path: string, layout: Layout, pinId: string | null, tab: TabId | null) => void;
  onBlocked: (reason: string, path: string) => void;
  onAccount: (username: string | null, signedIn: boolean) => void;
  /** Unread DMs, as a count only. */
  onUnread: (count: number) => void;
  onStories: (stories: StoryRing[]) => void;
  onStoryRequest: (user: string) => void;
  storyUser: string | null;
  storyUsers: string[];
  bottomInset: number;
  onLoadingChange: (loading: boolean) => void;
  /**
   * Something the user tried that this app cannot do, in a sentence worth
   * reading. Distinct from `onBlocked`: not a route rule, so it is always shown.
   */
  onNotice: (message: string) => void;
  /** Changing the nonce navigates to `path`. */
  navigateTarget: { path: string; nonce: number } | null;
  initialPin?: string | null;
};

/**
 * Paths Instagram serves while you are not signed in. Anywhere Facebook reached
 * from one of these is a sign-in attempt.
 */
const LOGIN_PAGE = /^\/accounts\/(login|signup|emailsignup|password|oauth|onetap)|^\/challenge(\/|$)/;

const FACEBOOK_NOTICE = 'Directly doesn’t open Facebook pages.';

const FACEBOOK_SIGN_IN_NOTICE =
  'Facebook sign-in can’t finish in Directly — use your Instagram username and password.';

/** The imperative methods this app uses. */
type WebViewCommands = {
  goBack: () => void;
  reload: () => void;
  injectJavaScript: (script: string) => void;
  clearCache?: (includeDiskFiles: boolean) => void;
};

/**
 * react-native-webview's published types declare the component as a plain
 * FunctionComponent, so `ref` is not part of its props even though every
 * platform build forwards one. Widening it here (once) keeps the rest of the app
 * fully typed instead of sprinkling casts through the component.
 */
const TypedWebView = WebView as unknown as React.ComponentType<
  React.ComponentProps<typeof WebView> & { ref?: React.Ref<WebViewCommands> }
>;

export const IgWebView = forwardRef<IgWebViewHandle, Props>(function IgWebView(
  {
    settings,
    onRoute,
    onBlocked,
    onAccount,
    onUnread,
    onStories,
    onStoryRequest,
    storyUser,
    storyUsers,
    bottomInset,
    onLoadingChange,
    onNotice,
    navigateTarget,
    initialPin = null,
  },
  ref,
) {
  const webRef = useRef<WebViewCommands | null>(null);
  const lastPath = useRef<string>(INBOX_PATH);
  const pinRef = useRef<string | null>(initialPin);
  const storyRef = useRef<string | null>(storyUser);
  storyRef.current = storyUser;
  const storyUsersRef = useRef(storyUsers);
  storyUsersRef.current = storyUsers;
  const settingsRef = useRef<Settings>(settings);
  // Every load, not just the first: a tab tap is a full document load, and
  // Instagram paints its own logo before its app hydrates. Our surface has to be
  // on top of that from the first frame.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const navigate = useCallback((path: string) => {
    webRef.current?.injectJavaScript(navigateMessage(path));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      goBack: () => {
        // The WebView's own history is the only back stack; the host cannot ask
        // "canGoBack" synchronously, so the caller treats false as "at the root".
        webRef.current?.goBack();
        return normalizePath(lastPath.current) !== normalizePath(INBOX_PATH);
      },
      navigate,
      openAccountMenu: () => {
        webRef.current?.injectJavaScript(accountMenuMessage());
      },
      openProfile: () => {
        webRef.current?.injectJavaScript(openProfileMessage());
      },
      pushSettings: (next: Settings) => {
        webRef.current?.injectJavaScript(settingsMessage(next));
      },
      reload: () => {
        setLoading(true);
        webRef.current?.reload();
      },
      clearCache: (includeDiskFiles: boolean) => {
        webRef.current?.clearCache?.(includeDiskFiles);
      },
    }),
    [navigate],
  );

  useEffect(() => {
    if (!navigateTarget) return;
    navigate(navigateTarget.path);
  }, [navigateTarget, navigate]);

  /**
   * Layer 1 of the route guard: a full document load. SPA navigation never
   * reaches this — the injected core handles those before they render.
   */
  const onShouldStartLoadWithRequest = useCallback(
    // `isTopFrame` is sent with every request but only declared on the package's
    // private `ShouldStartLoadRequest`, which the root entry point does not
    // export. Widened here, once, rather than casting at the use.
    (request: WebViewNavigation & { isTopFrame?: boolean }) => {
      const { url } = request;
      if (url === 'about:blank') return true;

      // A subframe is not the page the user is looking at. Instagram loads its
      // Meta tracking pixel (`facebook.com/tr`, an iframe) on almost every page,
      // and handing that to Safari opened the browser at random while reading
      // DMs. Routes and outbound links are about the top frame only; a subframe
      // is left to load or fail on its own.
      if (request.isTopFrame === false) {
        logEvent('frame', shortUrl(url));
        return true;
      }

      const target = classifyLink(url);

      // Facebook, whichever of its URLs it is. Never Safari: there the sign-in
      // would complete in a browser this WebView cannot see, so the button looks
      // dead and tapping it again loops — that is the redirect being fixed.
      // Our script also has no business running on facebook.com: its route rules
      // redirect with a relative path, which would land on facebook.com. So it is
      // refused here, with the reason said out loud.
      const onSignInPage = LOGIN_PAGE.test(lastPath.current);
      if (target.kind === 'meta-login' || isMetaHost(target.url)) {
        logEvent('meta', shortUrl(target.url));
        onNotice(onSignInPage ? FACEBOOK_SIGN_IN_NOTICE : FACEBOOK_NOTICE);
        return false;
      }

      if (target.kind === 'invalid') {
        logEvent('refuse', shortUrl(url));
        return false;
      }

      if (target.kind === 'external') {
        logEvent('browser', shortUrl(target.url));
        void Linking.openURL(target.url).catch(() => undefined);
        return false;
      }

      // Instagram's link shim wraps an outbound URL; navigate to the unwrapped
      // destination so the route rules judge what is really being opened.
      if (target.unwrapped) {
        const viaShim = hostVerdict(
          target.url,
          { settings: settingsRef.current, loggedIn: true, pinId: pinRef.current, storyUser: storyRef.current, storyUsers: storyUsersRef.current },
          lastPath.current,
        );
        if (viaShim.action === 'block') {
          logEvent('block', `${shortUrl(target.url)} ${viaShim.reason}`);
          onBlocked(viaShim.reason, viaShim.path);
          navigate(INBOX_PATH);
        } else {
          logEvent('shim', normalizePath(target.url));
          navigate(normalizePath(target.url));
        }
        return false;
      }

      const decision = hostVerdict(
        url,
        { settings: settingsRef.current, loggedIn: true, pinId: pinRef.current, storyUser: storyRef.current, storyUsers: storyUsersRef.current },
        lastPath.current,
      );

      if (decision.action === 'block') {
        logEvent('block', `${shortUrl(url)} ${decision.reason}`);
        onBlocked(decision.reason, decision.path);
        navigate(INBOX_PATH);
        return false;
      }
      logEvent('allow', shortUrl(url));
      return true;
    },
    [navigate, onBlocked, onNotice],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = readPageMessage(event.nativeEvent.data);
      if (!message) return;

      switch (message.type) {
        case 'di:url': {
          lastPath.current = message.path;
          pinRef.current = message.pinId;
          logEvent('route', message.path);
          onRoute(message.path, message.layout, message.pinId, tabForPath(message.path));
          break;
        }
        case 'di:tab': {
          logEvent('tab', message.tab ?? 'none');
          onRoute(lastPath.current, 'mobile', pinRef.current, message.tab);
          break;
        }
        case 'di:blocked': {
          logEvent('page-block', `${message.path} ${message.reason}`);
          onBlocked(message.reason, message.path);
          break;
        }
        case 'di:account': {
          logEvent('account', message.signedIn ? `@${message.username ?? 'unknown'}` : 'signed out');
          onAccount(message.username, message.signedIn);
          break;
        }
        case 'di:story': {
          if (message.user && !storyUserForPath(lastPath.current)) onStoryRequest(message.user);
          break;
        }
        case 'di:stories': { onStories(message.stories); break; }
        case 'di:unread': {
          logEvent('unread', String(message.count));
          onUnread(message.count);
          break;
        }
        default:
          break;
      }
    },
    [onAccount, onBlocked, onRoute, onUnread, onStories, onStoryRequest],
  );

  const injectedBeforeLoad = injectionScript(inpageScript, {
    host: 'ios',
    showNav: false,
    settings,
    initialPin: pinRef.current,
    initialStoryUser: storyUser,
    initialStoryUsers: storyUsers,
  });

  // After load: re-apply the latest settings *and* pin. This covers the case
  // where the user changed a setting while a page was loading, and it is the
  // recovery path if `injectedJavaScriptBeforeContentLoaded` was skipped.
  const injectedAfterLoad = `${settingsMessage(settings)} true;`;

  return (
    <View style={styles.container}>
      <TypedWebView
        ref={webRef}
        source={{ uri: `https://www.instagram.com${INBOX_PATH}` }}
        injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
        injectedJavaScript={injectedAfterLoad}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onMessage={onMessage}
        onLoadStart={(event) => {
          logEvent('load', shortUrl(event.nativeEvent.url));
          setLoading(true);
          onLoadingChange(true);
        }}
        onLoadEnd={() => {
          onLoadingChange(false);
          setLoading(false);
        }}
        // A failed load used to show as a blank surface and nothing else. The
        // text is the platform's, never page content.
        onError={(event) => {
          logEvent('load-error', (event.nativeEvent.description || '').slice(0, 80));
        }}
        onNavigationStateChange={(nav) => {
          if (!nav.loading && nav.url?.includes('instagram.com')) {
            // React Native has no complete URL polyfill; the shared normaliser is
            // also what the guard uses, so the two agree exactly.
            lastPath.current = normalizePath(nav.url);
          }
        }}
        // Keep the session in the WebView's own cookie store. We never read it.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures
        // Numeric form on purpose: iOS also accepts the string "normal", but
        // Android's generated binding casts this prop straight to Double and
        // throws "String cannot be cast to Double" while creating the view.
        decelerationRate={0.998}
        contentInsetAdjustmentBehavior="never"
        contentInset={{ top: 0, left: 0, right: 0, bottom: bottomInset }}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}        containerStyle={styles.webview}
      />
      <LoadingSurface visible={loading} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  webview: { flex: 1, backgroundColor: colors.bg },
});
