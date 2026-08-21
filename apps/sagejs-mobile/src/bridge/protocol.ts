export const MOBILE_BRIDGE_PROTOCOL = 1 as const;
export const MAX_BRIDGE_MESSAGE_BYTES = 2 * 1024 * 1024;
export const MAX_WORKSHEET_SOURCE_BYTES = 1024 * 1024;

type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export type Appearance = 'system' | 'light' | 'dark';

export interface RuntimeSettings {
  appearance: Appearance;
  evaluationTimeoutMs: number;
  memoryTargetMiB: number;
  autoInterruptOnBackground: boolean;
}

export interface WorksheetSnapshot {
  id: string;
  title: string;
  source: string;
  revision: number;
}

export type WebToNativeMessage =
  | BridgeMessage<'runtime.ready', RuntimeReadyPayload>
  | BridgeMessage<'runtime.telemetry', RuntimeTelemetryPayload>
  | BridgeMessage<'worksheet.changed', WorksheetChangedPayload>
  | BridgeMessage<'share.request', ShareRequestPayload>
  | BridgeMessage<'runtime.error', RuntimeErrorPayload>;

export type NativeToWebMessage =
  | BridgeMessage<'host.bootstrap', HostBootstrapPayload>
  | BridgeMessage<'worksheet.load', WorksheetSnapshot>
  | BridgeMessage<'runtime.interrupt', Record<string, never>>
  | BridgeMessage<'runtime.reset', Record<string, never>>
  | BridgeMessage<'lifecycle.changed', LifecyclePayload>
  | BridgeMessage<'settings.apply', RuntimeSettings>;

export interface BridgeMessage<T extends string, P> {
  protocol: typeof MOBILE_BRIDGE_PROTOCOL;
  capability: string;
  id: string;
  type: T;
  payload: P;
}

export interface RuntimeReadyPayload {
  engineVersion: string;
  assetVersion: string;
  assetOrigin: 'loopback-http';
  assetScheme: 'http';
  assetHost: '127.0.0.1';
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  workerTopology: {
    outer: 'dedicated-module-worker';
    compiler: 'nested-module-worker';
  };
  capabilities: string[];
}

export interface RuntimeTelemetryPayload {
  event: 'startup' | 'evaluation' | 'interrupt' | 'plot';
  durationMs: number;
  details?: Record<string, JsonValue>;
}

export interface WorksheetChangedPayload {
  id: string;
  source: string;
  revision: number;
}

export interface ShareRequestPayload {
  kind: 'sage-source' | 'plot-json' | 'data-json';
  suggestedName: string;
  content: string;
}

export interface RuntimeErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface HostBootstrapPayload {
  worksheet: WorksheetSnapshot;
  settings: RuntimeSettings;
  lifecycle: 'active' | 'inactive' | 'background';
}

export interface LifecyclePayload {
  state: 'active' | 'inactive' | 'background';
  shouldInterrupt: boolean;
}

type DecodeResult =
  | { ok: true; message: WebToNativeMessage }
  | { ok: false; error: string };

const WEB_MESSAGE_TYPES = new Set([
  'runtime.ready',
  'runtime.telemetry',
  'worksheet.changed',
  'share.request',
  'runtime.error',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && utf8ByteLength(value) <= maximum;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes > MAX_BRIDGE_MESSAGE_BYTES) return bytes;
  }
  return bytes;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function validEnvelope(value: Record<string, unknown>): boolean {
  return (
    value.protocol === MOBILE_BRIDGE_PROTOCOL &&
    isSafeString(value.capability, 256) &&
    isSafeString(value.id, 128) &&
    typeof value.type === 'string' &&
    WEB_MESSAGE_TYPES.has(value.type) &&
    isObject(value.payload) &&
    hasOnlyKeys(value, ['protocol', 'capability', 'id', 'type', 'payload'])
  );
}

function validPayload(type: string, payload: Record<string, unknown>): boolean {
  if (type === 'runtime.ready') {
    return (
      hasOnlyKeys(payload, [
        'engineVersion',
        'assetVersion',
        'assetOrigin',
        'assetScheme',
        'assetHost',
        'crossOriginIsolated',
        'sharedArrayBuffer',
        'workerTopology',
        'capabilities',
      ]) &&
      isSafeString(payload.engineVersion, 128) &&
      isSafeString(payload.assetVersion, 128) &&
      payload.assetOrigin === 'loopback-http' &&
      payload.assetScheme === 'http' &&
      payload.assetHost === '127.0.0.1' &&
      typeof payload.crossOriginIsolated === 'boolean' &&
      typeof payload.sharedArrayBuffer === 'boolean' &&
      isObject(payload.workerTopology) &&
      hasOnlyKeys(payload.workerTopology, ['outer', 'compiler']) &&
      payload.workerTopology.outer === 'dedicated-module-worker' &&
      payload.workerTopology.compiler === 'nested-module-worker' &&
      !Object.values(payload).some(
        value => typeof value === 'string' && value.includes('/'),
      ) &&
      Array.isArray(payload.capabilities) &&
      payload.capabilities.length <= 512 &&
      payload.capabilities.every(value => isSafeString(value, 128))
    );
  }
  if (type === 'runtime.telemetry') {
    return (
      hasOnlyKeys(payload, ['event', 'durationMs', 'details']) &&
      ['startup', 'evaluation', 'interrupt', 'plot'].includes(
        String(payload.event),
      ) &&
      typeof payload.durationMs === 'number' &&
      Number.isFinite(payload.durationMs) &&
      payload.durationMs >= 0 &&
      (payload.details === undefined || isObject(payload.details))
    );
  }
  if (type === 'worksheet.changed') {
    return (
      hasOnlyKeys(payload, ['id', 'source', 'revision']) &&
      isSafeString(payload.id, 128) &&
      isSafeString(payload.source, MAX_WORKSHEET_SOURCE_BYTES) &&
      Number.isSafeInteger(payload.revision) &&
      Number(payload.revision) >= 0
    );
  }
  if (type === 'share.request') {
    return (
      hasOnlyKeys(payload, ['kind', 'suggestedName', 'content']) &&
      ['sage-source', 'plot-json', 'data-json'].includes(
        String(payload.kind),
      ) &&
      isSafeString(payload.suggestedName, 160) &&
      !String(payload.suggestedName).includes('/') &&
      !String(payload.suggestedName).includes('\\') &&
      isSafeString(payload.content, MAX_BRIDGE_MESSAGE_BYTES)
    );
  }
  if (type === 'runtime.error') {
    return (
      hasOnlyKeys(payload, ['code', 'message', 'recoverable']) &&
      isSafeString(payload.code, 128) &&
      isSafeString(payload.message, 4096) &&
      typeof payload.recoverable === 'boolean'
    );
  }
  return false;
}

export function decodeWebMessage(
  raw: string,
  expectedCapability: string,
): DecodeResult {
  if (
    typeof raw !== 'string' ||
    utf8ByteLength(raw) > MAX_BRIDGE_MESSAGE_BYTES
  ) {
    return { ok: false, error: 'bridge message exceeds the 2 MiB limit' };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'bridge message is not valid JSON' };
  }
  if (!isObject(value) || !validEnvelope(value)) {
    return { ok: false, error: 'unsupported bridge envelope' };
  }
  if (value.capability !== expectedCapability) {
    return { ok: false, error: 'bridge capability mismatch' };
  }
  if (
    !validPayload(String(value.type), value.payload as Record<string, unknown>)
  ) {
    return { ok: false, error: `invalid payload for ${String(value.type)}` };
  }
  return { ok: true, message: value as unknown as WebToNativeMessage };
}

let nativeSequence = 0;

export function encodeNativeMessage<T extends NativeToWebMessage['type']>(
  type: T,
  payload: Extract<NativeToWebMessage, { type: T }>['payload'],
  capability: string,
): string {
  nativeSequence += 1;
  return JSON.stringify({
    protocol: MOBILE_BRIDGE_PROTOCOL,
    capability,
    id: `native-${nativeSequence}`,
    type,
    payload,
  });
}
