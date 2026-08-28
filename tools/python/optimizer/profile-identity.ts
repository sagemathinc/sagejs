import { createHash } from "node:crypto";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

type CanonicalRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type ProfileSourceIdentity = Readonly<{
  schema: "sagejs.optimizer-source-unit/v1";
  id: string;
  path: string;
  digest: string;
  language: string;
}>;

export type ProfileFunctionIdentity = Readonly<{
  schema: "sagejs.optimizer-function-identity/v1";
  id: string;
  sourceUnitId: string;
  qualifiedName: string;
  kind: string;
  semanticFingerprint: string;
  range: CanonicalRange;
  ordinal: number;
}>;

export type ProfileRegionIdentity = Readonly<{
  schema: "sagejs.optimizer-region-identity/v1";
  id: string;
  functionId: string;
  kind: string;
  semanticFingerprint: string;
  range: CanonicalRange;
  ordinal: number;
}>;

type IdentityFoundation = {
  semanticFingerprint(value: unknown): string;
  sourceUnitIdentity(value: Omit<ProfileSourceIdentity, "schema" | "id">): ProfileSourceIdentity;
  functionIdentity(value: Omit<ProfileFunctionIdentity, "schema" | "id">): ProfileFunctionIdentity;
  semanticRegionIdentity(value: Omit<ProfileRegionIdentity, "schema" | "id">): ProfileRegionIdentity;
};

// This Node-only adapter intentionally consumes the campaign foundation's
// canonical identity implementation rather than growing a profiler-specific
// identity dialect. TypeScript output lives in dist/tools/python/optimizer.
const identityFoundation = require(
  resolve(__dirname, "../../../..", "tools", "optimizer-development", "identity.cjs"),
) as IdentityFoundation;

export const profileSemanticFingerprint = identityFoundation.semanticFingerprint;
export const makeProfileFunctionIdentity = identityFoundation.functionIdentity;
export const makeProfileRegionIdentity = identityFoundation.semanticRegionIdentity;

export function profileSha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function slash(value: string): string {
  return value.split(sep).join("/").replaceAll("\\", "/");
}

/** Stable display/provenance path. Absolute build roots never enter identity. */
export function normalizedProfilePath(
  filename: string,
  repositoryRoot = process.cwd(),
): string {
  if (filename.startsWith("<") && filename.endsWith(">")) return filename;
  const root = resolve(repositoryRoot);
  const absolute = isAbsolute(filename) ? resolve(filename) : resolve(root, filename);
  const local = relative(root, absolute);
  if (local === "") return "<repository-root>";
  if (!local.startsWith("..") && !isAbsolute(local)) return slash(local);
  return `<external>/${basename(absolute)}`;
}

export function makeProfileSourceIdentity(
  source: string,
  filename: string,
  repositoryRoot = process.cwd(),
  language = "python",
): ProfileSourceIdentity {
  return identityFoundation.sourceUnitIdentity({
    path: normalizedProfilePath(filename, repositoryRoot),
    digest: profileSha256(source),
    language,
  });
}

function canonicalId(value: unknown, schema: string): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as { schema?: unknown; id?: unknown };
  return item.schema === schema && typeof item.id === "string" && /^sha256:[a-f0-9]{64}$/.test(item.id);
}

export function validProfileSourceIdentity(value: unknown): value is ProfileSourceIdentity {
  if (!canonicalId(value, "sagejs.optimizer-source-unit/v1")) return false;
  const item = value as ProfileSourceIdentity;
  return typeof item.path === "string" && /^[a-f0-9]{64}$/.test(item.digest) &&
    typeof item.language === "string" && item.language.length > 0;
}

export function validProfileFunctionIdentity(value: unknown): value is ProfileFunctionIdentity {
  if (!canonicalId(value, "sagejs.optimizer-function-identity/v1")) return false;
  const item = value as ProfileFunctionIdentity;
  return /^sha256:[a-f0-9]{64}$/.test(item.sourceUnitId) &&
    typeof item.qualifiedName === "string" && typeof item.kind === "string" &&
    typeof item.semanticFingerprint === "string" && validRange(item.range) &&
    Number.isSafeInteger(item.ordinal) && item.ordinal >= 0;
}

export function validProfileRegionIdentity(value: unknown): value is ProfileRegionIdentity {
  if (!canonicalId(value, "sagejs.optimizer-region-identity/v1")) return false;
  const item = value as ProfileRegionIdentity;
  return /^sha256:[a-f0-9]{64}$/.test(item.functionId) && typeof item.kind === "string" &&
    typeof item.semanticFingerprint === "string" && validRange(item.range) &&
    Number.isSafeInteger(item.ordinal) && item.ordinal >= 0;
}

function validRange(range: unknown): range is CanonicalRange {
  if (range === null || typeof range !== "object" || Array.isArray(range)) return false;
  const item = range as CanonicalRange;
  return [item.startLine, item.startColumn, item.endLine, item.endColumn]
    .every((entry) => Number.isSafeInteger(entry) && entry >= 0) &&
    item.startLine >= 1 && item.endLine >= item.startLine;
}
