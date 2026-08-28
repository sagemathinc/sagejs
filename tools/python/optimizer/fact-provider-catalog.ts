import { packedContainerDomainPlugin } from
  "./domains/packed-container";

export interface OptimizerFactProviderPlugin {
  readonly id: string;
  readonly domainId: string;
  readonly priority: number;
  readonly claimSemantics: "exclusive";
  readonly analysisId: string;
  readonly planningId: string;
  readonly representationId: string;
  readonly verifierId: string;
  readonly factsProduced: readonly string[];
  readonly supportedConsumers: readonly ("v8" | "wasm" | "native")[];
  readonly publicMutableStorage: false;
  readonly analyze: (...arguments_: any[]) => any;
  readonly requirePlan: (...arguments_: any[]) => any;
  readonly verify: (...arguments_: any[]) => any;
}

export interface OptimizerFactProviderCatalog {
  readonly plugins: readonly OptimizerFactProviderPlugin[];
  readonly factOwners: Readonly<Record<string, string>>;
}

/**
 * Build the target-neutral fact-provider registry.
 *
 * Fact providers prove reusable representation boundaries. They never own an
 * executable AST lowering; a consuming mathematical pass must carry the
 * verified plan into its own target and fallback contract.
 */
export function createOptimizerFactProviderCatalog(
  source: readonly OptimizerFactProviderPlugin[],
): OptimizerFactProviderCatalog {
  const ids = new Set<string>();
  const priorities = new Set<number>();
  const factOwners: Record<string, string> = Object.create(null);
  const plugins = source.map((plugin) => {
    for (const [field, value] of [
      ["id", plugin.id],
      ["domainId", plugin.domainId],
      ["analysisId", plugin.analysisId],
      ["planningId", plugin.planningId],
      ["representationId", plugin.representationId],
      ["verifierId", plugin.verifierId],
    ] as const) {
      if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(`optimizer fact provider has invalid ${field}`);
      }
    }
    if (ids.has(plugin.id)) {
      throw new TypeError(`duplicate optimizer fact provider ${plugin.id}`);
    }
    if (!Number.isSafeInteger(plugin.priority) || plugin.priority < 0 ||
        priorities.has(plugin.priority)) {
      throw new TypeError(`invalid or duplicate fact-provider priority ${plugin.priority}`);
    }
    if (plugin.claimSemantics !== "exclusive" ||
        plugin.publicMutableStorage !== false) {
      throw new TypeError(`unsafe optimizer fact provider ${plugin.id}`);
    }
    for (const method of ["analyze", "requirePlan", "verify"] as const) {
      if (typeof plugin[method] !== "function") {
        throw new TypeError(`optimizer fact provider ${plugin.id} lacks ${method}`);
      }
    }
    if (plugin.factsProduced.length === 0 ||
        plugin.supportedConsumers.length === 0) {
      throw new TypeError(`optimizer fact provider ${plugin.id} is incomplete`);
    }
    ids.add(plugin.id);
    priorities.add(plugin.priority);
    for (const fact of plugin.factsProduced) {
      if (!fact || Object.prototype.hasOwnProperty.call(factOwners, fact)) {
        throw new TypeError(`duplicate or invalid optimizer fact ${fact}`);
      }
      factOwners[fact] = plugin.id;
    }
    return Object.freeze({
      ...plugin,
      factsProduced: Object.freeze([...plugin.factsProduced]),
      supportedConsumers: Object.freeze([...plugin.supportedConsumers]),
    });
  }).sort((left, right) =>
    right.priority - left.priority || left.id.localeCompare(right.id)
  );
  return Object.freeze({
    plugins: Object.freeze(plugins),
    factOwners: Object.freeze(factOwners),
  });
}

/** The only integration-owned composition point for representation facts. */
export const optimizerFactProviderCatalog = createOptimizerFactProviderCatalog([
  packedContainerDomainPlugin,
]);
