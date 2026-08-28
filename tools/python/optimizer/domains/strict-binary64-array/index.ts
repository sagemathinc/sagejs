import { recognizeClosedScalarProgram } from "../../canonicalize/scalar-loop";
import {
  CanonicalScalarProgram,
  ScalarExpression,
  ScalarStatement,
} from "../../ir/scalar-program";

export const STRICT_FLOAT_ARRAY_DOMAIN = "strict-binary64-array";
export const STRICT_FLOAT_ARRAY_PASS = "math.strict-float-array-region.v1";
export const STRICT_FLOAT_ARRAY_LOWERING = "v8.strict-float-array-loop.v1";
export const STRICT_FLOAT_ARRAY_INTERNAL_KIND = "strict-float-array-region";
export const STRICT_FLOAT_ARRAY_VERIFIER = "verify.strict-float-array-plan.v1";

export interface StrictFloatArgumentWitness {
  slot: number;
  argument: any;
}

export interface StrictFloatSequenceWitness {
  sequence: number;
  argument: any;
  annotation: "tuple[float, ...]";
}

export interface StrictFloatArrayProgram extends CanonicalScalarProgram {
  annotatedFloatArguments: StrictFloatArgumentWitness[];
  annotatedSequence: StrictFloatSequenceWitness;
}

function owningFunction(compiler: any, ancestors: readonly any[]): any | null {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (ancestors[index] instanceof compiler.AST_Function) {
      return ancestors[index];
    }
  }
  return null;
}

function exactFloatArgument(compiler: any, argument: any): boolean {
  return argument?.annotation instanceof compiler.AST_SymbolRef &&
    argument.annotation.name === "float" && argument.annotation_text === "float";
}

function exactFloatTupleArgument(compiler: any, argument: any): boolean {
  const annotation = argument?.annotation;
  return annotation instanceof compiler.AST_ItemAccess &&
    annotation.expression instanceof compiler.AST_SymbolRef &&
    annotation.expression.name === "tuple" &&
    argument.annotation_text === "tuple[float, ...]";
}

function expressionSequenceOrders(
  expression: ScalarExpression,
  orders: Set<"forward" | "reverse">,
): void {
  if (expression.kind === "sequence") {
    orders.add(expression.indexOrder);
  } else if (expression.kind === "binary") {
    expressionSequenceOrders(expression.left, orders);
    expressionSequenceOrders(expression.right, orders);
  } else if (expression.kind === "neg" || expression.kind === "power") {
    expressionSequenceOrders(expression.value, orders);
  }
}

function statementSequenceOrders(
  statements: readonly ScalarStatement[],
  orders: Set<"forward" | "reverse">,
): void {
  for (const statement of statements) {
    if (statement.kind === "assign") {
      expressionSequenceOrders(statement.value, orders);
      continue;
    }
    expressionSequenceOrders(statement.condition.left, orders);
    expressionSequenceOrders(statement.condition.right, orders);
    statementSequenceOrders(statement.body, orders);
    statementSequenceOrders(statement.alternative, orders);
  }
}

/**
 * Recognize the deliberately narrow v1 strict-array domain.
 *
 * The source boundary is one explicitly contracted function, one direct or
 * `reversed` immutable tuple iterator, exact float/tuple annotations, and an
 * ordered scalar reduction graph. Annotations remain hints: lowering still
 * authenticates every live scalar, the tuple brand, and every element.
 */
export function recognizeStrictFloatArrayProgram(
  compiler: any,
  loop: any,
  ancestors: readonly any[],
): StrictFloatArrayProgram | null {
  const definition = owningFunction(compiler, ancestors);
  if (!definition?.optimization_contract ||
      definition.optimization_contract.requiredPassId !== STRICT_FLOAT_ARRAY_PASS) {
    return null;
  }
  const program = recognizeClosedScalarProgram(compiler, loop);
  if (!program || program.iteratorKind !== "sequence" ||
      program.sequences.length !== 1 || program.integerConstants.length !== 0 ||
      program.inplaceOperations.length !== 0 || program.inputSlots.length === 0 ||
      program.stateSlots.length === 0 ||
      program.operations.some((operation) =>
        !["add", "sub", "mul", "neg", "equal"].includes(operation))) {
    return null;
  }

  const argumentsByName = new Map<string, any>();
  for (const argument of definition.argnames ?? []) {
    argumentsByName.set(argument.name, argument);
  }
  const annotatedFloatArguments: StrictFloatArgumentWitness[] = [];
  for (const slot of program.inputSlots) {
    const argument = argumentsByName.get(program.slots[slot]?.name);
    if (!exactFloatArgument(compiler, argument)) return null;
    annotatedFloatArguments.push({ slot, argument });
  }
  const sequenceArgument = argumentsByName.get(program.sequences[0].name);
  if (!exactFloatTupleArgument(compiler, sequenceArgument)) return null;

  const orders = new Set<"forward" | "reverse">();
  statementSequenceOrders(program.semanticStatements, orders);
  if (orders.size !== 1 || !orders.has(program.iterationOrder)) return null;

  return {
    ...program,
    annotatedFloatArguments,
    annotatedSequence: {
      sequence: 0,
      argument: sequenceArgument,
      annotation: "tuple[float, ...]",
    },
  };
}
