import {
  decodeWebMessage,
  encodeNativeMessage,
  MAX_BRIDGE_MESSAGE_BYTES,
} from '../src/bridge/protocol';
import { isAllowedRuntimeNavigation } from '../src/bridge/navigation';

function webMessage(type: string, payload: unknown) {
  return JSON.stringify({
    protocol: 1,
    capability: 'secret',
    id: 'web-1',
    type,
    payload,
  });
}

test('accepts the narrow worksheet update contract', () => {
  const decoded = decodeWebMessage(
    webMessage('worksheet.changed', { id: 'w1', source: '2 + 2', revision: 3 }),
    'secret',
  );
  expect(decoded.ok).toBe(true);
});

const runtimeReady = {
  engineVersion: 'bundled',
  assetVersion: `sha256:${'a'.repeat(64)}`,
  assetOrigin: 'loopback-http',
  assetScheme: 'http',
  assetHost: '127.0.0.1',
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  workerTopology: {
    outer: 'dedicated-module-worker',
    compiler: 'nested-module-worker',
  },
  capabilities: ['offline'],
};

test('accepts loopback isolation evidence without capability-path disclosure', () => {
  const decoded = decodeWebMessage(
    webMessage('runtime.ready', runtimeReady),
    'secret',
  );
  expect(decoded.ok).toBe(true);
  expect(JSON.stringify(runtimeReady)).not.toContain('/');
});

test('rejects remote, capability-bearing, and incomplete runtime evidence', () => {
  for (const payload of [
    { ...runtimeReady, assetHost: 'localhost' },
    { ...runtimeReady, assetScheme: 'https' },
    { ...runtimeReady, assetPath: '/secret/index.html' },
    { ...runtimeReady, assetVersion: '/secret/index.html' },
    { ...runtimeReady, crossOriginIsolated: 'yes' },
    {
      ...runtimeReady,
      workerTopology: { outer: 'dedicated-module-worker' },
    },
  ]) {
    expect(
      decodeWebMessage(webMessage('runtime.ready', payload), 'secret').ok,
    ).toBe(false);
  }
});

test('rejects unknown operations, extra privilege fields, and oversized messages', () => {
  expect(
    decodeWebMessage(
      webMessage('filesystem.read', { path: '/etc/passwd' }),
      'secret',
    ).ok,
  ).toBe(false);
  expect(
    decodeWebMessage(
      JSON.stringify({
        protocol: 1,
        capability: 'secret',
        id: 'web-1',
        type: 'runtime.ready',
        payload: {},
        token: 'secret',
      }),
      'secret',
    ).ok,
  ).toBe(false);
  expect(
    decodeWebMessage('x'.repeat(MAX_BRIDGE_MESSAGE_BYTES + 1), 'secret').ok,
  ).toBe(false);
});

test('rejects path traversal in share requests', () => {
  expect(
    decodeWebMessage(
      webMessage('share.request', {
        kind: 'data-json',
        suggestedName: '../../private.json',
        content: '{}',
      }),
      'secret',
    ).ok,
  ).toBe(false);
});

test('native messages are versioned and contain no generic call operation', () => {
  expect(
    JSON.parse(encodeNativeMessage('runtime.interrupt', {}, 'secret')),
  ).toMatchObject({
    protocol: 1,
    capability: 'secret',
    type: 'runtime.interrupt',
    payload: {},
  });
});

test('rejects worker-forged messages without the per-session capability', () => {
  const forged = JSON.stringify({
    protocol: 1,
    capability: 'guessed',
    id: 'worker-forgery',
    type: 'share.request',
    payload: { kind: 'data-json', suggestedName: 'stolen.json', content: '{}' },
  });
  expect(decodeWebMessage(forged, 'native-generated-secret').ok).toBe(false);
  expect(
    decodeWebMessage(
      JSON.stringify({
        protocol: 1,
        id: 'worker-forgery',
        type: 'runtime.ready',
        payload: {},
      }),
      'native-generated-secret',
    ).ok,
  ).toBe(false);
});

test('navigation stays inside the application-owned runtime directory', () => {
  const root = 'file:///app/runtime/';
  expect(isAllowedRuntimeNavigation(`${root}index.html`, root)).toBe(true);
  expect(isAllowedRuntimeNavigation('about:blank', root)).toBe(true);
  expect(isAllowedRuntimeNavigation('https://sagejs.org/', root)).toBe(false);
  expect(isAllowedRuntimeNavigation('file:///app/private/document', root)).toBe(
    false,
  );
});
