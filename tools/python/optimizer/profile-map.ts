import {
  makeProfileFunctionIdentity,
  makeProfileRegionIdentity,
  makeProfileSourceIdentity,
  ProfileFunctionIdentity,
  ProfileRegionIdentity,
  ProfileSourceIdentity,
  profileSemanticFingerprint,
  profileSha256,
  validProfileFunctionIdentity,
  validProfileRegionIdentity,
  validProfileSourceIdentity,
} from "./profile-identity";

export const PROFILE_MAP_SCHEMA = "sagejs.optimizer-profile-map/v1";

export interface GeneratedPosition {
  line: number;
  column: number;
  offset: number;
}

export interface ProfileSpan {
  category: "function" | "method" | "loop";
  identity: ProfileFunctionIdentity | ProfileRegionIdentity;
  optimizerRegionId: string | null;
  generated: { start: GeneratedPosition; end: GeneratedPosition };
}

export interface ProfileSegmentCandidate {
  category: ProfileSpan["category"];
  identityId: string;
  functionId: string;
  regionId: string | null;
}

export interface ProfileSegment {
  generated: { start: GeneratedPosition; end: GeneratedPosition };
  mapping: {
    status: "attributed" | "ambiguous";
    candidates: ProfileSegmentCandidate[];
  };
}

export interface OptimizerProfileMap {
  schema: typeof PROFILE_MAP_SCHEMA;
  authority: "compiler-emitted-content-authenticated";
  compilerSchema: string;
  source: { identity: ProfileSourceIdentity; bytes: number };
  generated: { url: string; sha256: string; bytes: number };
  spans: readonly ProfileSpan[];
  segments: readonly ProfileSegment[];
}

type SourceRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

type PendingSpan = {
  node: any;
  start: GeneratedPosition;
  category: ProfileSpan["category"];
  identity: ProfileSpan["identity"];
  optimizerRegionId: string | null;
};

function position(value: any): GeneratedPosition {
  return {
    line: Number(value?.line ?? 0),
    column: Number(value?.column ?? 0),
    offset: Number(value?.offset ?? 0),
  };
}

function nodeType(node: any): string {
  return String(node?.constructor?.name ?? "").replace(/^AST_/, "");
}

function nodeName(node: any): string {
  return String(node?.name?.name ?? node?.name ?? "<anonymous>");
}

function sourceRange(node: any): SourceRange {
  const start = node?.start ?? {};
  const end = node?.end ?? start;
  return {
    startLine: Number(start.line ?? 0),
    startColumn: Number(start.col ?? 0),
    endLine: Number(end.line ?? start.line ?? 0),
    endColumn: Number(end.col ?? start.col ?? 0),
  };
}

export const SEMANTIC_AST_IGNORED_KEYS = Object.freeze(new Set([
  "start", "end", "scope", "thedef", "imports", "globals", "classes",
  "baselib", "filename", "optimization_ir", "optimization_region", "optimization_contract",
]));

/** Canonical, provenance-free AST meaning shared by dashboard and profiler. */
export function semanticAstDescriptor(root: unknown): unknown {
  const active = new WeakSet<object>();
  const visit = (value: any): any => {
    if (value === undefined) return { scalar: "undefined" };
    if (typeof value === "bigint") return { scalar: "bigint", value: value.toString() };
    if (typeof value === "number") {
      if (Number.isNaN(value)) return { scalar: "number", value: "NaN" };
      if (value === Infinity) return { scalar: "number", value: "+Infinity" };
      if (value === -Infinity) return { scalar: "number", value: "-Infinity" };
      if (Object.is(value, -0)) return { scalar: "number", value: "-0" };
      return value;
    }
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "function") return { scalar: "function-omitted" };
    if (typeof value !== "object") return { scalar: typeof value, value: String(value) };
    if (active.has(value)) return { scalar: "cycle-omitted" };
    active.add(value);
    let answer: unknown;
    if (Array.isArray(value)) {
      answer = value.map(visit);
    } else {
      const fields: Record<string, unknown> = {};
      for (const key of Object.keys(value).sort()) {
        if (SEMANTIC_AST_IGNORED_KEYS.has(key) || typeof value[key] === "function") continue;
        fields[key] = visit(value[key]);
      }
      const constructorName = String(value?.constructor?.name ?? "");
      answer = constructorName.startsWith("AST_")
        ? { kind: constructorName, fields }
        : { fields };
    }
    active.delete(value);
    return answer;
  };
  return visit(root);
}

export function semanticAstFingerprint(node: unknown): string {
  return profileSemanticFingerprint(semanticAstDescriptor(node));
}

function sourceSlice(sourceText: string, range: SourceRange): string {
  if (!Number.isSafeInteger(range.startLine) || range.startLine < 1 ||
      !Number.isSafeInteger(range.startColumn) || range.startColumn < 0 ||
      !Number.isSafeInteger(range.endLine) || range.endLine < range.startLine ||
      !Number.isSafeInteger(range.endColumn) || range.endColumn < 0) {
    throw new TypeError("semantic source fingerprint requires a valid source range");
  }
  const lines = sourceText.split("\n");
  const first = range.startLine - 1;
  const last = range.endLine - 1;
  if (first >= lines.length || last >= lines.length) {
    throw new RangeError("semantic source fingerprint range exceeds the source");
  }
  if (first === last) {
    return (lines[first] ?? "").slice(range.startColumn, range.endColumn);
  }
  return [
    (lines[first] ?? "").slice(range.startColumn),
    ...lines.slice(first + 1, last),
    (lines[last] ?? "").slice(0, range.endColumn),
  ].join("\n");
}

/**
 * Parser-mode-independent syntax identity for a compiler AST node.
 *
 * The enclosing source-unit identity already authenticates the complete file.
 * Hashing the exact node slice here avoids admitting lowering-, lint-, or
 * runtime-only AST metadata into identities that must join across compiler
 * modes and checkout locations.
 */
export function semanticSourceFingerprint(node: unknown, sourceText: string): string {
  const kind = semanticRegionKind(node);
  return profileSemanticFingerprint({
    kind,
    source: sourceSlice(sourceText, sourceRange(node)),
  });
}

/** Compiler-decision-independent syntax family for one semantic region. */
export function semanticRegionKind(node: unknown): string {
  const name = String((node as any)?.constructor?.name ?? "");
  if (!name.startsWith("AST_")) {
    throw new TypeError("semantic region kind requires a compiler AST node");
  }
  return name;
}

/** Key for a zero-based occurrence count among equal semantic siblings. */
export function semanticOccurrenceKey(value: {
  ownerId: string;
  qualifiedName?: string;
  kind: string;
  semanticFingerprint: string;
}): string {
  return profileSemanticFingerprint(value);
}

function spanCandidate(span: ProfileSpan): ProfileSegmentCandidate {
  const isLoop = span.category === "loop";
  return {
    category: span.category,
    identityId: span.identity.id,
    functionId: isLoop
      ? (span.identity as ProfileRegionIdentity).functionId
      : span.identity.id,
    regionId: isLoop ? span.identity.id : null,
  };
}

function disjointSegments(spans: ProfileSpan[]): ProfileSegment[] {
  const points = new Map<number, GeneratedPosition>();
  for (const span of spans) {
    points.set(span.generated.start.offset, span.generated.start);
    points.set(span.generated.end.offset, span.generated.end);
  }
  const offsets = [...points.keys()].sort((left, right) => left - right);
  const answer: ProfileSegment[] = [];
  for (let index = 0; index + 1 < offsets.length; index += 1) {
    const startOffset = offsets[index];
    const endOffset = offsets[index + 1];
    if (endOffset <= startOffset) continue;
    const active = spans.filter((span) =>
      span.generated.start.offset <= startOffset && span.generated.end.offset >= endOffset
    );
    if (active.length === 0) continue;
    const smallestWidth = Math.min(...active.map((span) =>
      span.generated.end.offset - span.generated.start.offset
    ));
    const candidates = active.filter((span) =>
      span.generated.end.offset - span.generated.start.offset === smallestWidth
    ).map(spanCandidate).sort((left, right) => left.identityId.localeCompare(right.identityId));
    answer.push(Object.freeze({
      generated: Object.freeze({
        start: Object.freeze({ ...points.get(startOffset)! }),
        end: Object.freeze({ ...points.get(endOffset)! }),
      }),
      mapping: Object.freeze({
        status: candidates.length === 1 ? "attributed" : "ambiguous",
        candidates: Object.freeze(candidates.map((candidate) => Object.freeze(candidate))),
      }),
    }) as unknown as ProfileSegment);
  }
  return answer;
}

/**
 * Cross-realm sink passed directly to the generated compiler OutputStream.
 * It records compiler-owned AST spans without exposing a mapping global to
 * evaluated Python code.
 */
export class CompilerProfileMapCollector {
  private readonly stack: Array<{
    node: any;
    scopeName?: string;
    functionIdentity?: ProfileFunctionIdentity;
    pending?: PendingSpan;
  }> = [];
  private readonly completed: Array<{ pending: PendingSpan; end: GeneratedPosition }> = [];
  private readonly functionOrdinals = new Map<string, number>();
  private readonly regionOrdinals = new Map<string, number>();
  readonly sourceIdentity: ProfileSourceIdentity;
  moduleIdentity: ProfileFunctionIdentity;

  constructor(
    private readonly sourceText: string,
    filename: string,
    repositoryRoot = process.cwd(),
    readonly compilerSchema = "sagejs-python-frontend/v1",
    language = "python",
  ) {
    this.sourceIdentity = makeProfileSourceIdentity(sourceText, filename, repositoryRoot, language);
    const lines = sourceText.split("\n");
    this.moduleIdentity = makeProfileFunctionIdentity({
      sourceUnitId: this.sourceIdentity.id,
      qualifiedName: "<module>",
      kind: "module",
      semanticFingerprint: profileSemanticFingerprint({ kind: "python.module" }),
      range: {
        startLine: 1,
        startColumn: 0,
        endLine: Math.max(1, lines.length),
        endColumn: lines.at(-1)?.length ?? 0,
      },
      ordinal: 0,
    });
  }

  push(node: any, rawStart: GeneratedPosition): void {
    const type = nodeType(node);
    if (type === "Toplevel") {
      this.moduleIdentity = makeProfileFunctionIdentity({
        sourceUnitId: this.sourceIdentity.id,
        qualifiedName: "<module>",
        kind: "module",
        semanticFingerprint: semanticSourceFingerprint(node, this.sourceText),
        range: sourceRange(node),
        ordinal: 0,
      });
    }
    const scopes = this.stack.map((entry) => entry.scopeName).filter(Boolean) as string[];
    const parentFunction = [...this.stack].reverse()
      .find((entry) => entry.functionIdentity)?.functionIdentity ?? this.moduleIdentity;
    let category: ProfileSpan["category"] | undefined;
    let scopeName: string | undefined;
    let identity: ProfileSpan["identity"] | undefined;
    if (type === "Function" || type === "Lambda" || type === "Method") {
      category = type === "Method" ? "method" : "function";
      const identityKind = type === "Lambda" || node?.is_lambda === true
        ? "lambda"
        : category;
      scopeName = nodeName(node);
      const qualifiedName = [...scopes, scopeName].join(".") || scopeName;
      const fingerprint = semanticSourceFingerprint(node, this.sourceText);
      const occurrenceKey = semanticOccurrenceKey({
        ownerId: parentFunction.id,
        qualifiedName,
        kind: identityKind,
        semanticFingerprint: fingerprint,
      });
      const ordinal = this.functionOrdinals.get(occurrenceKey) ?? 0;
      this.functionOrdinals.set(occurrenceKey, ordinal + 1);
      identity = makeProfileFunctionIdentity({
        sourceUnitId: this.sourceIdentity.id,
        qualifiedName,
        kind: identityKind,
        semanticFingerprint: fingerprint,
        range: sourceRange(node),
        ordinal,
      });
    } else if ([
      "ForIn", "AsyncFor", "ForJS", "While", "Do", "ListComprehension",
      "SetComprehension", "DictComprehension", "GeneratorComprehension",
    ].includes(type)) {
      category = "loop";
      const fingerprint = semanticSourceFingerprint(node, this.sourceText);
      const regionKind = semanticRegionKind(node);
      const occurrenceKey = semanticOccurrenceKey({
        ownerId: parentFunction.id,
        kind: regionKind,
        semanticFingerprint: fingerprint,
      });
      const ordinal = this.regionOrdinals.get(occurrenceKey) ?? 0;
      this.regionOrdinals.set(occurrenceKey, ordinal + 1);
      identity = makeProfileRegionIdentity({
        functionId: parentFunction.id,
        kind: regionKind,
        semanticFingerprint: fingerprint,
        range: sourceRange(node),
        ordinal,
      });
    } else if (type === "Class") {
      scopeName = nodeName(node);
    }
    const pending = category && identity ? {
      node,
      start: position(rawStart),
      category,
      identity,
      optimizerRegionId: typeof node?.optimization_region?.id === "string"
        ? node.optimization_region.id
        : null,
    } : undefined;
    this.stack.push({
      node,
      scopeName,
      functionIdentity: category !== "loop"
        ? identity as ProfileFunctionIdentity | undefined
        : undefined,
      pending,
    });
  }

  pop(node: any, rawEnd: GeneratedPosition): void {
    const top = this.stack.pop();
    if (!top || top.node !== node) throw new Error("compiler profile-map stack mismatch");
    if (top.pending) this.completed.push({ pending: top.pending, end: position(rawEnd) });
  }

  finish(javascript: string, url: string): OptimizerProfileMap {
    if (this.stack.length !== 0) throw new Error("compiler profile-map stack was not balanced");
    const spans = this.completed.map(({ pending, end }) => ({
      category: pending.category,
      identity: pending.identity,
      optimizerRegionId: pending.optimizerRegionId,
      generated: { start: pending.start, end },
    })).sort((left, right) => left.generated.start.offset - right.generated.start.offset ||
      right.generated.end.offset - left.generated.end.offset);
    return Object.freeze({
      schema: PROFILE_MAP_SCHEMA,
      authority: "compiler-emitted-content-authenticated",
      compilerSchema: this.compilerSchema,
      source: Object.freeze({
        identity: this.sourceIdentity,
        bytes: Buffer.byteLength(this.sourceText),
      }),
      generated: Object.freeze({
        url,
        sha256: profileSha256(javascript),
        bytes: Buffer.byteLength(javascript),
      }),
      spans: Object.freeze(spans.map((span) => Object.freeze({
        category: span.category,
        identity: span.identity,
        optimizerRegionId: span.optimizerRegionId,
        generated: Object.freeze({
          start: Object.freeze(span.generated.start),
          end: Object.freeze(span.generated.end),
        }),
      }))) as unknown as ProfileSpan[],
      segments: Object.freeze(disjointSegments(spans)),
    });
  }
}

function exactKeys(value: unknown, keys: string[]): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export function validOptimizerProfileMap(value: unknown): value is OptimizerProfileMap {
  if (!exactKeys(value, [
    "schema", "authority", "compilerSchema", "source", "generated", "spans", "segments",
  ])) return false;
  const map = value as OptimizerProfileMap;
  if (map.schema !== PROFILE_MAP_SCHEMA || map.authority !== "compiler-emitted-content-authenticated" ||
      typeof map.compilerSchema !== "string" || !exactKeys(map.source, ["identity", "bytes"]) ||
      !validProfileSourceIdentity(map.source.identity) ||
      !Number.isSafeInteger(map.source.bytes) || map.source.bytes < 0 ||
      !exactKeys(map.generated, ["url", "sha256", "bytes"]) ||
      typeof map.generated.url !== "string" || !/^[a-f0-9]{64}$/.test(map.generated.sha256) ||
      !Number.isSafeInteger(map.generated.bytes) || map.generated.bytes < 0 || !Array.isArray(map.spans)) {
    return false;
  }
  let previous = -1;
  for (const span of map.spans) {
    if (!exactKeys(span, ["category", "identity", "optimizerRegionId", "generated"]) ||
        !["function", "method", "loop"].includes(span.category) ||
        !(span.category === "loop"
          ? validProfileRegionIdentity(span.identity)
          : validProfileFunctionIdentity(span.identity)) ||
        (span.optimizerRegionId !== null && typeof span.optimizerRegionId !== "string") ||
        !exactKeys(span.generated, ["start", "end"])) return false;
    for (const point of [span.generated.start, span.generated.end]) {
      if (!exactKeys(point, ["line", "column", "offset"]) ||
          !Object.values(point).every((entry) =>
            typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0
          ) ||
          point.line < 1) return false;
    }
    if (span.generated.start.offset < previous || span.generated.end.offset < span.generated.start.offset) {
      return false;
    }
    previous = span.generated.start.offset;
  }
  if (!Array.isArray(map.segments)) return false;
  let previousSegmentEnd = -1;
  for (const segment of map.segments) {
    if (!exactKeys(segment, ["generated", "mapping"]) ||
        !exactKeys(segment.generated, ["start", "end"]) ||
        !exactKeys(segment.mapping, ["status", "candidates"]) ||
        !["attributed", "ambiguous"].includes(segment.mapping.status) ||
        !Array.isArray(segment.mapping.candidates) || segment.mapping.candidates.length === 0 ||
        (segment.mapping.status === "attributed") !== (segment.mapping.candidates.length === 1)) return false;
    if (segment.generated.start.offset < previousSegmentEnd ||
        segment.generated.end.offset <= segment.generated.start.offset) return false;
    previousSegmentEnd = segment.generated.end.offset;
    for (const candidate of segment.mapping.candidates) {
      if (!exactKeys(candidate, ["category", "identityId", "functionId", "regionId"]) ||
          !["function", "method", "loop"].includes(candidate.category) ||
          !/^sha256:[a-f0-9]{64}$/.test(candidate.identityId) ||
          !/^sha256:[a-f0-9]{64}$/.test(candidate.functionId) ||
          (candidate.regionId !== null && !/^sha256:[a-f0-9]{64}$/.test(candidate.regionId))) return false;
    }
  }
  return true;
}

export function authenticateOptimizerProfileMap(
  map: unknown,
  javascript: string,
  source?: string,
): asserts map is OptimizerProfileMap {
  if (!validOptimizerProfileMap(map)) throw new Error("invalid optimizer profile map");
  if (profileSha256(javascript) !== map.generated.sha256 ||
      Buffer.byteLength(javascript) !== map.generated.bytes) {
    throw new Error("stale optimizer profile map: generated JavaScript digest mismatch");
  }
  if (source !== undefined && (profileSha256(source) !== map.source.identity.digest ||
      Buffer.byteLength(source) !== map.source.bytes)) {
    throw new Error("stale optimizer profile map: Python source digest mismatch");
  }
}
