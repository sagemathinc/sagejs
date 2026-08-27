import { stableRegionIdentity } from "./identity";
import {
  FunctionOptimizationContract,
  OPTIMIZER_IR_SCHEMA,
  OptimizationCoverage,
  OptimizationGuardFailure,
  OptimizationTargetRequirement,
  SourceRegion,
} from "./types";

export interface CollectedOptimizationContracts {
  contracts: FunctionOptimizationContract[];
  byFunction: WeakMap<object, FunctionOptimizationContract>;
  entries: Array<{ definition: any; contract: FunctionOptimizationContract }>;
}

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function importedLocalName(argument: any): string {
  return argument.alias?.name ?? argument.name;
}

function stringKeywordArguments(
  compiler: any,
  call: any,
  functionName: string,
): Map<string, string> {
  if (!(call instanceof compiler.AST_Call) || call.args?.length !== 0 ||
      call.args?.starargs || (call.args?.kwarg_items?.length ?? 0) !== 0) {
    throw new SyntaxError(
      `@optimize on ${functionName} accepts keyword string literals only`,
    );
  }
  const result = new Map<string, string>();
  for (const pair of call.args?.kwargs ?? []) {
    const [key, value] = pair;
    if (!(key instanceof compiler.AST_SymbolRef) ||
        !(value instanceof compiler.AST_String)) {
      throw new SyntaxError(
        `@optimize on ${functionName} accepts keyword string literals only`,
      );
    }
    if (result.has(key.name)) {
      throw new SyntaxError(`@optimize on ${functionName} repeats ${key.name}`);
    }
    result.set(key.name, value.value);
  }
  const allowed = new Set(["require", "coverage", "target", "guard_failure"]);
  for (const key of result.keys()) {
    if (!allowed.has(key)) {
      throw new SyntaxError(`@optimize on ${functionName} has unknown option ${key}`);
    }
  }
  return result;
}

function countLexicalLoops(compiler: any, definition: any): number {
  let count = 0;
  const seen = new Set<any>();
  const visit = (value: any): void => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    if (value !== definition &&
        (value instanceof compiler.AST_Function ||
         value instanceof compiler.AST_Class)) return;
    if (value instanceof compiler.AST_ForIn || value instanceof compiler.AST_While) {
      count += 1;
    }
    for (const [key, child] of Object.entries(value)) {
      if (["start", "end", "scope", "thedef", "imports", "globals"].includes(key) ||
          typeof child === "function") continue;
      visit(child);
    }
  };
  visit(definition.body);
  return count;
}

function assignedNames(compiler: any, statement: any): string[] {
  const result: string[] = [];
  const targetNames = (value: any): void => {
    if (!value || typeof value !== "object") return;
    if (value instanceof compiler.AST_SymbolRef ||
        value instanceof compiler.AST_SymbolDeclaration) {
      result.push(value.name);
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) targetNames(child);
      return;
    }
    for (const key of ["elements", "names"]) targetNames(value[key]);
  };
  if (statement instanceof compiler.AST_Function ||
      statement instanceof compiler.AST_Class) {
    if (statement.name?.name) result.push(statement.name.name);
  }
  if (statement instanceof compiler.AST_Var) {
    for (const declaration of statement.definitions ?? []) {
      targetNames(declaration.name);
    }
  }
  const body = statement instanceof compiler.AST_SimpleStatement
    ? statement.body
    : statement;
  if (body instanceof compiler.AST_Assign) targetNames(body.left);
  if (body instanceof compiler.AST_AnnotatedAssignment) targetNames(body.target);
  return result;
}

function contractForFunction(
  compiler: any,
  definition: any,
  optimizeBindings: ReadonlySet<string>,
): FunctionOptimizationContract | null {
  let decoratorCall: any = null;
  for (const decorator of definition.decorators ?? []) {
    const expression = decorator.expression;
    if (expression instanceof compiler.AST_Call &&
        expression.expression instanceof compiler.AST_SymbolRef &&
        optimizeBindings.has(expression.expression.name)) {
      if (decoratorCall) {
        throw new SyntaxError(`function ${definition.name.name} repeats @optimize`);
      }
      decoratorCall = expression;
    } else if (expression instanceof compiler.AST_SymbolRef &&
               optimizeBindings.has(expression.name)) {
      throw new SyntaxError(
        `@optimize on ${definition.name.name} must include an explicit contract`,
      );
    }
  }
  if (!decoratorCall) return null;
  if ((definition.decorators?.length ?? 0) !== 1) {
    throw new SyntaxError(
      `@optimize on ${definition.name.name} cannot currently be stacked with other decorators`,
    );
  }
  const options = stringKeywordArguments(
    compiler,
    decoratorCall,
    definition.name.name,
  );
  const requiredPassId = options.get("require") ?? "";
  if (!requiredPassId) {
    throw new SyntaxError(`@optimize on ${definition.name.name} requires require=...`);
  }
  const coverage = (options.get("coverage") ?? "all-loops") as OptimizationCoverage;
  if (coverage !== "all-loops" && coverage !== "at-least-one") {
    throw new SyntaxError(`@optimize on ${definition.name.name} has invalid coverage`);
  }
  const target = (options.get("target") ?? "auto") as OptimizationTargetRequirement;
  if (!["auto", "v8", "wasm", "native", "library", "generic"].includes(target)) {
    throw new SyntaxError(`@optimize on ${definition.name.name} has invalid target`);
  }
  const guardFailure = (options.get("guard_failure") ?? "fallback") as
    OptimizationGuardFailure;
  if (guardFailure !== "fallback" && guardFailure !== "error") {
    throw new SyntaxError(
      `@optimize on ${definition.name.name} has invalid guard_failure`,
    );
  }
  const source = sourceRegion(definition);
  const identity = stableRegionIdentity("function.optimize-contract.v1", source, {
    functionName: definition.name.name,
    requiredPassId,
    coverage,
    target,
    guardFailure,
  });
  return {
    schema: OPTIMIZER_IR_SCHEMA,
    id: identity.id,
    functionName: definition.name.name,
    source,
    requiredPassId,
    coverage,
    target,
    guardFailure,
    loopCount: countLexicalLoops(compiler, definition),
    matchedRegionIds: [],
    status: "pending",
  };
}

/** Collect exact, evaluation-order import-proven function optimizer contracts. */
export function collectOptimizationContracts(
  compiler: any,
  root: any,
): CollectedOptimizationContracts {
  const contracts: FunctionOptimizationContract[] = [];
  const byFunction = new WeakMap<object, FunctionOptimizationContract>();
  const entries: Array<{
    definition: any;
    contract: FunctionOptimizationContract;
  }> = [];
  const optimizeBindings = new Set<string>();
  for (const statement of root.body ?? []) {
    if (statement instanceof compiler.AST_Imports) {
      for (const imported of statement.imports ?? []) {
        if (imported.star) {
          optimizeBindings.clear();
          continue;
        }
        if (imported.argnames) {
          for (const argument of imported.argnames) {
            const localName = importedLocalName(argument);
            optimizeBindings.delete(localName);
            if (imported.key === "sagejs.compiler" &&
                argument.name === "optimize") {
              optimizeBindings.add(localName);
            }
          }
        } else {
          optimizeBindings.delete(imported.alias?.name ?? imported.key.split(".")[0]);
        }
      }
      continue;
    }
    if (statement instanceof compiler.AST_Function) {
      const contract = contractForFunction(compiler, statement, optimizeBindings);
      if (contract) {
        contracts.push(contract);
        byFunction.set(statement, contract);
        entries.push({ definition: statement, contract });
        statement.optimization_contract = contract;
      }
    }
    for (const name of assignedNames(compiler, statement)) {
      optimizeBindings.delete(name);
    }
  }
  contracts.sort((left, right) => left.id.localeCompare(right.id));
  return { contracts, byFunction, entries };
}

export function nearestOwningFunction(
  compiler: any,
  ancestors: readonly any[],
): any | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (ancestors[index] instanceof compiler.AST_Function) {
      return ancestors[index];
    }
  }
  return undefined;
}
