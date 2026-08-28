import { Session } from "node:inspector";
import { resolve } from "node:path";

import {
  authenticateOptimizerProfileMap,
  OptimizerProfileMap,
  ProfileSpan,
} from "./python/optimizer/profile-map";
import { profileSha256 } from "./python/optimizer/profile-identity";

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

export type OptimizerProfileEventSnapshot = Readonly<{
  schema: typeof OPTIMIZER_PROFILE_EVENT_SCHEMA;
  authority: "private-lexical-capability";
  count: number;
  countsByOutcome: Readonly<Record<string, number>>;
  events: readonly OptimizerProfileEvent[];
}>;

export interface PrivateProfileEventCollector {
  observer(
    regionId: string,
    kind: string,
    outcome: OptimizerProfileEventOutcome,
  ): void;
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
  sampling: Readonly<{
    scope: "cold-generated-javascript-load-and-execution";
    requestedIntervalMicros: number;
    startTimeMicros: number;
    endTimeMicros: number;
    sampledDurationMicros: number;
    wallMicros: number;
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

const evidenceSchemas = require(resolve(
  __dirname,
  "../..",
  "tools",
  "optimizer-development",
  "schemas.cjs",
)) as {
  SCHEMAS: { profile: string };
  validateProfileReceipt(value: unknown, context?: Record<string, unknown>): unknown;
};
const evidenceCommon = require(resolve(
  __dirname,
  "../..",
  "tools",
  "optimizer-development",
  "common.cjs",
)) as {
  documentIdentity(value: unknown): string;
};

/**
 * Attach one authenticated Node observation to a complete workload envelope,
 * then run the campaign's exact fail-closed profile validator. The envelope
 * owns workload/oracle/cold-warm/overhead evidence; this sampler owns only its
 * source sampling and private evaluator evidence.
 */
export function assembleValidatedOptimizerProfileReceipt(
  envelope: Record<string, unknown>,
  observation: OptimizerProfileObservation,
  context: Record<string, unknown> = {},
): unknown {
  const candidate = {
    schema: evidenceSchemas.SCHEMAS.profile,
    id: `sha256:${"0".repeat(64)}`,
    ...envelope,
    sampling: observation.evidence.sampling,
    runtime: observation.evidence.runtime,
  };
  candidate.id = evidenceCommon.documentIdentity(candidate);
  return evidenceSchemas.validateProfileReceipt(candidate, context);
}

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
  const events: OptimizerProfileEvent[] = [];
  const observer = (
    regionId: string,
    kind: string,
    outcome: OptimizerProfileEventOutcome,
  ): void => {
    profileLabel(regionId, "region id");
    profileLabel(kind, "kind");
    if (!PROFILE_OUTCOMES.has(outcome)) {
      throw new TypeError("invalid optimizer profile event outcome");
    }
    events.push(Object.freeze({
      sequence: events.length,
      regionId,
      kind,
      outcome,
    }));
  };
  const snapshot = (): OptimizerProfileEventSnapshot => {
    const countsByOutcome: Record<string, number> = Object.create(null);
    for (const event of events) {
      countsByOutcome[event.outcome] = (countsByOutcome[event.outcome] ?? 0) + 1;
    }
    return Object.freeze({
      schema: OPTIMIZER_PROFILE_EVENT_SCHEMA,
      authority: "private-lexical-capability",
      count: events.length,
      countsByOutcome: Object.freeze({ ...countsByOutcome }),
      events: Object.freeze([...events]),
    });
  };
  return Object.freeze({ observer, snapshot });
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
  map: OptimizerProfileMap;
  javascript: string;
  candidate: ScriptCandidate;
  profile: InspectorProfile;
  requestedIntervalMicros: number;
  wallMicros: number;
  privateEvents: OptimizerProfileEventSnapshot;
  actionThrew: boolean;
  actionError?: unknown;
}): OptimizerProfileObservation {
  const { map, javascript, candidate, profile } = options;
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const starts = lineStarts(javascript);
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
  const functionCandidate = (span: ProfileSpan) => ({
    sourceUnitId: map.source.identity.id,
    functionId: span.identity.id,
    path: map.source.identity.path,
    range: span.identity.range,
    confidence: 1,
  });
  const regionCandidate = (span: ProfileSpan) => ({
    sourceUnitId: map.source.identity.id,
    functionId: String((span.identity as any).functionId),
    regionId: span.identity.id,
    path: map.source.identity.path,
    range: span.identity.range,
    confidence: 1,
  });
  const evidenceMapping = (
    mapping: Mapping,
    includeRegion: boolean,
  ): Readonly<Record<string, unknown>> => ({
    status: mapping.status,
    candidates: mapping.spans.map((span) =>
      includeRegion ? regionCandidate(span) : functionCandidate(span)),
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
      if (node?.callFrame.scriptId === candidate.scriptId) {
        mapping = mapPoint(
          map,
          starts,
          javascript.length,
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
        mapping: evidenceMapping(mapping, false),
      };
    });
  const positionTicks: Array<Record<string, unknown>> = [];
  for (const node of profile.nodes) {
    for (const tick of node.positionTicks ?? []) {
      const mapping = node.callFrame.scriptId === candidate.scriptId
        ? mapLine(map, tick.line)
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
        mapping: evidenceMapping(mapping, true),
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
    count: number;
  }>();
  for (const event of options.privateEvents.events) {
    const key = JSON.stringify([event.regionId, event.kind, event.outcome]);
    const group = routeGroups.get(key) ?? {
      optimizerRegionId: event.regionId,
      regionKind: event.kind,
      outcome: event.outcome,
      count: 0,
    };
    group.count += 1;
    routeGroups.set(key, group);
  }
  const routeCounts = { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 };
  const routeEvents = [...routeGroups.values()].sort((left, right) =>
    left.optimizerRegionId.localeCompare(right.optimizerRegionId) ||
    left.regionKind.localeCompare(right.regionKind) ||
    left.outcome.localeCompare(right.outcome)).map((group) => {
    const spans = map.spans.filter((span) =>
      span.category === "loop" && span.optimizerRegionId === group.optimizerRegionId);
    const mapping: Mapping = spans.length === 0
      ? { status: "unmatched", spans: [] }
      : spans.length === 1
        ? { status: "attributed", spans }
        : { status: "ambiguous", spans };
    account(routeCounts, mapping, group.count);
    return {
      ...group,
      reason: null,
      mapping: {
        status: mapping.status,
        candidates: mapping.spans.map((span) => ({
          sourceUnitId: map.source.identity.id,
          functionId: String((span.identity as any).functionId),
          regionId: span.identity.id,
        })),
      },
    };
  });
  const foundationSampling = {
    kind: "v8-cpu",
    intervalMicroseconds: options.requestedIntervalMicros,
    rawProfileDigest: profileSha256(rawJson),
    timeDeltaMicroseconds: Math.max(0, Math.round(deltas.reduce(
      (total, delta) => total + (Number.isFinite(delta) ? Math.max(0, delta) : 0),
      0,
    ))),
    scripts: [{
      url: candidate.url,
      sha256: candidate.sha256,
      bytes: candidate.bytes,
      authenticatedScriptIds: [candidate.scriptId],
      rejectedSameUrlScriptIds: [],
    }],
    mapBindings: [{
      schema: map.schema,
      digest: profileSha256(JSON.stringify(map)),
      sourceUnitId: map.source.identity.id,
      generatedSha256: map.generated.sha256,
    }],
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
      url: map.generated.url,
      sha256: candidate.sha256,
      bytes: candidate.bytes,
      scriptId: candidate.scriptId,
      inspectorHash: candidate.inspectorHash,
    }),
    sampling: Object.freeze({
      scope: "cold-generated-javascript-load-and-execution",
      requestedIntervalMicros: options.requestedIntervalMicros,
      startTimeMicros: profile.startTime,
      endTimeMicros: profile.endTime,
      sampledDurationMicros: Math.max(0, profile.endTime - profile.startTime),
      wallMicros: options.wallMicros,
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
  execute,
  samplingIntervalMicros = 500,
  privateEvents = createPrivateProfileEventCollector(),
}: {
  map: OptimizerProfileMap;
  javascript: string;
  execute: () => unknown;
  samplingIntervalMicros?: number;
  privateEvents?: PrivateProfileEventCollector;
}): Promise<OptimizerProfileObservation> {
  try {
    authenticateOptimizerProfileMap(map, javascript);
  } catch (error) {
    throw new OptimizerProfileAuthenticationError(
      "evidence.stale-artifact",
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
  if (!Number.isSafeInteger(samplingIntervalMicros) ||
      samplingIntervalMicros < 50 || samplingIntervalMicros > 100_000) {
    throw new RangeError("samplingIntervalMicros must be an integer from 50 through 100000");
  }
  const session = new Session();
  const candidatePromises: Promise<ScriptCandidate>[] = [];
  let connected = false;
  let profilerEnabled = false;
  let debuggerEnabled = false;
  let profilerStarted = false;
  let acceptCandidates = false;
  let profile: InspectorProfile | undefined;
  let candidates: ScriptCandidate[] = [];
  let actionError: unknown;
  let actionThrew = false;
  let wallMicros = 0;
  try {
    session.connect();
    connected = true;
    session.on("Debugger.scriptParsed", (message: any) => {
      const parsed = message.params;
      if (!acceptCandidates || parsed.url !== map.generated.url) return;
      candidatePromises.push(post<{ scriptSource: string }>(
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
    });
    await post(session, "Debugger.enable");
    debuggerEnabled = true;
    await post(session, "Profiler.enable");
    profilerEnabled = true;
    await post(session, "Profiler.setSamplingInterval", {
      interval: samplingIntervalMicros,
    });
    await post(session, "Profiler.start");
    profilerStarted = true;
    acceptCandidates = true;
    const wallStart = process.hrtime.bigint();
    try {
      const result = execute();
      if (result !== null && typeof result === "object" &&
          typeof Reflect.get(result, "then") === "function") {
        throw new TypeError("profile execute callback must be synchronous");
      }
    } catch (error) {
      actionThrew = true;
      actionError = error;
    } finally {
      wallMicros = Number(process.hrtime.bigint() - wallStart) / 1_000;
      acceptCandidates = false;
    }
    const stopped = await post<{ profile: InspectorProfile }>(session, "Profiler.stop");
    profile = stopped.profile;
    profilerStarted = false;
    // Source retrieval is an Inspector request too. Authenticate while the
    // Debugger domain and session are still alive, before cleanup can race it.
    candidates = await Promise.all(candidatePromises);
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
  const candidate = authenticateCandidate(map, javascript, candidates);
  const observation = buildReceipt({
    map,
    javascript,
    candidate,
    profile,
    requestedIntervalMicros: samplingIntervalMicros,
    wallMicros,
    privateEvents: privateEvents.snapshot(),
    actionThrew,
    actionError,
  });
  if (actionThrew) {
    throw new OptimizerProfileExecutionError(actionError, observation);
  }
  return observation;
}
