export interface NativeCompileOptions {
  sourcePath: string;
  /** Stable package-relative identity used by shipped native artifacts. */
  sourceKey?: string;
  cacheRoot?: string;
  functions?: string[];
}

export interface NativeCompileResult {
  addonPath: string;
  cacheKey: string;
  cached: boolean;
  ir: {
    version: number;
    functions: ReadonlyArray<{
      name: string;
      [key: string]: unknown;
    }>;
    callGraph: Readonly<Record<string, ReadonlyArray<string>>>;
    foreignLibraries: ReadonlyArray<{
      id: string;
      declarationHash: string;
      declarationIdentity: string;
      pythonModule: string;
      dynamic: Readonly<Record<string, unknown>>;
      native: Readonly<Record<string, unknown>>;
    }>;
  };
  modulePath: string;
  outputPath: string;
  coreSourcePath: string | null;
  coreHeaderPath: string | null;
}

export interface NativeAnalysisResult {
  sourcePath: string;
  source: string;
  ir: NativeCompileResult["ir"];
}

export interface NativeEmissionResult extends NativeAnalysisResult {
  cSource: string;
  cSourceMap: ReadonlyArray<{
    id: string;
    location: string;
    origins: ReadonlyArray<string>;
    generated: { startLine: number; endLine: number };
  }>;
}

export interface NativeCoreEmissionResult extends NativeAnalysisResult {
  coreSource: string;
  coreHeader: string;
  coreSourceMap: NativeEmissionResult["cSourceMap"];
  hostIsolation: {
    isolated: true;
    boundary: "packed-c-abi";
    hostCallbacks: 0;
    forbiddenApis: ReadonlyArray<string>;
    nativeDependencies: ReadonlyArray<string>;
    functions: ReadonlyArray<string>;
  };
}

export interface NativeAuditResult {
  schemaVersion: 1;
  rootPath: string;
  summary: {
    modules: number;
    functions: number;
    eligibleFunctions: number;
    rejectedFunctions: number;
    rejectionCategories: Readonly<Record<string, number>>;
  };
  modules: ReadonlyArray<Record<string, unknown>>;
}

/** Lower source to the optimized, source-provenance-carrying typed IR. */
export function analyze(
  options: NativeCompileOptions,
): Promise<NativeAnalysisResult>;

/** Recursively explain every Python function below a file or directory. */
export function audit(
  options: NativeCompileOptions,
): Promise<NativeAuditResult>;

/** Explain eligibility, inferred storage, dispatch, and optimizations. */
export function explain(
  options: NativeCompileOptions,
): Promise<Record<string, unknown>>;

/** Emit deterministic annotated C without invoking a C compiler. */
export function emitC(
  options: NativeCompileOptions,
): Promise<NativeEmissionResult>;

/** Emit the host-independent mathematical core and its public C header. */
export function emitCore(
  options: NativeCompileOptions,
): Promise<NativeCoreEmissionResult>;

/** Compile every `@native` function in a Sage.js source file. */
export function compile(
  options: NativeCompileOptions,
): Promise<NativeCompileResult>;

/** Low-level compiler entry point; prefer `compile` in application code. */
export function compileKernel(
  options: NativeCompileOptions,
): Promise<NativeCompileResult>;
