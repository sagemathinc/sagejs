/** Target-neutral scalar mathematical program recognized from one source loop. */
export type ScalarExpression =
  | { kind: "slot"; slot: number }
  | { kind: "integer-constant"; value: number }
  | {
      kind: "sequence";
      sequence: number;
      indexOrder: "forward" | "reverse";
    }
  | {
      kind: "binary";
      operator: "+" | "-" | "*";
      left: ScalarExpression;
      right: ScalarExpression;
    }
  | { kind: "neg"; value: ScalarExpression }
  | { kind: "power"; exponent: number; value: ScalarExpression };

export interface ScalarCondition {
  kind: "comparison";
  operator: "==" | "!=";
  left: ScalarExpression;
  right: ScalarExpression;
}

export type ScalarStatement =
  | {
      kind: "assign";
      assignmentOperator: "=" | "+=" | "-=" | "*=";
      target: number;
      value: ScalarExpression;
    }
  | {
      kind: "if";
      condition: ScalarCondition;
      body: ScalarStatement[];
      alternative: ScalarStatement[];
    };

export type ScalarAffineTarget =
  | {
      kind: "fixed-increment";
      accumulatorSlot: number;
      multiplierSlot: number;
      incrementSlot: number;
    }
  | {
      kind: "sequence-increment";
      accumulatorSlot: number;
      multiplierSlot: number;
      incrementSequence: number;
      incrementOperator: "add" | "subtract";
    };

export interface ScalarSequenceAccess {
  sequence: number;
  indexOrder: "forward" | "reverse";
  uses: number;
}

export interface CanonicalScalarProgram {
  iteratorKind: "range" | "sequence" | "zip";
  iterationOrder: "forward" | "reverse";
  count: any;
  iterable: any;
  zipCall: any;
  zipStrict: boolean;
  zipIterables: any[];
  zipTargets: any[];
  zipSequenceBindings: number[];
  iterator: any;
  slots: Array<{ name: string; node: any }>;
  sequences: Array<{ name: string; node: any }>;
  inputSlots: number[];
  stateSlots: number[];
  localSlots: number[];
  semanticStatements: ScalarStatement[];
  hoistedExpressions: ScalarExpression[];
  statements: ScalarStatement[];
  eliminatedAssignments: number;
  operations: string[];
  inplaceOperations: Array<"add" | "sub" | "mul">;
  affine: ScalarAffineTarget | null;
  sequenceUses: number[];
  sequenceAccesses: ScalarSequenceAccess[];
  loweredSequenceUses: number[];
  loweredSequenceAccesses: ScalarSequenceAccess[];
  sequenceStrategy: "stream" | "pack";
  integerConstants: number[];
  operationCost: number;
  preheaderOperationCost: number;
}

export interface RecognizedScalarProgram extends CanonicalScalarProgram {
  targetCodeBytes: number;
}
