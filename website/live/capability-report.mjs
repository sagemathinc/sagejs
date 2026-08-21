const STATUSES = new Set(["available", "planned", "fallback", "desktop-only", "remove"]);

export function validateCapabilityReport(value) {
  if (!value || typeof value !== "object" || value.schema !== "sagejs.wasm-capability-report/v1") {
    throw new TypeError("unsupported Sage.js capability report");
  }
  if (!Array.isArray(value.capabilities)) throw new TypeError("capability report has no records");
  const capabilities = value.capabilities.map((record) => {
    if (!record || typeof record !== "object") throw new TypeError("capability record must be an object");
    for (const field of ["id", "family", "disposition", "status", "explanation"]) {
      if (typeof record[field] !== "string" || !record[field]) throw new TypeError(`capability record has invalid ${field}`);
    }
    if (!STATUSES.has(record.status)) throw new TypeError(`unknown capability status ${record.status}`);
    return Object.freeze({
      id: record.id,
      family: record.family,
      disposition: record.disposition,
      status: record.status,
      fallback: typeof record.fallback === "string" ? record.fallback : "none",
      wasm_module: typeof record.wasm_module === "string" ? record.wasm_module : "none",
      public_consumers: Array.isArray(record.public_consumers) ? record.public_consumers.map(String) : [],
      explanation: record.explanation,
      resource_limits: record.resource_limits ?? null,
    });
  });
  return Object.freeze({
    schema: value.schema,
    source: String(value.source ?? "unknown"),
    source_sha256: String(value.source_sha256 ?? "unknown"),
    counts: value.counts ?? {},
    capabilities,
  });
}

export function capabilityFamilies(report) {
  return [...new Set(report.capabilities.map((record) => record.family))].sort();
}

export function filterCapabilities(report, { family = "", query = "" } = {}) {
  const search = String(query).trim().toLocaleLowerCase();
  return report.capabilities.filter((record) => {
    if (family && record.family !== family) return false;
    if (!search) return true;
    return [record.id, record.family, record.status, record.explanation, record.fallback, ...record.public_consumers]
      .some((value) => value.toLocaleLowerCase().includes(search));
  });
}
