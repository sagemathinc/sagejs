import { recognizeClosedScalarProgram } from "../../canonicalize/scalar-loop";
import { nearestOwningFunction } from "../../contracts";
import { planV8ScalarCost } from "../../targets/v8-scalar-cost";
import {
  BOUNDED_INTEGER_CODE_SIZE_BUDGET,
  BOUNDED_INTEGER_OPERATION_BUDGET,
  BOUNDED_INTEGER_REASONS,
  BoundedIntegerAnnotationWitness,
  BoundedIntegerObservation,
  BoundedIntegerPlan,
  MAX_EXACT_NUMBER,
} from "./model";

function exactAnnotationName(argument: any): string | null {
  const text = argument?.annotation_text;
  if (typeof text === "string" && text.length !== 0) return text;
  const name = argument?.annotation?.name;
  return typeof name === "string" ? name : null;
}

export function owningFunction(
  compiler: any,
  ancestors: readonly any[],
): any | undefined {
  return nearestOwningFunction(compiler, ancestors);
}

function integerArguments(definition: any): Map<string, any> {
  const result = new Map<string, any>();
  for (const argument of definition?.argnames ?? []) {
    if (exactAnnotationName(argument) === "int") result.set(argument.name, argument);
  }
  return result;
}

function annotationWitnesses(
  definition: any,
  operands: Record<string, any>,
): BoundedIntegerAnnotationWitness[] | null {
  const argumentsByName = integerArguments(definition);
  const witnesses: BoundedIntegerAnnotationWitness[] = [];
  for (const slot of operands.inputSlots) {
    const argument = argumentsByName.get(operands.slots[slot]?.name);
    if (!argument) return null;
    witnesses.push({ slot, argument });
  }
  return witnesses;
}

/**
 * Form the complete transactional Number plan.  No annotation is trusted as
 * a representation proof: every live-in and intermediate is authenticated at
 * runtime and public bindings are updated only after successful completion.
 */
export function planBoundedIntegerRegion(
  compiler: any,
  node: any,
  ancestors: readonly any[],
): BoundedIntegerPlan | null {
  const canonical = recognizeClosedScalarProgram(compiler, node);
  if (!canonical || canonical.iteratorKind !== "range" ||
      canonical.sequences.length !== 0 ||
      canonical.operations.includes("pow")) return null;
  if (canonical.operations.some((operation) =>
    !["add", "sub", "mul", "neg", "equal", "coerce-integer"].includes(
      operation,
    ))) return null;
  const definition = owningFunction(compiler, ancestors);
  const annotatedIntegerArguments = annotationWitnesses(definition, canonical);
  if (!definition || !annotatedIntegerArguments) return null;
  const costed = planV8ScalarCost(canonical);
  if (costed.operationCost > BOUNDED_INTEGER_OPERATION_BUDGET ||
      costed.targetCodeBytes > BOUNDED_INTEGER_CODE_SIZE_BUDGET) return null;
  return {
    iteratorKind: "range",
    count: costed.count,
    iterator: costed.iterator,
    slots: costed.slots,
    inputSlots: costed.inputSlots,
    stateSlots: costed.stateSlots,
    localSlots: costed.localSlots,
    semanticStatements: costed.semanticStatements,
    statements: costed.statements,
    operations: costed.operations,
    integerConstants: costed.integerConstants,
    inplaceOperations: costed.inplaceOperations,
    annotatedIntegerArguments,
    rangeFacts: [
      ...costed.inputSlots.map((slot: number) => ({
        subject: costed.slots[slot].name,
        lower: -MAX_EXACT_NUMBER as number,
        upper: MAX_EXACT_NUMBER as number,
        authority: "runtime-guard" as const,
        evidence:
          "entry value is a primitive integral Number in the inclusive exact range",
      })),
      {
        subject: "every arithmetic intermediate",
        lower: -MAX_EXACT_NUMBER,
        upper: MAX_EXACT_NUMBER,
        authority: "runtime-guard",
        evidence:
          "each source operation is checked before assignment; failure discards private locals and restarts the untouched loop",
      },
    ],
    operationCost: costed.operationCost,
    targetCodeBytes: costed.targetCodeBytes,
    estimatedConversions: costed.inputSlots.length,
    estimatedMaterializations: costed.stateSlots.length,
  };
}

function reasonForOperator(operator: string): string {
  if (operator === "**") return BOUNDED_INTEGER_REASONS.power;
  return `${BOUNDED_INTEGER_REASONS.operation}:${operator}`;
}

/** Recognize an authentic exact-integer-shaped loop even when no lowering exists. */
export function observeBoundedIntegerCandidate(
  compiler: any,
  node: any,
  ancestors: readonly any[],
): BoundedIntegerObservation | null {
  const definition = owningFunction(compiler, ancestors);
  if (!definition) return null;
  const exactNames = integerArguments(definition);
  const packedNames = new Set<string>();
  for (const argument of definition.argnames ?? []) {
    if (["IntegerBuffer", "NativeIntegerVector"].includes(
      exactAnnotationName(argument) ?? "",
    )) packedNames.add(argument.name);
  }
  if (exactNames.size === 0 && packedNames.size === 0) return null;

  const operations = new Set<string>();
  const unsupported = new Set<string>();
  let dynamicCalls = 0;
  let mutableAccesses = 0;
  let stateAssignments = 0;
  const seen = new Set<any>();
  const visit = (value: any): void => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    if (value !== node &&
        (value instanceof compiler.AST_Function ||
         value instanceof compiler.AST_Class)) return;
    if (value instanceof compiler.AST_Binary) {
      operations.add(value.operator);
      if (!["+", "-", "*", "==", "!="].includes(value.operator)) {
        unsupported.add(reasonForOperator(value.operator));
      }
    } else if (value instanceof compiler.AST_Unary) {
      operations.add(`unary${value.operator}`);
      if (value.operator !== "-") unsupported.add(reasonForOperator(`unary${value.operator}`));
    } else if (value instanceof compiler.AST_Call && value !== node.object) {
      dynamicCalls += 1;
      unsupported.add(BOUNDED_INTEGER_REASONS.call);
    } else if (value instanceof compiler.AST_ItemAccess) {
      mutableAccesses += 1;
      unsupported.add(BOUNDED_INTEGER_REASONS.buffer);
    } else if (value instanceof compiler.AST_Assign) {
      stateAssignments += 1;
      if (!(value.left instanceof compiler.AST_SymbolRef)) {
        unsupported.add(BOUNDED_INTEGER_REASONS.buffer);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (["start", "end", "scope", "thedef", "imports", "globals",
           "optimization_ir", "optimization_region"].includes(key) ||
          typeof child === "function") continue;
      visit(child);
    }
  };
  visit(node.body ?? node);

  if (!(node instanceof compiler.AST_ForIn) ||
      !(node.object instanceof compiler.AST_Call) ||
      node.object.expression?.name !== "range") {
    unsupported.add(BOUNDED_INTEGER_REASONS.iterator);
  }
  if (node instanceof compiler.AST_While) {
    unsupported.add(BOUNDED_INTEGER_REASONS.control);
  }
  if (operations.size === 0 && mutableAccesses === 0) return null;
  if (unsupported.size === 0) {
    // A supported canonical candidate is handled by the transforming path.
    unsupported.add(BOUNDED_INTEGER_REASONS.annotation);
  }
  return {
    operations: [...operations].sort(),
    unsupportedOperations: [...unsupported].sort(),
    annotatedInputs: [...exactNames.keys(), ...packedNames].sort(),
    mutableAccesses,
    dynamicCalls,
    estimatedConversions: exactNames.size + packedNames.size,
    estimatedMaterializations: stateAssignments,
    estimatedCopiedBytes: mutableAccesses === 0 ? 0 : "runtime-dependent",
    reasons: [...unsupported].sort(),
  };
}
