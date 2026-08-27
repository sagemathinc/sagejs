import { optimizerControls } from "./controls";
import { OptimizerPassManager } from "./pass-manager";
import { closedAffineRecurrencePass } from "./passes/closed-affine-recurrence";
import { OptimizationProgram } from "./types";

export * from "./controls";
export * from "./explain";
export * from "./types";
export * from "./verifier";
export { CLOSED_AFFINE_RECURRENCE_PASS } from "./passes/closed-affine-recurrence";

export function optimizePythonAst(
  compiler: any,
  ast: any,
  options: Record<string, any> = {},
): OptimizationProgram {
  const controls = optimizerControls(options);
  return new OptimizerPassManager(
    compiler,
    controls,
    [closedAffineRecurrencePass],
  ).run(ast);
}
