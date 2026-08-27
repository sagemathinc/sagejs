import {
  OptimizationControls,
  OptimizationLevel,
} from "./types";

const LEVELS = new Set<OptimizationLevel>(["O0", "O1", "O2", "O3", "Os"]);

function environment(name: string): string | undefined {
  const processValue = (globalThis as any)?.process;
  return processValue?.env?.[name];
}

function commaSet(value: unknown): ReadonlySet<string> {
  if (Array.isArray(value)) {
    return new Set(value.map(String).map((item) => item.trim()).filter(Boolean));
  }
  if (value === undefined || value === null || value === "") return new Set();
  return new Set(String(value).split(",").map((item) => item.trim()).filter(Boolean));
}

function level(value: unknown): OptimizationLevel {
  const normalized = String(value ?? "O2") as OptimizationLevel;
  if (!LEVELS.has(normalized)) {
    throw new RangeError(
      `unknown Sage.js optimization level ${JSON.stringify(normalized)}`,
    );
  }
  return normalized;
}

export function optimizationLevelRank(value: OptimizationLevel): number {
  return { O0: 0, O1: 1, O2: 2, O3: 3, Os: 2 }[value];
}

export function optimizerControls(
  options: Record<string, any> = {},
): OptimizationControls {
  return {
    level: level(
      options.optimization_level ?? environment("SAGEJS_OPT_LEVEL") ?? "O2",
    ),
    disabledPasses: commaSet(
      options.optimization_disable ?? environment("SAGEJS_OPT_DISABLE"),
    ),
    requiredOptimizations: commaSet(
      options.optimization_require ?? environment("SAGEJS_OPT_REQUIRE"),
    ),
    explain: options.optimization_explain === true ||
      environment("SAGEJS_OPT_EXPLAIN") === "1",
  };
}
