import { Session } from "node:inspector";

import {
  authenticateOptimizerProfileMap,
  OptimizerProfileMap,
  ProfileSpan,
} from "./python/optimizer/profile-map";
import { profileSha256 } from "./python/optimizer/profile-identity";

const evidenceCommon = require(
  "./optimizer-development/common.cjs",
) as {
  canonicalJson(value: unknown): string;
  sha256(value: string | Uint8Array): string;
};

export const OPTIMIZER_NODE_PROFILE_SCHEMA =
  "sagejs.optimizer-node-profile-observation/v1" as const;
export const OPTIMIZER_PROFILE_EVENT_SCHEMA =
  "sagejs.optimizer-private-events/v1" as const;

export type OptimizerProfileEventOutcome =
  | "selected-static-entry"
  | "guarded-fast"
  | "guarded-fallback"
  | "zero-trip"
  | "completed"
  | "error";

export type OptimizerProfileEvent = Readonly<{
  sequence: number;
  regionId: string;
  kind: string;
  outcome: OptimizerProfileEventOutcome;
}>;

export type OptimizerProfileEventAggregate = Readonly<{
  regionId: string;
  kind: string;
  outcome: OptimizerProfileEventOutcome;
  rawGuardReason: string | null;
  count: number;
}>;

export type OptimizerProfileEventSnapshot = Readonly<{
  schema: typeof OPTIMIZER_PROFILE_EVENT_SCHEMA;
  authority: "private-lexical-capability";
  count: number;
  countsByOutcome: Readonly<Record<string, number>>;
  aggregates: readonly OptimizerProfileEventAggregate[];
  events: readonly OptimizerProfileEvent[];
}>;

export interface PrivateProfileEventCollector {
  observer(
    regionId: string,
    kind: string,
    outcome: OptimizerProfileEventOutcome,
    rawGuardReason?: string | null,
  ): void;
  clear(): void;
  snapshot(): OptimizerProfileEventSnapshot;
}

export type ProfileAccounting = Readonly<{
  total: number;
  attributed: number;
  ambiguous: number;
  unmatched: number;
}>;

export type ProfileAttribution = Readonly<{
  identity: ProfileSpan["identity"];
  category: ProfileSpan["category"];
  optimizerRegionId: string | null;
  selfSamples: number;
  selfMicros: number;
  positionTicks: number;
}>;

export type OptimizerProfileObservation = Readonly<{
  schema: typeof OPTIMIZER_NODE_PROFILE_SCHEMA;
  authority: "node-inspector-exact-script-source";
  runtime: Readonly<{
    engine: "node";
    version: string;
    platform: NodeJS.Platform;
    architecture: string;
  }>;
  artifact: Readonly<{
    url: string;
    sha256: string;
    bytes: number;
    scriptId: string;
    inspectorHash: string;
  }>;
  artifacts: readonly Readonly<{
    url: string;
    sha256: string;
    bytes: number;
    scriptId: string;
    inspectorHash: string;
    sourceUnitId: string;
    mapDigest: string;
  }>[];
  sampling: Readonly<{
    scope:
      | "cold-generated-javascript-load-and-execution"
      | "cold-generated-javascript-and-current-source-lazy-modules"
      | "warm-prepared-sealed-generated-javascript-execution";
    requestedIntervalMicros: number;
    startTimeMicros: number;
    endTimeMicros: number;
    sampledDurationMicros: number;
    wallMicros: number;
    preparationMicros: number;
    warmupRuns: number;
    repetitions: number;
  }>;
  raw: Readonly<{
    sha256: string;
    nodeCount: number;
    sampleCount: number;
    positionTickCount: number;
  }>;
  sampleAccounting: ProfileAccounting;
  positionTickAccounting: ProfileAccounting;
  attribution: readonly ProfileAttribution[];
  privateEvents: OptimizerProfileEventSnapshot;
  evidence: Readonly<{
    sampling: Readonly<Record<string, unknown>>;
    runtime: Readonly<Record<string, unknown>>;
  }>;
  execution: Readonly<{
    status: "returned" | "threw";
    error: Readonly<{ name: string; message: string }> | null;
  }>;
}>;

export class OptimizerProfileExecutionError extends Error {
  readonly observation: OptimizerProfileObservation;
  readonly executionCause: unknown;

  constructor(cause: unknown, observation: OptimizerProfileObservation) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`profiled execution failed: ${message}`, { cause });
    this.name = "OptimizerProfileExecutionError";
    this.observation = observation;
    this.executionCause = cause;
  }
}

export type OptimizerProfileAuthenticationReasonCode =
  | "evidence.stale-artifact"
  | "evidence.ambiguous-attribution"
  | "evidence.unmatched-sample";

export class OptimizerProfileAuthenticationError extends Error {
  readonly reasonCode: OptimizerProfileAuthenticationReasonCode;

  constructor(
    reasonCode: OptimizerProfileAuthenticationReasonCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OptimizerProfileAuthenticationError";
    this.reasonCode = reasonCode;
    Object.defineProperty(this, "reasonCode", {
      value: reasonCode,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
}

export interface OptimizerProfileArtifactRegistry {
  declare(map: OptimizerProfileMap, javascript: string): void;
}

type DeclaredArtifact = Readonly<{
  map: OptimizerProfileMap;
  javascript: string;
}>;

const PROFILE_OUTCOMES = new Set<OptimizerProfileEventOutcome>([
  "selected-static-entry",
  "guarded-fast",
  "guarded-fallback",
  "zero-trip",
  "completed",
  "error",
]);

function profileLabel(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 ||
      /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`invalid optimizer profile ${label}`);
  }
  return value;
}

/**
 * Create the capability passed as a private lexical parameter to generated
 * code. It is intentionally neither installed on `globalThis` nor returned
 * by an evaluated program. Calling it is the authority to publish an event.
 */
export function createPrivateProfileEventCollector(): PrivateProfileEventCollector {
  const aggregates = new Map<string, {
    regionId: string;
    kind: string;
    outcome: OptimizerProfileEventOutcome;
    rawGuardReason: string | null;
    count: number;
  }>();
  let count = 0;
  const observer = (
    regionId: string,
    kind: string,
    outcome: OptimizerProfileEventOutcome,
    rawGuardReason: string | null = null,
  ): void => {
    profileLabel(regionId, "region id");
    profileLabel(kind, "kind");
    if (!PROFILE_OUTCOMES.has(outcome)) {
      throw new TypeError("invalid optimizer profile event outcome");
    }
    if (rawGuardReason !== null) profileLabel(rawGuardReason, "guard reason");
    const requiresReason = outcome === "guarded-fallback" || outcome === "error";
    if (requiresReason !== (rawGuardReason !== null)) {
      throw new TypeError(
        "optimizer profile guard reason is required exactly for fallback and error outcomes",
      );
    }
    const key = JSON.stringify([regionId, kind, outcome, rawGuardReason]);
    const group = aggregates.get(key) ?? {
      regionId,
      kind,
      outcome,
      rawGuardReason,
      count: 0,
    };
    group.count += 1;
    count += 1;
    aggregates.set(key, group);
  };
  const snapshot = (): OptimizerProfileEventSnapshot => {
    const countsByOutcome: Record<string, number> = Object.create(null);
    const groups = [...aggregates.values()].sort((left, right) =>
      left.regionId.localeCompare(right.regionId) ||
      left.kind.localeCompare(right.kind) ||
      left.outcome.localeCompare(right.outcome) ||
      String(left.rawGuardReason).localeCompare(String(right.rawGuardReason)));
    for (const event of groups) {
      countsByOutcome[event.outcome] =
        (countsByOutcome[event.outcome] ?? 0) + event.count;
    }
    return Object.freeze({
      schema: OPTIMIZER_PROFILE_EVENT_SCHEMA,
      authority: "private-lexical-capability",
      count,
      countsByOutcome: Object.freeze({ ...countsByOutcome }),
      aggregates: Object.freeze(groups.map((event) => Object.freeze({ ...event }))),
      // Retain the original event projection for callers that only need to
      // enumerate distinct routes. Counts live in `aggregates`, so collector
      // memory is bounded by route diversity rather than loop trip count.
      events: Object.freeze(groups.map((event, sequence) => Object.freeze({
        sequence,
        regionId: event.regionId,
        kind: event.kind,
        outcome: event.outcome,
      }))),
    });
  };
  const clear = (): void => {
    aggregates.clear();
    count = 0;
  };
  return Object.freeze({ observer, clear, snapshot });
}

export function nodeProfileCapabilities() {
  return Object.freeze({
    schema: "sagejs.optimizer-profile-capabilities/v1" as const,
    node: Object.freeze({
      supported: true,
      sampler: "node-inspector-cpu-profiler" as const,
      sourceSampling: "exact-script-source-authenticated" as const,
      attribution: "generated-function-and-line-ticks" as const,
    }),
    browser: Object.freeze({
      supported: false,
      sourceSampling: "unavailable" as const,
      reason:
        "Chromium, Firefox, and WebKit do not expose one portable, content-authenticated sampling API to Sage.js.",
    }),
  });
}

type InspectorProfileNode = {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount?: number;
  children?: number[];
  positionTicks?: Array<{ line: number; ticks: number }>;
};

type InspectorProfile = {
  nodes: InspectorProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
};

type ScriptCandidate = {
  scriptId: string;
  url: string;
  inspectorHash: string;
  source: string;
  sha256: string;
  bytes: number;
};

function post<T>(session: Session, method: string, params: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    session.post(method as never, params as never, (error, result) => {
      if (error) reject(error);
      else resolve(result as T);
    });
  });
}

function executionError(error: unknown): Readonly<{ name: string; message: string }> {
  return Object.freeze({
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  });
}

function immutableJsonCopy<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value));
  const freeze = (item: any): any => {
    if (item === null || typeof item !== "object" || Object.isFrozen(item)) return item;
    for (const child of Object.values(item)) freeze(child);
    return Object.freeze(item);
  };
  return freeze(copy);
}

type Mapping = Readonly<{
  status: "attributed" | "ambiguous" | "unmatched";
  spans: readonly ProfileSpan[];
}>;

function chooseMostSpecific(spans: ProfileSpan[]): Mapping {
  if (spans.length === 0) return { status: "unmatched", spans: [] };
  let width = Number.POSITIVE_INFINITY;
  for (const span of spans) {
    width = Math.min(width, span.generated.end.offset - span.generated.start.offset);
  }
  const narrowest = spans.filter(
    (span) => span.generated.end.offset - span.generated.start.offset === width,
  );
  const identities = new Map(narrowest.map((span) => [span.identity.id, span]));
  const candidates = [...identities.values()]
    .sort((left, right) => left.identity.id.localeCompare(right.identity.id));
  if (candidates.length !== 1) return { status: "ambiguous", spans: candidates };
  return { status: "attributed", spans: candidates };
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function offsetAt(
  starts: number[],
  sourceLength: number,
  line: number,
  column: number,
): number | undefined {
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) ||
      line < 1 || line > starts.length || column < 0) return undefined;
  const offset = starts[line - 1] + column;
  const lineEnd = line < starts.length ? starts[line] - 1 : sourceLength;
  return offset <= lineEnd ? offset : undefined;
}

function mapPoint(
  map: OptimizerProfileMap,
  starts: number[],
  sourceLength: number,
  line: number,
  column: number,
): Mapping {
  const offset = offsetAt(starts, sourceLength, line, column);
  if (offset === undefined) return { status: "unmatched", spans: [] };
  return chooseMostSpecific(map.spans.filter((span) =>
    span.category !== "loop" && span.generated.start.offset <= offset &&
    offset < span.generated.end.offset));
}

function mapLine(map: OptimizerProfileMap, line: number): Mapping {
  if (!Number.isSafeInteger(line) || line < 1) {
    return { status: "unmatched", spans: [] };
  }
  const segments = map.segments.filter((segment) =>
    segment.generated.start.line <= line &&
    (segment.generated.end.line > line ||
      (segment.generated.end.line === line && segment.generated.end.column > 0)));
  const identityIds = new Set(segments.flatMap((segment) =>
    segment.mapping.candidates
      .filter((candidate) => candidate.category === "loop")
      .map((candidate) => candidate.identityId)));
  const spans = map.spans.filter(
    (span) => span.category === "loop" && identityIds.has(span.identity.id),
  );
  // V8 position ticks carry a line but no column. Multiple disjoint loop
  // segments on one generated line therefore remain ambiguous even when each
  // individual segment is precise.
  if (spans.length === 0) return { status: "unmatched", spans: [] };
  if (spans.length !== 1) return { status: "ambiguous", spans };
  return { status: "attributed", spans };
}

function account(
  accounting: { total: number; attributed: number; ambiguous: number; unmatched: number },
  mapping: Mapping,
  amount: number,
): void {
  accounting.total += amount;
  accounting[mapping.status] += amount;
}

function frozenAccounting(value: {
  total: number;
  attributed: number;
  ambiguous: number;
  unmatched: number;
}): ProfileAccounting {
  if (value.total !== value.attributed + value.ambiguous + value.unmatched) {
    throw new Error("optimizer profile accounting invariant failed");
  }
  return Object.freeze({ ...value });
}

function buildReceipt(options: {
  artifacts: readonly Readonly<{
    map: OptimizerProfileMap;
    javascript: string;
    candidate: ScriptCandidate;
  }>[];
  profile: InspectorProfile;
  requestedIntervalMicros: number;
  wallMicros: number;
  preparationMicros: number;
  prepared: boolean;
  warmupRuns: number;
  repetitions: number;
  privateEvents: OptimizerProfileEventSnapshot;
  actionThrew: boolean;
  actionError?: unknown;
}): OptimizerProfileObservation {
  const { artifacts, profile } = options;
  if (artifacts.length === 0) throw new Error("optimizer profile has no artifacts");
  const rootArtifact = artifacts[0];
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const byScriptId = new Map(artifacts.map((artifact) => [
    artifact.candidate.scriptId,
    {
      ...artifact,
      starts: lineStarts(artifact.javascript),
    },
  ]));
  const sampleAccounting = { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 };
  const tickAccounting = { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 };
  const attributed = new Map<string, {
    span: ProfileSpan;
    selfSamples: number;
    selfMicros: number;
    positionTicks: number;
  }>();
  const entry = (span: ProfileSpan) => {
    let value = attributed.get(span.identity.id);
    if (!value) {
      value = { span, selfSamples: 0, selfMicros: 0, positionTicks: 0 };
      attributed.set(span.identity.id, value);
    }
    return value;
  };
  const functionCandidate = (map: OptimizerProfileMap, span: ProfileSpan) => ({
    sourceUnitId: map.source.identity.id,
    functionId: span.identity.id,
    path: map.source.identity.path,
    range: span.identity.range,
    confidence: 1,
  });
  const regionCandidate = (map: OptimizerProfileMap, span: ProfileSpan) => ({
    sourceUnitId: map.source.identity.id,
    functionId: String((span.identity as any).functionId),
    regionId: span.identity.id,
    path: map.source.identity.path,
    range: span.identity.range,
    confidence: 1,
  });
  const evidenceMapping = (
    map: OptimizerProfileMap | null,
    mapping: Mapping,
    includeRegion: boolean,
  ): Readonly<Record<string, unknown>> => ({
    status: mapping.status,
    candidates: mapping.spans.map((span) =>
      includeRegion ? regionCandidate(map!, span) : functionCandidate(map!, span)),
  });

  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const samplesByNode = new Map<number, { samples: number; micros: number }>();
  for (let index = 0; index < samples.length; index += 1) {
    const value = samplesByNode.get(samples[index]) ?? { samples: 0, micros: 0 };
    value.samples += 1;
    value.micros += Number.isFinite(deltas[index]) ? Math.max(0, deltas[index]) : 0;
    samplesByNode.set(samples[index], value);
  }
  const functionSamples = [...samplesByNode].sort((left, right) => left[0] - right[0])
    .map(([nodeId, quantity]) => {
      const node = nodes.get(nodeId);
      let mapping: Mapping = { status: "unmatched", spans: [] };
      const artifact = node ? byScriptId.get(node.callFrame.scriptId) : undefined;
      if (node && artifact) {
        mapping = mapPoint(
          artifact.map,
          artifact.starts,
          artifact.javascript.length,
          node.callFrame.lineNumber + 1,
          node.callFrame.columnNumber,
        );
      }
      account(sampleAccounting, mapping, quantity.samples);
      if (mapping.status === "attributed") {
        const value = entry(mapping.spans[0]);
        value.selfSamples += quantity.samples;
        value.selfMicros += quantity.micros;
      }
      return {
        nodeId,
        samples: quantity.samples,
        generated: {
          scriptId: node?.callFrame.scriptId || "(no-script)",
          url: node?.callFrame.url || "(no-url)",
          functionName: node?.callFrame.functionName || "(anonymous)",
          line: Math.max(1, (node?.callFrame.lineNumber ?? 0) + 1),
          column: Math.max(0, node?.callFrame.columnNumber ?? 0),
        },
        mapping: evidenceMapping(artifact?.map ?? null, mapping, false),
      };
    });
  const positionTicks: Array<Record<string, unknown>> = [];
  for (const node of profile.nodes) {
    for (const tick of node.positionTicks ?? []) {
      const artifact = byScriptId.get(node.callFrame.scriptId);
      const mapping = artifact
        ? mapLine(artifact.map, tick.line)
        : { status: "unmatched" as const, spans: [] };
      account(tickAccounting, mapping, tick.ticks);
      if (mapping.status === "attributed") {
        entry(mapping.spans[0]).positionTicks += tick.ticks;
      }
      positionTicks.push({
        nodeId: node.id,
        scriptId: node.callFrame.scriptId || "(no-script)",
        line: tick.line,
        ticks: tick.ticks,
        mapping: evidenceMapping(artifact?.map ?? null, mapping, true),
      });
    }
  }
  const attribution = [...attributed.values()].map((value) => Object.freeze({
    identity: immutableJsonCopy(value.span.identity),
    category: value.span.category,
    optimizerRegionId: value.span.optimizerRegionId,
    selfSamples: value.selfSamples,
    selfMicros: value.selfMicros,
    positionTicks: value.positionTicks,
  })).sort((left, right) =>
    right.positionTicks - left.positionTicks ||
    right.selfSamples - left.selfSamples ||
    left.identity.id.localeCompare(right.identity.id));
  const positionTickCount = profile.nodes.reduce(
    (total, node) => total + (node.positionTicks ?? [])
      .reduce((subtotal, tick) => subtotal + tick.ticks, 0),
    0,
  );
  const rawJson = JSON.stringify(profile);
  const routeGroups = new Map<string, {
    optimizerRegionId: string;
    regionKind: string;
    outcome: string;
    rawGuardReason: string | null;
    count: number;
  }>();
  for (const event of options.privateEvents.aggregates) {
    const key = JSON.stringify([
      event.regionId,
      event.kind,
      event.outcome,
      event.rawGuardReason,
    ]);
    const group = routeGroups.get(key) ?? {
      optimizerRegionId: event.regionId,
      regionKind: event.kind,
      outcome: event.outcome,
      rawGuardReason: event.rawGuardReason,
      count: 0,
    };
    group.count += event.count;
    routeGroups.set(key, group);
  }
  const routeCounts = { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 };
  const routeEvents = [...routeGroups.values()].sort((left, right) =>
    left.optimizerRegionId.localeCompare(right.optimizerRegionId) ||
    left.regionKind.localeCompare(right.regionKind) ||
    left.outcome.localeCompare(right.outcome)).map((group) => {
    const matches = artifacts.flatMap(({ map }) => map.spans
      .filter((span) =>
        span.category === "loop" && span.optimizerRegionId === group.optimizerRegionId)
      .map((span) => ({ map, span })));
    const spans = matches.map(({ span }) => span);
    const mapping: Mapping = spans.length === 0
      ? { status: "unmatched", spans: [] }
      : spans.length === 1
        ? { status: "attributed", spans }
        : { status: "ambiguous", spans };
    account(routeCounts, mapping, group.count);
    const { rawGuardReason, ...event } = group;
    return {
      ...event,
      reason: rawGuardReason === null ? null : {
        code: "telemetry.guard-failure",
        detail: { guard: rawGuardReason },
      },
      mapping: {
        status: mapping.status,
        candidates: matches.filter(({ span }) => mapping.spans.includes(span)).map(({ map, span }) => ({
          sourceUnitId: map.source.identity.id,
          functionId: String((span.identity as any).functionId),
          regionId: span.identity.id,
        })),
      },
    };
  });
  const foundationScripts = artifacts.map(({ candidate }) => ({
    url: candidate.url,
    sha256: candidate.sha256,
    bytes: candidate.bytes,
    authenticatedScriptIds: [candidate.scriptId],
    rejectedSameUrlScriptIds: [],
  })).sort((left, right) => left.url < right.url ? -1 : left.url > right.url ? 1 : 0);
  const foundationMapBindings = artifacts.map(({ map }) => ({
    schema: map.schema,
    digest: evidenceCommon.sha256(evidenceCommon.canonicalJson(map)),
    sourceUnitId: map.source.identity.id,
    generatedSha256: map.generated.sha256,
  })).sort((left, right) =>
    left.sourceUnitId.localeCompare(right.sourceUnitId) ||
    left.generatedSha256.localeCompare(right.generatedSha256));
  const foundationSampling = {
    kind: "v8-cpu",
    intervalMicroseconds: options.requestedIntervalMicros,
    rawProfileDigest: profileSha256(rawJson),
    timeDeltaMicroseconds: Math.max(0, Math.round(deltas.reduce(
      (total, delta) => total + (Number.isFinite(delta) ? Math.max(0, delta) : 0),
      0,
    ))),
    scripts: foundationScripts,
    mapBindings: foundationMapBindings,
    protocol: {
      scope: options.prepared
        ? "warm-prepared-sealed-generated-javascript-execution"
        : artifacts.length === 1
          ? "cold-generated-javascript-load-and-execution"
          : "cold-generated-javascript-and-current-source-lazy-modules",
      preparationMicroseconds: Math.max(0, Math.round(options.preparationMicros)),
      warmupRuns: options.warmupRuns,
      repetitions: options.repetitions,
      declaredArtifactCount: artifacts.length,
      authenticatedArtifactCount: artifacts.length,
      lateArtifactCount: 0,
      closureDigest: evidenceCommon.sha256(evidenceCommon.canonicalJson({
        scripts: foundationScripts,
        mapBindings: foundationMapBindings,
      })),
    },
    functionSampleCounts: frozenAccounting(sampleAccounting),
    functionSamples,
    positionTickCounts: frozenAccounting(tickAccounting),
    positionTicks,
  };
  const foundationRuntime = {
    authority: "private-evaluator-closure",
    routeEventCounts: frozenAccounting(routeCounts),
    routeEvents,
  };
  return immutableJsonCopy({
    schema: OPTIMIZER_NODE_PROFILE_SCHEMA,
    authority: "node-inspector-exact-script-source",
    runtime: Object.freeze({
      engine: "node",
      version: process.version,
      platform: process.platform,
      architecture: process.arch,
    }),
    artifact: Object.freeze({
      url: rootArtifact.map.generated.url,
      sha256: rootArtifact.candidate.sha256,
      bytes: rootArtifact.candidate.bytes,
      scriptId: rootArtifact.candidate.scriptId,
      inspectorHash: rootArtifact.candidate.inspectorHash,
    }),
    artifacts: Object.freeze(artifacts.map(({ map, candidate }) => Object.freeze({
      url: candidate.url,
      sha256: candidate.sha256,
      bytes: candidate.bytes,
      scriptId: candidate.scriptId,
      inspectorHash: candidate.inspectorHash,
      sourceUnitId: map.source.identity.id,
      mapDigest: evidenceCommon.sha256(evidenceCommon.canonicalJson(map)),
    }))),
    sampling: Object.freeze({
      scope: options.prepared
        ? "warm-prepared-sealed-generated-javascript-execution"
        : artifacts.length === 1
          ? "cold-generated-javascript-load-and-execution"
          : "cold-generated-javascript-and-current-source-lazy-modules",
      requestedIntervalMicros: options.requestedIntervalMicros,
      startTimeMicros: profile.startTime,
      endTimeMicros: profile.endTime,
      sampledDurationMicros: Math.max(0, profile.endTime - profile.startTime),
      wallMicros: options.wallMicros,
      preparationMicros: options.preparationMicros,
      warmupRuns: options.warmupRuns,
      repetitions: options.repetitions,
    }),
    raw: Object.freeze({
      sha256: profileSha256(rawJson),
      nodeCount: profile.nodes.length,
      sampleCount: samples.length,
      positionTickCount,
    }),
    sampleAccounting: frozenAccounting(sampleAccounting),
    positionTickAccounting: frozenAccounting(tickAccounting),
    attribution: Object.freeze(attribution),
    privateEvents: options.privateEvents,
    evidence: {
      sampling: foundationSampling,
      runtime: foundationRuntime,
    },
    execution: Object.freeze({
      status: options.actionThrew ? "threw" : "returned",
      error: options.actionThrew ? executionError(options.actionError) : null,
    }),
  }) as OptimizerProfileObservation;
}

function authenticateCandidate(
  map: OptimizerProfileMap,
  javascript: string,
  candidates: ScriptCandidate[],
): ScriptCandidate {
  if (candidates.length === 0) {
    throw new OptimizerProfileAuthenticationError(
      "evidence.unmatched-sample",
      `optimizer profile authentication failed: no script was parsed for ${map.generated.url}`,
    );
  }
  if (candidates.length !== 1) {
    throw new OptimizerProfileAuthenticationError(
      "evidence.ambiguous-attribution",
      `optimizer profile authentication failed: ${candidates.length} scripts used the claimed URL`,
    );
  }
  const candidate = candidates[0];
  if (candidate.sha256 !== map.generated.sha256 ||
      candidate.bytes !== map.generated.bytes || candidate.source !== javascript) {
    throw new OptimizerProfileAuthenticationError(
      "evidence.unmatched-sample",
      "optimizer profile authentication failed: Inspector source does not match the compiler artifact",
    );
  }
  return candidate;
}

export async function runAuthenticatedNodeProfile({
  map,
  javascript,
  prepare,
  seal,
  execute,
  samplingIntervalMicros = 500,
  warmupRuns = prepare === undefined ? 0 : 1,
  repetitions = 1,
  privateEvents = createPrivateProfileEventCollector(),
}: {
  map: OptimizerProfileMap;
  javascript: string;
  prepare?: (artifacts: OptimizerProfileArtifactRegistry) => unknown;
  seal?: () => unknown;
  execute: (artifacts: OptimizerProfileArtifactRegistry) => unknown;
  samplingIntervalMicros?: number;
  warmupRuns?: number;
  repetitions?: number;
  privateEvents?: PrivateProfileEventCollector;
}): Promise<OptimizerProfileObservation> {
  const declarations: DeclaredArtifact[] = [];
  const declarationsByUrl = new Map<string, DeclaredArtifact>();
  let acceptDeclarations = true;
  const artifacts: OptimizerProfileArtifactRegistry = Object.freeze({
    declare(candidateMap: OptimizerProfileMap, candidateJavaScript: string): void {
      if (!acceptDeclarations) {
        throw new OptimizerProfileAuthenticationError(
          "evidence.stale-artifact",
          "optimizer profile artifact was declared outside the active sampling interval",
        );
      }
      try {
        authenticateOptimizerProfileMap(candidateMap, candidateJavaScript);
      } catch (error) {
        throw new OptimizerProfileAuthenticationError(
          "evidence.stale-artifact",
          error instanceof Error ? error.message : String(error),
          { cause: error },
        );
      }
      if (declarationsByUrl.has(candidateMap.generated.url)) {
        throw new OptimizerProfileAuthenticationError(
          "evidence.ambiguous-attribution",
          `optimizer profile artifact URL was declared twice: ${candidateMap.generated.url}`,
        );
      }
      const declaration = Object.freeze({
        map: immutableJsonCopy(candidateMap),
        javascript: candidateJavaScript,
      });
      declarations.push(declaration);
      declarationsByUrl.set(candidateMap.generated.url, declaration);
    },
  });
  artifacts.declare(map, javascript);
  if (!Number.isSafeInteger(samplingIntervalMicros) ||
      samplingIntervalMicros < 50 || samplingIntervalMicros > 100_000) {
    throw new RangeError("samplingIntervalMicros must be an integer from 50 through 100000");
  }
  if (!Number.isSafeInteger(warmupRuns) || warmupRuns < 0) {
    throw new RangeError("warmupRuns must be a nonnegative safe integer");
  }
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError("repetitions must be a positive safe integer");
  }
  if (!prepare && (seal || warmupRuns !== 0 || repetitions !== 1)) {
    throw new TypeError(
      "warmupRuns, repetitions, and seal require a prepared optimizer profile",
    );
  }
  const session = new Session();
  const candidatePromisesByUrl = new Map<string, Promise<ScriptCandidate>[]>();
  let connected = false;
  let profilerEnabled = false;
  let debuggerEnabled = false;
  let profilerStarted = false;
  let acceptCandidates = false;
  let profile: InspectorProfile | undefined;
  let authenticatedArtifacts: Array<{
    map: OptimizerProfileMap;
    javascript: string;
    candidate: ScriptCandidate;
  }> = [];
  let actionError: unknown;
  let actionThrew = false;
  let wallMicros = 0;
  let preparationMicros = 0;
  const requireSynchronousResult = (result: unknown, phase: string): void => {
    if (result !== null && typeof result === "object" &&
        typeof Reflect.get(result, "then") === "function") {
      throw new TypeError(`profile ${phase} callback must be synchronous`);
    }
  };
  try {
    if (prepare) {
      const preparationStart = process.hrtime.bigint();
      try {
        requireSynchronousResult(prepare(artifacts), "prepare");
        for (let run = 0; run < warmupRuns; run += 1) {
          requireSynchronousResult(execute(artifacts), "warmup");
        }
        // Preparation and warmup are deliberately outside both evidence
        // channels. Route counts describe exactly the sampled repetitions.
        privateEvents.clear();
        if (seal) requireSynchronousResult(seal(), "seal");
      } finally {
        preparationMicros = Number(
          process.hrtime.bigint() - preparationStart,
        ) / 1_000;
        // A prepared profile authenticates one complete artifact closure.
        // Any later declaration is evidence that preparation was incomplete.
        acceptDeclarations = false;
      }
    }
    session.connect();
    connected = true;
    session.on("Debugger.scriptParsed", (message: any) => {
      const parsed = message.params;
      if (!acceptCandidates || !declarationsByUrl.has(String(parsed.url))) return;
      const url = String(parsed.url);
      const candidates = candidatePromisesByUrl.get(url) ?? [];
      candidates.push(post<{ scriptSource: string }>(
        session,
        "Debugger.getScriptSource",
        { scriptId: parsed.scriptId },
      ).then(({ scriptSource }) => ({
        scriptId: String(parsed.scriptId),
        url: String(parsed.url),
        inspectorHash: String(parsed.hash ?? ""),
        source: scriptSource,
        sha256: profileSha256(scriptSource),
        bytes: Buffer.byteLength(scriptSource),
      })));
      candidatePromisesByUrl.set(url, candidates);
    });
    acceptCandidates = true;
    await post(session, "Debugger.enable");
    debuggerEnabled = true;
    if (prepare) {
      // Debugger.enable reports scripts which V8 parsed before the Inspector
      // session connected. Authenticate the complete prepared closure before
      // the CPU sampler starts, so source compilation cannot consume samples.
      authenticatedArtifacts = await Promise.all(declarations.map(
        async (declaration) => ({
          ...declaration,
          candidate: authenticateCandidate(
            declaration.map,
            declaration.javascript,
            await Promise.all(
              candidatePromisesByUrl.get(declaration.map.generated.url) ?? [],
            ),
          ),
        }),
      ));
    }
    await post(session, "Profiler.enable");
    profilerEnabled = true;
    await post(session, "Profiler.setSamplingInterval", {
      interval: samplingIntervalMicros,
    });
    await post(session, "Profiler.start");
    profilerStarted = true;
    const wallStart = process.hrtime.bigint();
    try {
      for (let run = 0; run < repetitions; run += 1) {
        requireSynchronousResult(execute(artifacts), "execute");
      }
    } catch (error) {
      actionThrew = true;
      actionError = error;
    } finally {
      wallMicros = Number(process.hrtime.bigint() - wallStart) / 1_000;
      acceptDeclarations = false;
    }
    const stopped = await post<{ profile: InspectorProfile }>(session, "Profiler.stop");
    profile = stopped.profile;
    profilerStarted = false;
    acceptCandidates = false;
    // Source retrieval is an Inspector request too. Authenticate while the
    // Debugger domain and session are still alive, before cleanup can race it.
    if (!prepare) {
      authenticatedArtifacts = await Promise.all(declarations.map(
        async (declaration) => ({
          ...declaration,
          candidate: authenticateCandidate(
            declaration.map,
            declaration.javascript,
            await Promise.all(
              candidatePromisesByUrl.get(declaration.map.generated.url) ?? [],
            ),
          ),
        }),
      ));
    }
  } finally {
    if (profilerStarted) {
      try {
        const stopped = await post<{ profile: InspectorProfile }>(session, "Profiler.stop");
        profile = stopped.profile;
      } catch (_error) {
        // Preserve the original profiler or execution failure.
      }
    }
    if (profilerEnabled) {
      try {
        await post(session, "Profiler.disable");
      } catch (_error) {
        // Inspector cleanup is best effort; disconnect below is unconditional.
      }
    }
    if (debuggerEnabled) {
      try {
        await post(session, "Debugger.disable");
      } catch (_error) {
        // Inspector cleanup is best effort; disconnect below is unconditional.
      }
    }
    if (connected) session.disconnect();
  }
  if (!profile) throw new Error("Node Inspector did not return a CPU profile");
  const observation = buildReceipt({
    artifacts: authenticatedArtifacts,
    profile,
    requestedIntervalMicros: samplingIntervalMicros,
    wallMicros,
    preparationMicros,
    prepared: prepare !== undefined,
    warmupRuns,
    repetitions,
    privateEvents: privateEvents.snapshot(),
    actionThrew,
    actionError,
  });
  if (actionThrew) {
    throw new OptimizerProfileExecutionError(actionError, observation);
  }
  return observation;
}
