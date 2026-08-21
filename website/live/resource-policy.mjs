export const DEFAULT_LIMITS = Object.freeze({
  timeoutMs: 15_000,
  maximumTimeoutMs: 60_000,
  outputBytes: 1_000_000,
  plotBytes: 8_000_000,
  importBytes: 4_000_000,
  shareBytes: 48_000,
  savedSourceBytes: 2_000_000,
  savedSessions: 40,
});

export function utf8Size(value) {
  return new TextEncoder().encode(String(value)).byteLength;
}

export function boundedTimeout(value, limits = DEFAULT_LIMITS) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new TypeError("time limit must be a positive number");
  }
  return Math.min(Math.trunc(timeout), limits.maximumTimeoutMs);
}

export class OutputCollector {
  constructor(limit = DEFAULT_LIMITS.outputBytes) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError("output limit must be a positive safe integer");
    }
    this.limit = limit;
    this.bytes = 0;
    this.text = "";
    this.exceeded = false;
  }

  append(value) {
    if (this.exceeded) return "";
    const text = String(value);
    const bytes = new TextEncoder().encode(text);
    const available = this.limit - this.bytes;
    if (bytes.byteLength <= available) {
      this.text += text;
      this.bytes += bytes.byteLength;
      return text;
    }
    let boundary = Math.max(0, available);
    let kept = "";
    while (boundary >= Math.max(0, available - 3)) {
      try {
        kept = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, boundary));
        break;
      } catch {
        boundary -= 1;
      }
    }
    const notice = "\n\n[Output limit reached; the kernel was restarted.]\n";
    this.text += kept + notice;
    this.bytes += boundary;
    this.exceeded = true;
    return kept + notice;
  }
}

export function assertDisplayWithinLimit(display, limit = DEFAULT_LIMITS.plotBytes) {
  let encoded;
  try {
    encoded = JSON.stringify(display);
  } catch (error) {
    throw new TypeError(`plot payload is not serializable: ${error.message}`);
  }
  const bytes = utf8Size(encoded);
  if (bytes > limit) {
    throw new RangeError(`plot payload uses ${bytes} bytes; the limit is ${limit}`);
  }
  return bytes;
}
