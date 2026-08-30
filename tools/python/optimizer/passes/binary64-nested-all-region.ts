import type { OptimizerPassPlugin } from "../catalog";
import { nearestOwningFunction } from "../contracts";
import { targetCandidate } from "../cost-model";
import {
  BINARY64_NESTED_ALL_REASONS,
  BINARY64_NESTED_ALL_RECONNAISSANCE_DOMAIN,
  BINARY64_NESTED_ALL_RECONNAISSANCE_PASS,
  BINARY64_NESTED_ALL_RECONNAISSANCE_PRIORITY,
  BINARY64_NESTED_ALL_RECONNAISSANCE_VERIFIER,
  Binary64NestedAllProgram,
} from "../domains/binary64-nested-all/model";
import { recognizeBinary64NestedAllProgram } from
  "../domains/binary64-nested-all/recognize";
import { verifyBinary64NestedAllReconnaissanceDecision } from
  "../domains/binary64-nested-all/verify";
import { stableRegionIdentity } from "../identity";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function observationDecision(
  node: any,
  program: Binary64NestedAllProgram,
): Omit<OptimizationDecision, "selected" | "rejectionReasons" | "functionId"> {
  const source = sourceRegion(node);
  const identity = stableRegionIdentity(
    BINARY64_NESTED_ALL_RECONNAISSANCE_PASS,
    source,
    { kind: "binary64-nested-all-reconnaissance", program },
  );
  const isPair = program.predicateKind === "fixed-pair-isfinite";
  return {
    schema: OPTIMIZER_IR_SCHEMA,
    id: identity.id,
    passId: BINARY64_NESTED_ALL_RECONNAISSANCE_PASS,
    source,
    semantic: {
      level: "sage-semantic",
      revision: 1,
      kind: "python.nested-generator-all-isfinite-candidate",
      operations: [
        "construct-generator", "iterate-outer", "iterate-inner",
        ...(isPair
          ? ["indexed-read-0", "call-isfinite-0", "boolean-and",
            "indexed-read-1", "call-isfinite-1"]
          : ["call-isfinite"]),
        "builtin-all-short-circuit",
      ],
      observableExits: [
        "boolean-result", "outer-iterator-state", "inner-iterator-state",
      ],
      exceptionPolicy:
        "explanation only; preserve generator creation, ordered iteration, short-circuiting, interrupts, exceptions, and untouched fallback",
    },
    mathematical: {
      level: "mathematical",
      revision: 1,
      kind: isPair
        ? "math.nested-fixed-pair-binary64-finiteness-reduction-candidate"
        : "math.nested-scalar-binary64-finiteness-reduction-candidate",
      domain: isPair
        ? "unproved nested sequence of strict binary64 fixed pairs"
        : "unproved nested sequence of strict binary64 scalars",
      operations: program.operations.map((operation) =>
        `binary64-nested-all.${operation}`
      ),
      exactness:
        "the generator and predicate syntax are recognized; identities, representations, iteration, interrupts, and fallback restart are not established",
    },
    facts: [
      {
        kind: "canonical-two-clause-all-generator",
        authority: "static",
        evidence: "builtin-shaped all has one two-clause synchronous generator argument without filters",
      },
      {
        kind: "inner-traversal-derived-from-outer-element",
        authority: "static",
        evidence: "the inner iterable is the exact lexical target of the outer clause",
      },
      {
        kind: isPair
          ? "structural-ordered-fixed-pair-isfinite-predicate"
          : "structural-scalar-isfinite-predicate",
        authority: "static",
        evidence: isPair
          ? "the predicate is ordered isfinite(item[0]) and isfinite(item[1])"
          : "the predicate is one isfinite call on the inner lexical item",
      },
      {
        kind: "missing-proof-summary",
        authority: "static",
        evidence: program.proofGaps.join(","),
      },
    ],
    representation: {
      level: "representation",
      revision: 1,
      kind: isPair
        ? "unproved-nested-packed-binary64-fixed-pairs"
        : "unproved-nested-packed-binary64-scalars",
      candidates: [
        isPair ? "guarded-fixed-pair-binary64-lists" : "guarded-binary64-lists",
        "resident-wasm-binary64-storage",
        "source-transparent-native-binary64-storage",
        "generic-python-nested-iterables",
      ],
      conversions: [
        "authenticate exact outer and inner list representations before optimized effects",
        isPair
          ? "authenticate exact two-element strict binary64 pairs and indexed access"
          : "authenticate every inner element as strict binary64",
        "publish one boolean only at the original all return point",
      ],
      materializations: 0,
    },
    target: {
      level: "target",
      revision: 1,
      kind: "generic",
      lowering: "none; reconnaissance only",
      boundaryCrossings: "runtime-dependent",
      copiedBytes: "runtime-dependent",
      selectedCandidate: "generic-nested-all-fallback",
      policy:
        "retain the untouched source expression until every semantic, representation, interrupt, restart, and target proof is independently verified",
      candidates: [
        targetCandidate({
          id: "v8-binary64-nested-all-candidate",
          kind: "v8",
          representation: isPair
            ? "guarded nested fixed-pair binary64 lists"
            : "guarded nested binary64 scalar lists",
          availability: "rejected",
          rejectionReason: BINARY64_NESTED_ALL_REASONS.v8Lowering,
          evidence: "no verified V8 lowering is registered for this reconnaissance domain",
        }),
        targetCandidate({
          id: "wasm-binary64-nested-all-candidate",
          kind: "wasm",
          representation: "resident packed binary64 storage",
          availability: "rejected",
          rejectionReason: BINARY64_NESTED_ALL_REASONS.wasmBoundary,
          evidence: "copy, residency, interrupt, and result boundary costs have not been evaluated",
        }),
        targetCandidate({
          id: "native-binary64-nested-all-candidate",
          kind: "native",
          representation: "source-transparent isolated binary64 storage",
          availability: "rejected",
          rejectionReason: BINARY64_NESTED_ALL_REASONS.nativeBoundary,
          evidence: "conversion, isolation, interrupt, and result boundary costs have not been evaluated",
        }),
        targetCandidate({
          id: "generic-nested-all-fallback",
          kind: "generic",
          representation: "ordinary Python generator and semantic objects",
          availability: "selected",
          cost: {
            representationConversions: 0,
            boundaryCrossings: 0,
            copiedBytes: 0,
            compileMilliseconds: 0,
            instantiateMilliseconds: 0,
            loadMilliseconds: 0,
            emittedBytes: 0,
          },
          evidence: "the untouched source expression remains the only executable route",
        }),
      ],
    },
    guards: ["no-executable-lowering"],
    fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
    cacheIdentityInputs: [
      `schema:${OPTIMIZER_IR_SCHEMA}`,
      `pass:${BINARY64_NESTED_ALL_RECONNAISSANCE_PASS}`,
      `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
      `semantic-fingerprint:${identity.fingerprint}`,
    ],
  };
}

export const binary64NestedAllReconnaissancePass: OptimizationPass = {
  id: BINARY64_NESTED_ALL_RECONNAISSANCE_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: [
    "lexical-binding", "generator-comprehension-structure",
    "module-resolution-provenance",
  ],
  factsProduced: [
    "canonical-two-clause-all-generator",
    "inner-traversal-derived-from-outer-element",
    "structural-scalar-isfinite-predicate",
    "structural-ordered-fixed-pair-isfinite-predicate",
    "missing-proof-summary",
  ],
  factsInvalidated: [],
  preserves: [
    "python-generator-iteration", "builtin-all-short-circuit",
    "source-evaluation-order", "indexed-access-order", "exceptions",
    "interrupts", "zero-trip-behavior", "untouched-restart",
    "generic-fallback",
  ],
  guardsIntroduced: ["no-executable-lowering"],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: BINARY64_NESTED_ALL_RECONNAISSANCE_VERIFIER,
  compilationCostBudget: 64,
  codeSizeBudget: 0,
  requiredEvidence: [
    "production-scalar-and-fixed-pair-source-fixtures",
    "application-name-independent-structural-fixtures",
    "adversarial-identity-order-and-generator-negative-corpus",
    "no-executable-lowering",
    "inclusive-v8-wasm-native-boundary-comparison-before-promotion",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      if (!(node instanceof context.compiler.AST_Call)) return;
      const ownerFunction = nearestOwningFunction(context.compiler, ancestors);
      if (!ownerFunction) return;
      const recognition = recognizeBinary64NestedAllProgram(
        context.compiler,
        node,
      );
      if (!recognition.recognized) return;
      // The dashboard and profiler own the generator-comprehension loop as
      // the semantic region.  Keep the call node as the pass-manager claim
      // key, but bind the explain-only decision to the exact loop range so
      // static and runtime evidence join without a containment heuristic.
      const decision = observationDecision(node.args[0], recognition.program);
      verifyBinary64NestedAllReconnaissanceDecision(
        recognition.program,
        decision,
      );
      context.observe({
        minimumLevel: "O2",
        node,
        ownerFunction,
        rejectionReasons: recognition.program.proofGaps,
        decision,
      });
    });
  },
};

export const binary64NestedAllReconnaissancePlugin: OptimizerPassPlugin =
  Object.freeze({
    id: BINARY64_NESTED_ALL_RECONNAISSANCE_PASS,
    domainId: BINARY64_NESTED_ALL_RECONNAISSANCE_DOMAIN,
    priority: BINARY64_NESTED_ALL_RECONNAISSANCE_PRIORITY,
    claimSemantics: "exclusive",
    loweringIds: Object.freeze([]),
    pass: binary64NestedAllReconnaissancePass,
  });
