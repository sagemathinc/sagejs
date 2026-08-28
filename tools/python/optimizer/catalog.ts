import { optimizerLoweringContract } from "./lowerings";
import { OptimizationPass } from "./types";
import { closedRingRegionPass } from "./passes/closed-field-region";
import { strictFloatRegionPass } from "./passes/strict-float-region";

export interface OptimizerPassPlugin {
  readonly id: string;
  readonly domainId: string;
  readonly priority: number;
  readonly claimSemantics: "exclusive";
  readonly loweringIds: readonly string[];
  readonly pass: OptimizationPass;
}

export interface OptimizerCatalog {
  readonly plugins: readonly OptimizerPassPlugin[];
}

/** Build an immutable, explicitly ordered optimizer plugin catalog. */
export function createOptimizerCatalog(
  source: readonly OptimizerPassPlugin[],
): OptimizerCatalog {
  const ids = new Set<string>();
  const priorities = new Set<number>();
  const loweringIds = new Set<string>();
  const plugins = source.map((plugin) => {
    if (!plugin.id || plugin.id !== plugin.pass.id) {
      throw new TypeError("optimizer plugin id must equal its pass id");
    }
    if (!plugin.domainId) throw new TypeError(`optimizer plugin ${plugin.id} lacks a domain id`);
    if (!Number.isSafeInteger(plugin.priority) || plugin.priority < 0) {
      throw new TypeError(`optimizer plugin ${plugin.id} has invalid priority`);
    }
    if (ids.has(plugin.id)) throw new TypeError(`duplicate optimizer plugin ${plugin.id}`);
    if (priorities.has(plugin.priority)) {
      throw new TypeError(`duplicate optimizer plugin priority ${plugin.priority}`);
    }
    ids.add(plugin.id);
    priorities.add(plugin.priority);
    if (plugin.claimSemantics !== "exclusive") {
      throw new TypeError(`optimizer plugin ${plugin.id} has unsupported claim semantics`);
    }
    if (!plugin.loweringIds.length) {
      throw new TypeError(`optimizer plugin ${plugin.id} has no registered lowering`);
    }
    for (const loweringId of plugin.loweringIds) {
      if (loweringIds.has(loweringId)) {
        throw new TypeError(`duplicate optimizer lowering ownership ${loweringId}`);
      }
      loweringIds.add(loweringId);
      const lowering = optimizerLoweringContract(loweringId);
      if (!lowering || lowering.passId !== plugin.id) {
        throw new TypeError(
          `optimizer plugin ${plugin.id} does not own lowering ${loweringId}`,
        );
      }
    }
    return Object.freeze({
      ...plugin,
      loweringIds: Object.freeze([...plugin.loweringIds]),
    });
  }).sort((left, right) =>
    right.priority - left.priority || left.id.localeCompare(right.id)
  );
  return Object.freeze({
    plugins: Object.freeze(plugins),
  });
}

/** The only integration-owned composition point for optimizer plugins. */
export const optimizerCatalog = createOptimizerCatalog([
  {
    id: strictFloatRegionPass.id,
    domainId: "strict-binary64",
    priority: 200,
    claimSemantics: "exclusive",
    loweringIds: ["v8.strict-float-loop.v1"],
    pass: strictFloatRegionPass,
  },
  {
    id: closedRingRegionPass.id,
    domainId: "closed-ring",
    priority: 100,
    claimSemantics: "exclusive",
    loweringIds: ["v8.closed-ring-loop.v1"],
    pass: closedRingRegionPass,
  },
]);
