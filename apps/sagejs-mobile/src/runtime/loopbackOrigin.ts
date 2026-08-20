import { NativeModules, Platform } from 'react-native';

export interface RuntimeOriginDescription {
  url: string;
  root: string;
  origin: string;
  productionIdentity: string;
}

interface RuntimeOriginNativeModule {
  start(): Promise<RuntimeOriginDescription>;
  stop(): Promise<void>;
}

const nativeOrigin = NativeModules.SageRuntimeOrigin as
  | RuntimeOriginNativeModule
  | undefined;

function moduleOrThrow(): RuntimeOriginNativeModule {
  if (!nativeOrigin) {
    throw new Error(
      `SageRuntimeOrigin is unavailable on ${Platform.OS}; refusing to load unverified or remote runtime assets`,
    );
  }
  return nativeOrigin;
}

export async function startRuntimeOrigin(): Promise<RuntimeOriginDescription> {
  const description = await moduleOrThrow().start();
  const parsed = new URL(description.url);
  const root = new URL(description.root);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    root.origin !== parsed.origin ||
    !parsed.href.startsWith(root.href) ||
    parsed.pathname === root.pathname
  ) {
    await moduleOrThrow().stop();
    throw new Error('native runtime origin returned an unsafe URL');
  }
  return description;
}

export async function stopRuntimeOrigin(): Promise<void> {
  await moduleOrThrow().stop();
}
