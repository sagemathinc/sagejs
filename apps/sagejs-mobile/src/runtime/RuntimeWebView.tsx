import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { MainBundlePath } from '@dr.pogodin/react-native-fs';
import { Platform, StyleSheet } from 'react-native';
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';

const PortableWebView = WebView as unknown as React.ComponentType<
  Record<string, unknown> & { ref?: React.Ref<WebView> }
>;

import {
  decodeWebMessage,
  encodeNativeMessage,
  type RuntimeSettings,
  type ShareRequestPayload,
  type WorksheetSnapshot,
} from '../bridge/protocol';
import { isAllowedRuntimeNavigation } from '../bridge/navigation';

export interface RuntimeWebViewHandle {
  interrupt(): void;
  reset(): void;
  loadWorksheet(worksheet: WorksheetSnapshot): void;
  updateSettings(settings: RuntimeSettings): void;
  updateLifecycle(
    state: 'active' | 'inactive' | 'background',
    shouldInterrupt: boolean,
  ): void;
}

interface Props {
  worksheet: WorksheetSnapshot;
  settings: RuntimeSettings;
  lifecycle: 'active' | 'inactive' | 'background';
  onWorksheetChanged(source: string, revision: number): void;
  onShareRequest(payload: ShareRequestPayload): void;
  onRuntimeReady(assetVersion: string): void;
  onRuntimeError(message: string): void;
  onProcessRecovery(): void;
}

function runtimeLocation() {
  if (Platform.OS === 'android') {
    return {
      uri: 'file:///android_asset/runtime/index.html',
      root: 'file:///android_asset/runtime/',
      readAccess: undefined,
    };
  }
  const bundle = MainBundlePath ?? '';
  return {
    uri: `file://${bundle}/runtime/index.html`,
    root: `file://${bundle}/runtime/`,
    readAccess: `file://${bundle}/runtime/`,
  };
}

export const RuntimeWebView = forwardRef<RuntimeWebViewHandle, Props>(
  function RuntimeWebViewComponent(props, forwardedRef) {
    const webView = useRef<WebView>(null);
    const location = useMemo(runtimeLocation, []);
    const capability = useMemo(createBridgeCapability, []);
    const post = useCallback((message: string) => {
      webView.current?.postMessage(message);
    }, []);

    useImperativeHandle(
      forwardedRef,
      () => ({
        interrupt: () =>
          post(encodeNativeMessage('runtime.interrupt', {}, capability)),
        reset: () => post(encodeNativeMessage('runtime.reset', {}, capability)),
        loadWorksheet: worksheet =>
          post(encodeNativeMessage('worksheet.load', worksheet, capability)),
        updateSettings: settings =>
          post(encodeNativeMessage('settings.apply', settings, capability)),
        updateLifecycle: (state, shouldInterrupt) =>
          post(
            encodeNativeMessage(
              'lifecycle.changed',
              { state, shouldInterrupt },
              capability,
            ),
          ),
      }),
      [capability, post],
    );

    const onMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const result = decodeWebMessage(event.nativeEvent.data, capability);
        if (!result.ok) {
          props.onRuntimeError(
            `Rejected runtime bridge message: ${result.error}`,
          );
          return;
        }
        const { message } = result;
        if (message.type === 'runtime.ready') {
          props.onRuntimeReady(message.payload.assetVersion);
          post(
            encodeNativeMessage(
              'host.bootstrap',
              {
                worksheet: props.worksheet,
                settings: props.settings,
                lifecycle: props.lifecycle,
              },
              capability,
            ),
          );
        } else if (message.type === 'worksheet.changed') {
          if (message.payload.id === props.worksheet.id) {
            props.onWorksheetChanged(
              message.payload.source,
              message.payload.revision,
            );
          }
        } else if (message.type === 'share.request') {
          props.onShareRequest(message.payload);
        } else if (message.type === 'runtime.error') {
          props.onRuntimeError(message.payload.message);
        }
      },
      [capability, post, props],
    );

    const shouldStart = useCallback(
      (request: WebViewNavigation) =>
        isAllowedRuntimeNavigation(request.url, location.root),
      [location.root],
    );

    return (
      <PortableWebView
        ref={webView}
        style={styles.webView}
        source={{ uri: location.uri }}
        injectedJavaScriptBeforeContentLoaded={`Object.defineProperty(globalThis, '__SAGEJS_MOBILE_BRIDGE_CAPABILITY__', {value: ${JSON.stringify(
          capability,
        )}, configurable: true}); true;`}
        originWhitelist={['file://*']}
        allowingReadAccessToURL={location.readAccess}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs={false}
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        domStorageEnabled={false}
        cacheEnabled
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        onShouldStartLoadWithRequest={shouldStart}
        onMessage={onMessage}
        onContentProcessDidTerminate={props.onProcessRecovery}
        onRenderProcessGone={() => {
          props.onProcessRecovery();
          return true;
        }}
        accessibilityLabel="Sage.js offline worksheet runtime"
        testID="sagejs-runtime-webview"
      />
    );
  },
);

const styles = StyleSheet.create({
  webView: { flex: 1, backgroundColor: '#fbfbf8' },
});

function createBridgeCapability(): string {
  const cryptoProvider = (
    globalThis as unknown as {
      crypto?: { getRandomValues?: (values: Uint32Array) => Uint32Array };
    }
  ).crypto;
  if (!cryptoProvider?.getRandomValues) {
    throw new Error(
      'secure random values are unavailable; refusing to create a native bridge',
    );
  }
  const words = cryptoProvider.getRandomValues(new Uint32Array(8));
  return Array.from(words, word => word.toString(16).padStart(8, '0')).join('');
}
