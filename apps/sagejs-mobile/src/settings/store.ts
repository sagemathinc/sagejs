import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RuntimeSettings } from '../bridge/protocol';

const SETTINGS_KEY = '@sagejs-mobile/settings/v1';

export const DEFAULT_SETTINGS: RuntimeSettings = Object.freeze({
  appearance: 'system',
  evaluationTimeoutMs: 30_000,
  memoryTargetMiB: 384,
  autoInterruptOnBackground: true,
});

export async function loadSettings(): Promise<RuntimeSettings> {
  try {
    const text = await AsyncStorage.getItem(SETTINGS_KEY);
    if (text === null) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: RuntimeSettings): Promise<void> {
  await AsyncStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(normalizeSettings(settings)),
  );
}

export function normalizeSettings(value: unknown): RuntimeSettings {
  const candidate =
    typeof value === 'object' && value !== null
      ? (value as Partial<RuntimeSettings>)
      : {};
  return {
    appearance: ['system', 'light', 'dark'].includes(
      String(candidate.appearance),
    )
      ? (candidate.appearance as RuntimeSettings['appearance'])
      : DEFAULT_SETTINGS.appearance,
    evaluationTimeoutMs: boundedNumber(
      candidate.evaluationTimeoutMs,
      1_000,
      10 * 60_000,
      DEFAULT_SETTINGS.evaluationTimeoutMs,
    ),
    memoryTargetMiB: boundedNumber(
      candidate.memoryTargetMiB,
      128,
      2_048,
      DEFAULT_SETTINGS.memoryTargetMiB,
    ),
    autoInterruptOnBackground:
      typeof candidate.autoInterruptOnBackground === 'boolean'
        ? candidate.autoInterruptOnBackground
        : DEFAULT_SETTINGS.autoInterruptOnBackground,
  };
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(minimum, Math.round(numeric)))
    : fallback;
}
