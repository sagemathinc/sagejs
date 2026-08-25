import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAsset, getAssetKeys, isSea } from "node:sea";

const CAPABILITY_REPORT_ASSET =
  "architecture/wasm-capabilities-report.json";

function architectureDirectory(): string {
  const candidates = [
    join(__dirname, "..", "architecture"),
    join(__dirname, "..", "..", "architecture"),
  ];
  const result = candidates.find((candidate) =>
    existsSync(join(candidate, "wasm-capabilities-report.json"))
  );
  if (!result) throw new Error("the generated WebAssembly capability report is missing");
  return result;
}

function immutableJson(value: any): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(immutableJson));
  const result: Record<string, any> = Object.create(null);
  for (const [key, item] of Object.entries(value)) result[key] = immutableJson(item);
  return Object.freeze(result);
}

/** Load the generated report into the narrow immutable host query surface. */
export function loadSagejsCapabilityApi(): any {
  const serialized = isSea()
    ? (() => {
      if (!getAssetKeys().includes(CAPABILITY_REPORT_ASSET)) {
        throw new Error("the generated WebAssembly capability report is missing");
      }
      return Buffer.from(getAsset(CAPABILITY_REPORT_ASSET)).toString("utf8");
    })()
    : readFileSync(
      join(architectureDirectory(), "wasm-capabilities-report.json"),
      "utf8",
    );
  const report = immutableJson(JSON.parse(serialized));
  if (
    report.schema !== "sagejs.wasm-capability-report/v1" ||
    !Array.isArray(report.capabilities) ||
    report.workflow_aliases === null ||
    typeof report.workflow_aliases !== "object"
  ) {
    throw new TypeError("invalid generated WebAssembly capability report");
  }
  const byId = new Map<string, any>();
  const families = new Set<string>();
  for (const record of report.capabilities) {
    if (
      typeof record.id !== "string" || record.id.length === 0 ||
      typeof record.family !== "string" || record.family.length === 0 ||
      byId.has(record.id)
    ) throw new TypeError("invalid generated WebAssembly capability record");
    byId.set(record.id, record);
    families.add(record.family);
  }
  function sagejsCapabilities(family: string | null = null) {
    if (family === null) return report.capabilities;
    const prefix = typeof family === "string" && family.endsWith("s")
      ? `${family.slice(0, -1)}-`
      : "";
    if (
      typeof family !== "string" ||
      (!families.has(family) && ![...families].some((name) => name.startsWith(prefix)))
    ) {
      throw new RangeError(`unknown Sage.js capability family ${JSON.stringify(family)}`);
    }
    return Object.freeze(report.capabilities.filter((record: any) =>
      record.family === family || (prefix !== "" && record.family.startsWith(prefix))
    ));
  }
  function workflow(tag: string) {
    const required = report.workflow_aliases[tag];
    if (!Array.isArray(required)) {
      throw new RangeError(`unknown Sage.js workflow ${JSON.stringify(tag)}`);
    }
    const unknown = required.filter((id: any) => !byId.has(id));
    if (unknown.length) throw new TypeError("workflow contains an unknown capability ID");
    const unavailable = Object.freeze(required.filter((id: string) =>
      !["available", "fallback"].includes(byId.get(id).status)
    ));
    return Object.freeze({
      tag,
      required_capabilities: required,
      capabilities: Object.freeze(required.map((id: string) => byId.get(id))),
      available: unavailable.length === 0,
      unavailable_capabilities: unavailable,
    });
  }
  return Object.freeze({
    report,
    sagejs_capabilities: sagejsCapabilities,
    workflow,
  });
}
