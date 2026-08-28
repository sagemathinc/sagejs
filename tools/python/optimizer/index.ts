import { optimizerControls } from "./controls";
import { OptimizerPassManager } from "./pass-manager";
import { optimizerCatalog } from "./catalog";
import { OptimizationProgram } from "./types";

export * from "./controls";
export * from "./catalog";
export * from "./contracts";
export * from "./cost-model";
export * from "./explain";
export * from "./identity";
export * from "./lowerings";
export * from "./types";
export * from "./verifier";
export * from "./domains/ids";

export function optimizePythonAst(
  compiler: any,
  ast: any,
  options: Record<string, any> = {},
): OptimizationProgram {
  const controls = optimizerControls(options);
  return new OptimizerPassManager(
    compiler,
    controls,
    optimizerCatalog,
  ).run(ast);
}
