const REPORT_SCHEMA = "sagejs.wasm-capability-report/v1";
const STATUSES = new Set([
  "available",
  "planned",
  "fallback",
  "desktop-only",
  "remove",
]);
const USABLE_STATUSES = new Set(["available", "fallback"]);

function fail(message) {
  throw new TypeError(`invalid Sage.js WebAssembly capability report: ${message}`);
}

function plainRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function nonemptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a nonempty string`);
  }
  return value;
}

function stringArray(value, label, { nonempty = false } = {}) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    fail(`${label} must be${nonempty ? " a nonempty" : " an"} array`);
  }
  const result = value.map((item, index) =>
    nonemptyString(item, `${label}[${index}]`)
  );
  if (new Set(result).size !== result.length) {
    fail(`${label} contains duplicates`);
  }
  return Object.freeze(result);
}

function immutableJson(value, label) {
  if (value === null || ["string", "boolean"].includes(typeof value)) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item, index) =>
      immutableJson(item, `${label}[${index}]`)
    ));
  }
  if (typeof value !== "object") fail(`${label} is not JSON data`);
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    result[key] = immutableJson(item, `${label}.${key}`);
  }
  return Object.freeze(result);
}

/**
 * Validate and detach the generated public capability report.
 *
 * The returned object is deeply immutable. Unknown workflow capability IDs,
 * duplicate IDs, malformed status values, and partial records are rejected;
 * callers never receive a best-effort interpretation of unreviewed data.
 */
export function validateSagejsCapabilityReport(input) {
  const report = plainRecord(input, "report");
  if (report.schema !== REPORT_SCHEMA) fail(`unsupported schema ${report.schema}`);
  const source = nonemptyString(report.source, "source");
  const sourceSha256 = nonemptyString(report.source_sha256, "source_sha256");
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) fail("source_sha256 is not SHA-256");

  if (!Array.isArray(report.capabilities)) fail("capabilities must be an array");
  const ids = new Set();
  const capabilities = Object.freeze(report.capabilities.map((inputRecord, index) => {
    const record = plainRecord(inputRecord, `capabilities[${index}]`);
    const id = nonemptyString(record.id, `capabilities[${index}].id`);
    if (ids.has(id)) fail(`duplicate capability ID ${id}`);
    ids.add(id);
    const status = nonemptyString(record.status, `${id}.status`);
    if (!STATUSES.has(status)) fail(`${id} has unknown status ${status}`);
    const publicConsumers = stringArray(
      record.public_consumers,
      `${id}.public_consumers`,
      { nonempty: true },
    );
    return Object.freeze({
      id,
      family: nonemptyString(record.family, `${id}.family`),
      disposition: nonemptyString(record.disposition, `${id}.disposition`),
      status,
      fallback: nonemptyString(record.fallback, `${id}.fallback`),
      wasm_module: nonemptyString(record.wasm_module, `${id}.wasm_module`),
      public_consumers: publicConsumers,
      explanation: nonemptyString(record.explanation, `${id}.explanation`),
      ...(record.resource_limits === undefined ? {} : {
        resource_limits: immutableJson(record.resource_limits, `${id}.resource_limits`),
      }),
    });
  }));

  const aliasesInput = plainRecord(report.workflow_aliases, "workflow_aliases");
  const workflowAliases = Object.create(null);
  for (const tag of Object.keys(aliasesInput).sort()) {
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) fail(`invalid workflow tag ${tag}`);
    const required = stringArray(
      aliasesInput[tag],
      `workflow_aliases.${tag}`,
      { nonempty: true },
    );
    const unknown = required.filter((id) => !ids.has(id));
    if (unknown.length) {
      fail(`workflow ${tag} contains unknown capability IDs: ${unknown.join(", ")}`);
    }
    workflowAliases[tag] = required;
  }

  const counts = plainRecord(report.counts, "counts");
  if (!Number.isSafeInteger(counts.total) || counts.total !== capabilities.length) {
    fail("counts.total does not match capabilities");
  }
  for (const field of ["by_kind", "by_disposition", "by_status"]) {
    const group = plainRecord(counts[field], `counts.${field}`);
    let total = 0;
    for (const [key, value] of Object.entries(group)) {
      nonemptyString(key, `counts.${field} key`);
      if (!Number.isSafeInteger(value) || value < 0) {
        fail(`counts.${field}.${key} must be a nonnegative safe integer`);
      }
      total += value;
    }
    if (total !== counts.total) fail(`counts.${field} does not sum to counts.total`);
  }
  return Object.freeze({
    schema: REPORT_SCHEMA,
    source,
    source_sha256: sourceSha256,
    counts: immutableJson(counts, "counts"),
    workflow_aliases: Object.freeze(workflowAliases),
    capabilities,
  });
}

/**
 * Construct the small query surface used by website, mobile, and host shells.
 *
 * `availableCapabilityIds` may be a receipt-authenticated production closure.
 * When omitted, reviewed report statuses define usability. When supplied,
 * every identifier must be reviewed and workflow availability is based only
 * on that exact closure.
 */
export function createSagejsCapabilityAPI(
  reportInput,
  { availableCapabilityIds } = {},
) {
  const report = validateSagejsCapabilityReport(reportInput);
  const byId = new Map(report.capabilities.map((record) => [record.id, record]));
  const families = Object.freeze(
    [...new Set(report.capabilities.map((record) => record.family))].sort(),
  );
  let receiptIds;
  if (availableCapabilityIds !== undefined) {
    receiptIds = new Set(availableCapabilityIds);
    for (const id of receiptIds) {
      if (typeof id !== "string" || !byId.has(id)) {
        fail(`production closure contains unknown capability ID ${String(id)}`);
      }
    }
  }

  function capability(id) {
    const result = byId.get(id);
    if (!result) throw new RangeError(`unknown Sage.js capability ${JSON.stringify(id)}`);
    return result;
  }

  function sagejsCapabilities(family = null) {
    if (family === null || family === undefined) return report.capabilities;
    const prefix = typeof family === "string" && family.endsWith("s")
      ? `${family.slice(0, -1)}-`
      : "";
    const matches = typeof family === "string"
      ? report.capabilities.filter((record) =>
        record.family === family || (prefix !== "" && record.family.startsWith(prefix))
      )
      : [];
    if (matches.length === 0) {
      throw new RangeError(`unknown Sage.js capability family ${JSON.stringify(family)}`);
    }
    return Object.freeze(matches);
  }

  function isAvailable(id) {
    const record = capability(id);
    return receiptIds === undefined
      ? USABLE_STATUSES.has(record.status)
      : receiptIds.has(id);
  }

  function workflow(tag) {
    const required = report.workflow_aliases[tag];
    if (!required) throw new RangeError(`unknown Sage.js workflow ${JSON.stringify(tag)}`);
    const records = Object.freeze(required.map((id) => capability(id)));
    const unavailable = Object.freeze(required.filter((id) => !isAvailable(id)));
    return Object.freeze({
      tag,
      required_capabilities: required,
      capabilities: records,
      available: unavailable.length === 0,
      unavailable_capabilities: unavailable,
    });
  }

  return Object.freeze({
    report,
    families: () => families,
    capability,
    hasCapability: (id) => typeof id === "string" && byId.has(id),
    isAvailable,
    sagejs_capabilities: sagejsCapabilities,
    sagejsCapabilities,
    workflow,
    workflowTags: () => Object.freeze(Object.keys(report.workflow_aliases)),
  });
}

export const capabilityReportSchema = REPORT_SCHEMA;
