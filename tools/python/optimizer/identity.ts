import { SourceRegion } from "./types";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

/** Stable non-security fingerprint for deterministic IR/cache identities. */
export function semanticFingerprint(value: unknown): string {
  const text = canonical(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash ^= BigInt(code & 0xff);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    hash ^= BigInt(code >>> 8);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function stableRegionIdentity(
  passId: string,
  source: SourceRegion,
  semanticStructure: unknown,
): { id: string; fingerprint: string } {
  const fingerprint = semanticFingerprint(semanticStructure);
  return {
    id: `${passId}@${source.filename}:${source.line}:${source.column}#${fingerprint}`,
    fingerprint,
  };
}
