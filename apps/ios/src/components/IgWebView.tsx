import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import {
  INBOX_PATH,
  hostVerdict,
  normalizePath,
  tabForPath,
  type Layout,
  type Settings,
  type TabId,
} from '@directly/core';

import { injectionScript, navigateMessage, readPageMessage, settingsMessage } from '../lib/bridge';
import { inpageScript } from '../lib/injectedScript';
import { colors } from '../theme';

export type IgWebViewHandle = {
  /** Returns false when there is nothing to go back to. */
  goBack: () => boolean;
  navigate: (path: string) => void;
  pushSettings: (settings: Settings) => void;
  reload: () => void;
  /** Drops the WebView's shared resource cache (used on sign-out). */
  clearCache: (includeDiskFiles: boolean) => void;
};

type Props = {
  settings: Settings;
  onRoute: (path: string, layout: Layout, pinId: string | null, tab: TabId | null) => void;
  onBlocked: (reason: string, path: string) => void;
  onAccount: (username: string | null) => void;
  onLoadingChange: (loading: boolean) => void;
  /** Changing the nonce navigates to `path`. */
  navigateTarget: { path: string; nonce: number } | null;
  initialPin?: string | null;
};

const INSTAGRAM_HOST = /^https:\/\/(www\.)?instagram\.com(\/|$)/i;

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
  { settings, onRoute, onBlocked, onAccount, onLoadingChange, navigateTarget, initialPin = null },
  ref,
) {
  const webRef = useRef<WebViewCommands | null>(null);
  const lastPath = useRef<string>(INBOX_PATH);
  const pinRef = useRef<string | null>(initialPin);
  const settingsRef = useRef<Settings>(settings);
  const [firstPaint, setFirstPaint] = useState(false);

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
        return lastPath.current !== INBOX_PATH;
      },
      navigate,
      pushSettings: (next: Settings) => {
        webRef.current?.injectJavaScript(settingsMessage(next));
      },
      reload: () => {
        setFirstPaint(false);
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
    (request: WebViewNavigation) => {
      const { url } = request;
      if (url === 'about:blank') return true;

      if (!INSTAGRAM_HOST.test(url)) {
        void Linking.openURL(url).catch(() => undefined);
        return false;
      }

      const decision = hostVerdict(
        url,
        { settings: settingsRef.current, loggedIn: true, pinId: pinRef.current },
        lastPath.current,
      );

      if (decision.action === 'block') {
        onBlocked(decision.reason, decision.path);
        navigate(INBOX_PATH);
        return false;
      }
      return true;
    },
    [navigate, onBlocked],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = readPageMessage(event.nativeEvent.data);
      if (!message) return;

      switch (message.type) {
        case 'di:url': {
          lastPath.current = message.path;
          pinRef.current = message.pinId;
          onRoute(message.path, message.layout, message.pinId, tabForPath(message.path));
          break;
        }
        case 'di:tab': {
          onRoute(lastPath.current, 'mobile', pinRef.current, message.tab);
          break;
        }
        case 'di:blocked': {
          onBlocked(message.reason, message.path);
          break;
        }
        case 'di:account': {
          onAccount(message.username);
          break;
        }
        default:
          break;
      }
    },
    [onAccount, onBlocked, onRoute],
  );

  const injectedBeforeLoad = injectionScript(inpageScript, {
    host: 'ios',
    showNav: false,
    settings,
    initialPin: pinRef.current,
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
        onLoadStart={() => onLoadingChange(true)}
        onLoadEnd={() => {
          onLoadingChange(false);
          setFirstPaint(true);
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
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}        containerStyle={styles.webview}
      />
      {!firstPaint ? (
        <View style={styles.skeleton} pointerEvents="none">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  webview: { flex: 1, backgroundColor: colors.bg },
  skeleton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
