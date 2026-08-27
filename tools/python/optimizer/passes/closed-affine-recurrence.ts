import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";

export const CLOSED_AFFINE_RECURRENCE_PASS =
  "math.closed-affine-recurrence.v1";

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function regionId(source: SourceRegion): string {
  return `${CLOSED_AFFINE_RECURRENCE_PASS}@${source.filename}:` +
    `${source.line}:${source.column}`;
}

function recognize(compiler: any, loop: any): null | Record<string, any> {
  if (!(loop instanceof compiler.AST_ForIn) || loop.alternative ||
      loop.builtin_range === false) return null;
  const init = loop.init;
  const object = loop.object;
  const body = loop.body;
  if (!(init instanceof compiler.AST_SymbolRef)) return null;
  if (!(object instanceof compiler.AST_Call) ||
      !(object.expression instanceof compiler.AST_SymbolRef) ||
      object.expression.name !== "range" || object.args?.length !== 1 ||
      object.args.starargs || object.args.kwargs?.length ||
      object.args.kwarg_items?.length) return null;
  const count = object.args[0];
  if (!(count instanceof compiler.AST_SymbolRef) &&
      !(count instanceof compiler.AST_Number)) return null;
  if (!(body instanceof compiler.AST_BlockStatement) ||
      body.body?.length !== 1) return null;
  const statement = body.body[0];
  if (!(statement instanceof compiler.AST_SimpleStatement)) return null;
  const assignment = statement.body;
  if (!(assignment instanceof compiler.AST_Assign) ||
      assignment.operator !== "=" ||
      !(assignment.left instanceof compiler.AST_SymbolRef)) return null;
  const addition = assignment.right;
  if (!(addition instanceof compiler.AST_Binary) ||
      addition.operator !== "+" ||
      !(addition.right instanceof compiler.AST_SymbolRef)) return null;
  const multiplication = addition.left;
  if (!(multiplication instanceof compiler.AST_Binary) ||
      multiplication.operator !== "*" ||
      !(multiplication.left instanceof compiler.AST_SymbolRef) ||
      !(multiplication.right instanceof compiler.AST_SymbolRef)) return null;
  const accumulator = assignment.left;
  if (multiplication.left.name !== accumulator.name) return null;
  const names = [
    accumulator.name,
    multiplication.right.name,
    addition.right.name,
  ];
  if (new Set(names).size !== 3 || names.includes(init.name)) return null;
  return {
    accumulator,
    multiplier: multiplication.right,
    increment: addition.right,
    count,
    index: init,
  };
}

export const closedAffineRecurrencePass: OptimizationPass = {
  id: CLOSED_AFFINE_RECURRENCE_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  factsConsumed: ["builtin-range", "lexical-binding"],
  factsProduced: [
    "no-alias", "no-escape", "no-callback", "operation-closed",
    "parent-identity", "method-stability", "exact-range",
  ],
  preserves: [
    "python-range-evaluation", "final-loop-target", "exceptions",
    "generic-fallback",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node) => {
      const operands = recognize(context.compiler, node);
      if (!operands) return;
      const source = sourceRegion(node);
      const id = regionId(source);
      context.consider({
        minimumLevel: "O2",
        node,
        internal: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_AFFINE_RECURRENCE_PASS,
          kind: "closed-affine-recurrence",
          operands,
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_AFFINE_RECURRENCE_PASS,
          source,
          semantic: {
            kind: "sage.for-range.closed-affine-recurrence",
            operations: ["range", "mul-dispatch", "add-dispatch", "assign"],
            observableExits: ["accumulator", "loop-index"],
            exceptionPolicy: "entry guards precede optimized effects; exact loop fallback",
          },
          mathematical: {
            kind: "math.closed-affine-recurrence",
            domain: "one guarded closed parent",
            operations: ["math.ring.mul", "math.ring.add"],
            exactness: "runtime representation guard plus target exactness contract",
          },
          facts: [
            {
              kind: "no-alias",
              authority: "static",
              evidence: "loop index, accumulator, multiplier, and increment are distinct lexical bindings",
            },
            {
              kind: "no-escape",
              authority: "static",
              evidence: "the only loop statement assigns the accumulator",
            },
            {
              kind: "no-callback",
              authority: "runtime-guard",
              evidence: "captured parent, prototype, and operation method identities",
            },
            {
              kind: "parent-identity",
              authority: "runtime-guard",
              evidence: "all three operands must have one identical parent",
            },
            {
              kind: "operation-closed",
              authority: "runtime-guard",
              evidence: "parent advertises the reviewed closed arithmetic contract",
            },
            {
              kind: "exact-range",
              authority: "runtime-guard",
              evidence: "selected representation validates canonical inputs and safe intermediates",
            },
          ],
          representation: {
            kind: "guarded-unboxed-affine-state",
            candidates: [
              "number-residue",
              "extension-tuple-number",
              "boxed-sage-value",
            ],
            conversions: ["unbox region inputs", "materialize accumulator at exit"],
            materializations: 1,
          },
          target: {
            kind: "v8",
            lowering: "runtime-versioned primitive numeric loop",
            boundaryCrossings: 0,
            copiedBytes: 0,
          },
          guards: [
            "nonnegative-safe-integer-count",
            "same-parent",
            "reviewed-representation",
            "prototype-and-method-identities",
            "canonical-values",
            "exact-machine-range",
          ],
          fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
        },
      });
    });
  },
};
