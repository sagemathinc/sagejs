import { optimizerControls } from "./controls";
import { OptimizerPassManager } from "./pass-manager";
import { closedAffineRecurrencePass } from "./passes/closed-affine-recurrence";
import { closedFieldRegionPass } from "./passes/closed-field-region";
import { OptimizationProgram } from "./types";

export * from "./controls";
export * from "./cost-model";
export * from "./explain";
export * from "./identity";
export * from "./types";
export * from "./verifier";
export { CLOSED_AFFINE_RECURRENCE_PASS } from "./passes/closed-affine-recurrence";
export { CLOSED_FIELD_REGION_PASS } from "./passes/closed-field-region";

export function optimizePythonAst(
  compiler: any,
  ast: any,
  options: Record<string, any> = {},
): OptimizationProgram {
  const controls = optimizerControls(options);
  return new OptimizerPassManager(
    compiler,
    controls,
    [closedAffineRecurrencePass, closedFieldRegionPass],
  ).run(ast);
}
