import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = relative =>
  readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('both native origins bind only ephemeral IPv4 loopback with capabilities', async () => {
  const [android, ios] = await Promise.all([
    read(
      'android/app/src/main/java/org/sagemath/sagejs/SageRuntimeOriginServer.kt',
    ),
    read('ios/SageJSMobile/SageRuntimeOrigin.swift'),
  ]);
  for (const source of [android, ios]) {
    assert.match(source, /127\.0\.0\.1/);
    assert.match(source, /SecureRandom|SecRandomCopyBytes/);
    assert.match(source, /32/);
    assert.match(source, /productionIdentity/);
    assert.match(source, /asset-manifest\.json/);
    assert.match(source, /production-manifest\.json/);
    assert.match(source, /build-receipt\.json/);
    assert.doesNotMatch(
      source,
      /0\.0\.0\.0|localhost|https?:\/\/(?!127\.0\.0\.1)/,
    );
  }
});

test('native origins enforce isolation, CSP, MIME, traversal, and lifecycle policy', async () => {
  const [android, ios, webView] = await Promise.all([
    read(
      'android/app/src/main/java/org/sagemath/sagejs/SageRuntimeOriginServer.kt',
    ),
    read('ios/SageJSMobile/SageRuntimeOrigin.swift'),
    read('src/runtime/RuntimeWebView.tsx'),
  ]);
  for (const source of [android, ios]) {
    for (const expected of [
      'Cross-Origin-Opener-Policy',
      'Cross-Origin-Embedder-Policy',
      'Cross-Origin-Resource-Policy',
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'wasm-unsafe-eval',
      "connect-src 'self'",
      'application/wasm',
      'text/javascript',
      'no-store',
      'immutable',
    ])
      assert.match(
        source,
        new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    assert.match(source, /\.\.|contains\('\\\\'\)|contains\("\\\\"\)/);
    assert.match(source, /fun stop|func stop/);
  }
  assert.match(webView, /originWhitelist=\{\['http:\/\/127\.0\.0\.1:\*'\]\}/);
  assert.match(webView, /allowFileAccess=\{false\}/);
  assert.match(webView, /stopRuntimeOrigin/);
  assert.doesNotMatch(
    webView,
    /file:\/\/|allowUniversalAccessFromFileURLs=\{true\}/,
  );
});

test('Android cleartext exception is loopback-only and has no storage permission', async () => {
  const [manifest, security] = await Promise.all([
    read('android/app/src/main/AndroidManifest.xml'),
    read('android/app/src/main/res/xml/network_security_config.xml'),
  ]);
  assert.match(manifest, /android.permission.INTERNET/);
  assert.match(manifest, /tools:node="remove"/);
  assert.match(security, /<base-config cleartextTrafficPermitted="false"/);
  assert.match(security, /<domain[^>]*>127\.0\.0\.1<\/domain>/);
  assert.doesNotMatch(
    security,
    /0\.0\.0\.0|localhost|includeSubdomains="true"/,
  );
});
