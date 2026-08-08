export interface NativeCompileOptions {
  sourcePath: string;
  cacheRoot?: string;
}

export interface NativeCompileResult {
  addonPath: string;
  cacheKey: string;
  cached: boolean;
  ir: {
    version: number;
    functions: ReadonlyArray<Record<string, unknown>>;
  };
  modulePath: string;
  outputPath: string;
}

/** Compile every `@native` function in a Sage.js source file. */
export function compile(
  options: NativeCompileOptions,
): Promise<NativeCompileResult>;

/** Low-level compiler entry point; prefer `compile` in application code. */
export function compileKernel(
  options: NativeCompileOptions,
): Promise<NativeCompileResult>;
