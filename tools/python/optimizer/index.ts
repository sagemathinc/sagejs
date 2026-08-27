import { optimizerControls } from "./controls";
import { OptimizerPassManager } from "./pass-manager";
import { closedRingRegionPass } from "./passes/closed-field-region";
import { strictFloatRegionPass } from "./passes/strict-float-region";
import { OptimizationProgram } from "./types";

export * from "./controls";
export * from "./contracts";
export * from "./cost-model";
export * from "./explain";
export * from "./identity";
export * from "./lowerings";
export * from "./types";
export * from "./verifier";
export { CLOSED_RING_REGION_PASS } from "./passes/closed-field-region";
export { STRICT_FLOAT_REGION_PASS } from "./passes/strict-float-region";

export function optimizePythonAst(
  compiler: any,
  ast: any,
  options: Record<string, any> = {},
): OptimizationProgram {
  const controls = optimizerControls(options);
  return new OptimizerPassManager(
    compiler,
    controls,
    [strictFloatRegionPass, closedRingRegionPass],
  ).run(ast);
}
