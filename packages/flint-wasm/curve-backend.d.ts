export interface ComplexBallRecord {
  realMidpoint: string;
  imagMidpoint: string;
  realRadius: string;
  imagRadius: string;
  accuracyBits: number;
}

export interface EllipticLseriesResult {
  status: "ok" | "insufficient_coefficients";
  rigorous: false;
  knownErrorTargetMet: boolean;
  analyticErrorStatus: "coefficient_local_grid_and_outer_tail_only";
  trapezoidDiscretizationStatus: "unbounded_nonrigorous";
  precisionBits: number;
  finePrecisionBits: number;
  refinementBits: number;
  workPrecisionBits: number;
  cutoff: number;
  requiredCutoff: number;
  gridPoints: number;
  coefficientTerms: number;
  pointCount: number;
  gridStep: number;
  maxAbsImag: number;
  maxAbsRealOffset: number;
  values?: Array<{
    point: [string, string];
    completed: ComplexBallRecord;
    raw: ComplexBallRecord;
    coefficientTailBound: string;
    gridOmissionBound: string;
    outerTailBound: string;
    rawConversionMagnitude: string;
    analyticErrorBound: string;
  }>;
  coarseValues?: Array<{
    completed: ComplexBallRecord;
    raw: ComplexBallRecord;
  }>;
  packedValues?: Float64Array;
  packedStride?: 5;
}

export interface EllipticDirectLseriesResult {
  status: "ok";
  algorithm: "direct";
  rigorous: false;
  precisionBits: number;
  workPrecisionBits: number;
  cutoff: number;
  coefficientTerms: number;
  pointCount: number;
  values: Array<{
    completed: ComplexBallRecord;
    raw: ComplexBallRecord;
  }>;
}

export declare const curveCapabilities: Readonly<Record<string, Readonly<{
  family: string;
  disposition: string;
  status: string;
  fallback: string;
  [key: string]: unknown;
}>>>;

export declare function createCurveBackend(
  instance: WebAssembly.Instance | WebAssembly.Exports,
): Readonly<{
  ecApIntegral?(
    a1: bigint | number,
    a2: bigint | number,
    a3: bigint | number,
    a4: bigint | number,
    a6: bigint | number,
    prime: bigint | number,
  ): number;
  ecAnlistIntegral?(
    a1: bigint | number,
    a2: bigint | number,
    a3: bigint | number,
    a4: bigint | number,
    a6: bigint | number,
    discriminant: bigint | number,
    bound: bigint | number,
  ): Int32Array;
  ecLseriesDirectValues?(
    conductor: bigint | string | number,
    coefficients: Array<number | bigint> | Int32Array,
    points: Array<[string, string]>,
    cutoffs: number[],
    precisionBits: number,
  ): EllipticDirectLseriesResult;
  ecLseriesValues(
    conductor: bigint | string | number,
    rootNumber: -1 | 1,
    coefficients: Array<number | bigint> | Int32Array,
    points: Array<[string, string]>,
    precisionBits: number,
    refinementBits?: number,
    outputMode?: 0 | 1 | 2,
  ): EllipticLseriesResult;
  curveCapabilities: typeof curveCapabilities;
}>;
