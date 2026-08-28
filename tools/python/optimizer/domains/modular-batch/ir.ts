/** Stable identities owned by the complete modular-batch plugin. */
export const MODULAR_BATCH_REGION_PASS = "math.modular-batch-region.v1";
export const MODULAR_BATCH_DOMAIN = "prime-residue-modular-batch";
export const MODULAR_BATCH_LOWERING = "v8.modular-batch-loop.v1";
export const MODULAR_BATCH_VERIFIER = "verify.modular-batch-plan.v1";
export const MODULAR_BATCH_INTERNAL_KIND = "modular-batch-region";
export const MODULAR_BATCH_PLUGIN_PRIORITY = 150;

export type ModularBatchOperation =
  | "add"
  | "sub"
  | "mul"
  | "neg"
  | "coerce-integer";

/** Target-neutral expression evaluated independently at each batch index. */
export type ModularBatchExpression =
  | { kind: "input"; input: number }
  | { kind: "integer-constant"; value: number }
  | {
      kind: "binary";
      operator: "+" | "-" | "*";
      left: ModularBatchExpression;
      right: ModularBatchExpression;
    }
  | { kind: "neg"; value: ModularBatchExpression };

export interface ModularBatchInput {
  name: string;
  node: any;
  uses: number;
}

export interface ModularBatchAliasProof {
  kind: "fresh-list-comprehension";
  outputName: string;
  allocationStatementIndex: number;
  allocationCountName: string;
  disjointInputNames: string[];
  inputInputAliasing: "allowed-read-only";
  publication: "after-complete-validation-and-private-computation";
}

/** Canonical semantic graph recognized from one complete source batch. */
export interface CanonicalModularBatchProgram {
  version: 1;
  iteratorName: string;
  iterator: any;
  countName: string;
  count: any;
  outputName: string;
  output: any;
  inputs: ModularBatchInput[];
  expression: ModularBatchExpression;
  operations: ModularBatchOperation[];
  integerConstants: number[];
  operationCost: number;
  aliasProof: ModularBatchAliasProof;
}

export type ModularBatchRecognition =
  | { accepted: true; program: CanonicalModularBatchProgram }
  | { accepted: false; reasons: string[] };
