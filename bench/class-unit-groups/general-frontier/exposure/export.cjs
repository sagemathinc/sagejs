"use strict";

// Developer-only provenance export. Never invokes a mathematical runtime.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const MANIFEST_SCHEMA = "sagejs.general-frontier/exposure-sources-v1";
const OUTPUT_SCHEMA = "sagejs.general-frontier/exposure-inventory-v1";
const HISTORICAL_SHA256 = "b7dc806d98b62f02950f5273c9f50d4126ef9f93a67b1b1c9623f96d0ed4a188";
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_RECORDS = 100_000;
const CATEGORIES = ["prior-sage-exposure", "historical-quarantine", "selection-only", "reference-only"];
const LMFDB_SCHEMAS = new Set([
  "sagejs.number-fields/lmfdb-cubic-stratified-corpus-v2",
  "sagejs.number-fields/lmfdb-class-number-corpus-v1",
  "sagejs.number-fields/lmfdb-quartic-stratified-corpus-v1",
]);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const digest = (value) => sha256(canonical(value));
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function requireThat(ok, message) { if (!ok) throw new Error(message); }
function object(value, name) {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), `${name}: expected object`);
}
function keys(value, allowed, required, name) {
  object(value, name);
  requireThat(Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => key in value), `${name}: unknown or missing keys`);
}
function integer(value, name) {
  requireThat((typeof value === "string" && /^-?(?:0|[1-9][0-9]*)$/.test(value) && value !== "-0") ||
    (typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)), `${name}: expected exact integer string or safe integer`);
  return BigInt(value).toString();
}
function coefficients(value) {
  requireThat(Array.isArray(value) && value.length >= 2 && value.length <= 1025, "coefficients: expected bounded ascending array");
  const result = value.map((x) => integer(x, "coefficient"));
  requireThat(result.at(-1) !== "0", "coefficients: trailing zero is not canonical");
  return result;
}
function label(value) {
  requireThat(typeof value === "string" && /^[1-9][0-9]*\.(?:0|[1-9][0-9]*)\.[1-9][0-9]*\.[1-9][0-9]*$/.test(value), "label: malformed LMFDB assertion");
  const [degree, r1] = value.split(".").map(Number);
  requireThat(Number.isSafeInteger(degree) && degree <= 1024 && r1 <= degree && (degree - r1) % 2 === 0, "label: invalid degree/signature assertion");
  return value; // Syntax is not independent verification that an LMFDB field exists.
}
function rows(value, name) {
  requireThat(Array.isArray(value) && value.length <= MAX_RECORDS, `${name}: expected bounded record array`);
  return value;
}

function normalizeRecord(record, index, options = {}) {
  object(record, "record");
  const invalid = options.invalid === true;
  let poly = options.polynomial ?? record.coefficients ?? record.polynomial;
  if (poly !== undefined && !Array.isArray(poly)) {
    object(poly, "polynomial");
    requireThat(poly.coefficientOrder === "ascending", "polynomial: unsupported coefficient order");
    if (poly.degree !== undefined) requireThat(Array.isArray(poly.coefficients) && poly.degree === poly.coefficients.length - 1, "nested polynomial degree mismatch");
    poly = poly.coefficients;
  }
  const coeffs = poly === undefined ? null : coefficients(poly);
  const fieldLabel = record.label === undefined ? null : label(record.label);
  requireThat(fieldLabel !== null || coeffs !== null, "record lacks a label and polynomial");
  if (coeffs && !invalid) requireThat(coeffs.at(-1) === "1", "valid presentation must be monic");
  if (coeffs && fieldLabel) requireThat(Number(fieldLabel.split(".")[0]) === coeffs.length - 1, "label/polynomial degree mismatch");
  if (record.degree !== undefined && coeffs) requireThat(record.degree === coeffs.length - 1, "record/polynomial degree mismatch");
  const id = record.id ?? record.label ?? `polynomial:${digest(coeffs)}`;
  requireThat(typeof id === "string" && id.length > 0, "record id must be nonempty text");
  const degree = coeffs ? coeffs.length - 1 : Number(fieldLabel.split(".")[0]);
  const signature = record.signature ?? (fieldLabel === null ? null :
    [Number(fieldLabel.split(".")[1]), (degree - Number(fieldLabel.split(".")[1])) / 2]);
  if (signature !== null) requireThat(Array.isArray(signature) && signature.length === 2 &&
    signature.every((x) => Number.isSafeInteger(x) && x >= 0) && signature[0] + 2 * signature[1] === degree,
  "invalid signature assertion");
  if (fieldLabel && signature) requireThat(signature[0] === Number(fieldLabel.split(".")[1]), "label/signature mismatch");
  const discriminant = record.field_discriminant ?? record.fieldDiscriminant;
  return {
    source_record_id: id,
    label: fieldLabel,
    label_status: fieldLabel === null ? null : "source-asserted-not-independently-verified",
    coefficients: coeffs,
    polynomial_sha256: coeffs === null ? null : digest(coeffs),
    degree,
    signature,
    field_discriminant: discriminant === undefined ? null : integer(discriminant, "field discriminant"),
    input_status: invalid ? "declared-invalid-quarantined" : "source-asserted-presentation",
    derivation: options.derivation ?? "source-ascending-coefficients-or-label",
    same_field_reconciliation: invalid ? "not-a-certified-field" : "pending",
  };
}

function decodeSource(source, bytes) {
  const parse = () => JSON.parse(bytes.toString("utf8"));
  const map = (rs, options) => rows(rs, source.kind).map((r, i) => normalizeRecord(r, i, options));
  if (source.kind === "historical-3259-labels") {
    requireThat(source.category === "historical-quarantine" && sha256(bytes) === HISTORICAL_SHA256, "historical union: category or pinned SHA256 mismatch");
    const text = bytes.toString("utf8");
    requireThat(text.endsWith("\n"), "historical union: missing terminal newline");
    const labels = text.slice(0, -1).split("\n");
    requireThat(labels.length === 3259 && new Set(labels).size === 3259 && canonical([...labels].sort(order)) === canonical(labels), "historical union: count/order/duplicate mismatch");
    return map(labels.map((label) => ({ label })));
  }
  if (source.kind === "frozen-cubic-survey-jsonl-gzip") {
    const raw = zlib.gunzipSync(bytes, { maxOutputLength: MAX_BYTES });
    const records = raw.toString("utf8").trim().split("\n").map(JSON.parse);
    requireThat(records.length === 1012 && records.every((r) => r.degree === 3 && ["smoke", "tune"].includes(r.selection?.role)), "frozen survey: unexpected shape/count");
    return map(records);
  }
  const data = parse();
  switch (source.kind) {
    case "lmfdb-fixture":
      requireThat(LMFDB_SCHEMAS.has(data.schema), "unknown LMFDB fixture schema");
      return map(data.records);
    case "legacy-cubic-out-of-sample":
      requireThat(data.schema === "sagejs.benchmark/complex-cubic-lmfdb-out-of-sample-v1", "unknown legacy cubic schema");
      return map(data.records);
    case "class-unit-oracles":
      requireThat(data.schema === undefined && data.schema_version === 1 && Array.isArray(data.cases) && Array.isArray(data.invalid_inputs) && Array.isArray(data.known_hard_cases), "unknown class-unit oracle schema");
      return [...map(data.cases), ...map(data.known_hard_cases), ...map(data.invalid_inputs, { invalid: true })];
    case "high-degree-oracles":
      requireThat(data.schema === undefined && data.schema_version === 1 && Array.isArray(data.oracle_agreement) && data.systems !== undefined, "unknown high-degree oracle schema");
      return map(data.cases);
    case "foundations-oracles":
      requireThat(data.schema === "sagejs.number-fields/foundations-oracle-v1" && data.schemaVersion === 1, "unknown foundations schema");
      return map(data.fields); // Stated isomorphisms remain evidence, not automatically certified merges.
    case "maximal-order-oracles":
      requireThat(data.schema === undefined && data.schemaVersion === 1 && data.implementationFamilies !== null && typeof data.implementationFamilies === "object" && !Array.isArray(data.implementationFamilies) && typeof data.manifestDigest === "string", "unknown maximal-order schema");
      return map(data.cases);
    case "quadratic-discriminants":
      requireThat(data.schema === "sagejs.number-fields/quadratic-class-units-oracle-v1", "unknown quadratic schema");
      return rows(data.cases, source.kind).map((r, i) => {
        const d = integer(r.discriminant, "quadratic discriminant");
        requireThat(BigInt(d) !== 0n, "zero quadratic discriminant");
        return normalizeRecord({ id: `discriminant:${d}`, field_discriminant: d, signature: BigInt(d) > 0n ? [2, 0] : [0, 1], coefficients: [(-BigInt(d)).toString(), "0", "1"] }, i,
          { derivation: "x^2-D-from-source-asserted-quadratic-field-discriminant" });
      });
    case "registered-neighbors":
      requireThat(data.schema === "sagejs.diagnostic/registered-neighbors-v1" && data.selection_only === true && data.benchmark_executed === false && source.category === "selection-only", "unknown or misclassified neighbor registration");
      requireThat(data.exclusion_count === 3259 && data.exclusion_sha256 === HISTORICAL_SHA256 &&
        Array.isArray(data.selected) && digest(data.selected) === data.selected_canonical_sha256 &&
        sha256(data.selected.map((r) => r.label).join("\n") + "\n") === data.selected_labels_sha256,
      "neighbor registration: source exclusion or selected-record binding mismatch");
      return map(data.selected);
    case "explicit-presentations-v1":
      keys(data, ["schema", "records"], ["schema", "records"], "explicit source");
      requireThat(data.schema === "sagejs.general-frontier/exposure-presentations-v1", "unknown explicit presentation schema");
      return rows(data.records, source.kind).map((r, i) => {
        keys(r, ["id", "label", "coefficients", "invalid"], [], "explicit record");
        requireThat(r.invalid === undefined || typeof r.invalid === "boolean", "invalid marker must be boolean");
        return normalizeRecord(r, i, { invalid: r.invalid === true });
      });
    default: throw new Error(`unknown source kind: ${source.kind}`);
  }
}

function readBounded(filename) {
  const status = fs.lstatSync(filename);
  requireThat(status.isFile() && !status.isSymbolicLink() && status.size <= MAX_BYTES, `source must be a bounded regular file: ${filename}`);
  const bytes = fs.readFileSync(filename);
  requireThat(bytes.length <= MAX_BYTES, "source grew beyond size limit");
  return bytes;
}
function descriptor(value, candidate = false) {
  keys(value, candidate ? ["path", "sha256"] : ["id", "path", "sha256", "kind", "category", "note"],
    candidate ? ["path", "sha256"] : ["id", "path", "sha256", "kind", "category"], "source descriptor");
  requireThat(typeof value.path === "string" && value.path.length > 0 && /^[a-f0-9]{64}$/.test(value.sha256), "invalid source path/hash");
  if (!candidate) {
    requireThat(typeof value.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value.id), "invalid source id");
    requireThat(CATEGORIES.includes(value.category), "unknown exposure category");
    requireThat(typeof value.kind === "string", "missing source kind");
    requireThat(value.note === undefined || typeof value.note === "string", "invalid source note");
  }
}
function sourceBytes(value, baseDirectory) {
  const bytes = readBounded(path.resolve(baseDirectory, value.path));
  requireThat(sha256(bytes) === value.sha256, `source hash mismatch: ${value.id ?? "candidates"}`);
  return bytes;
}
function exportInventory(manifest, baseDirectory = process.cwd()) {
  keys(manifest, ["schema", "sources", "candidates"], ["schema", "sources"], "manifest");
  requireThat(manifest.schema === MANIFEST_SCHEMA, "unknown manifest schema");
  requireThat(Array.isArray(manifest.sources) && manifest.sources.length > 0 && manifest.sources.length <= 256, "invalid source count");
  const seenIds = new Set(), evidence = new Map(), sources = [];
  let totalBytes = 0;
  for (const source of manifest.sources) {
    descriptor(source);
    requireThat(!seenIds.has(source.id), `duplicate source id: ${source.id}`);
    seenIds.add(source.id);
    const raw = sourceBytes(source, baseDirectory);
    totalBytes += raw.length;
    requireThat(totalBytes <= 256 * 1024 * 1024, "aggregate source byte cap exceeded");
    const records = decodeSource(source, raw);
    requireThat(records.length <= MAX_RECORDS, "too many source records");
    sources.push({ ...source, bytes: raw.length, records: records.length });
    for (const record of records) {
      const payload = { ...record, source_id: source.id, category: source.category };
      const key = digest(payload);
      evidence.set(key, { evidence_sha256: key, ...payload });
    }
    requireThat(evidence.size <= MAX_RECORDS, "inventory record cap exceeded");
  }
  const records = [...evidence.values()].sort((a, b) => order(a.evidence_sha256, b.evidence_sha256));
  const labels = new Map(), polynomials = new Map();
  for (const r of records) {
    if (r.label !== null) {
      if (!labels.has(r.label)) labels.set(r.label, []);
      labels.get(r.label).push(r);
    }
    if (r.polynomial_sha256 !== null) {
      if (!polynomials.has(r.polynomial_sha256)) polynomials.set(r.polynomial_sha256, []);
      polynomials.get(r.polynomial_sha256).push(r);
    }
  }
  let candidates = [];
  if (manifest.candidates !== undefined) {
    descriptor(manifest.candidates, true);
    const input = JSON.parse(sourceBytes(manifest.candidates, baseDirectory));
    keys(input, ["schema", "records"], ["schema", "records"], "candidates");
    requireThat(input.schema === "sagejs.general-frontier/exposure-candidates-v1", "unknown candidate schema");
    const ids = new Set();
    candidates = rows(input.records, "candidates").map((r, i) => {
      keys(r, ["id", "label", "coefficients"], ["id", "coefficients"], "candidate");
      requireThat(!ids.has(r.id), "duplicate candidate id");
      ids.add(r.id);
      const normalized = normalizeRecord(r, i);
      const matches = new Map();
      for (const match of [...(labels.get(normalized.label) ?? []), ...(polynomials.get(normalized.polynomial_sha256) ?? [])]) matches.set(match.evidence_sha256, match);
      const matched = [...matches.values()];
      const categories = [...new Set(matched.map((x) => x.category))].sort(order);
      const invalid = matched.some((x) => x.input_status === "declared-invalid-quarantined");
      const quarantine = invalid || categories.some((x) => ["prior-sage-exposure", "historical-quarantine"].includes(x));
      return {
        ...normalized,
        id: r.id,
        matched_evidence: [...matches.keys()].sort(order),
        match_categories: categories,
        match_scope: "exact-source-label-assertion-or-exact-coefficient-array-only",
        prior_sage_exposure: categories.includes("prior-sage-exposure") ? true : null,
        exposure_status: quarantine ? "quarantined" : matched.length ? "selection-or-reference-only-match" : "unknown",
        holdout_eligible: quarantine ? false : null,
        same_field_reconciliation: "pending-alternative-presentations-and-source-coverage-review",
      };
    }).sort((a, b) => order(a.id, b.id));
  }
  const output = {
    schema: OUTPUT_SCHEMA,
    producer_sha256: sha256(fs.readFileSync(__filename)),
    state: "inventory-only-not-final-corpus",
    coverage: "incomplete-until-reviewed",
    source_manifest_sha256: digest({ ...manifest, sources: [...manifest.sources].sort((a, b) => order(a.id, b.id)) }),
    sources: sources.sort((a, b) => order(a.id, b.id)),
    counts: { sources: sources.length, evidence_records: records.length, source_asserted_labels: labels.size, distinct_coefficient_arrays: polynomials.size,
      declared_invalid_records: records.filter((r) => r.input_status === "declared-invalid-quarantined").length, candidates: candidates.length },
    distinct_fields: null,
    records,
    candidates,
  };
  return { ...output, inventory_sha256: digest(output) };
}

function main(argv) {
  requireThat(argv.length === 4 && argv[0] === "--manifest" && argv[2] === "--output", "Usage: node export.cjs --manifest SOURCES.json --output INVENTORY.json");
  const filename = path.resolve(argv[1]);
  const result = exportInventory(JSON.parse(readBounded(filename)), path.dirname(filename));
  fs.writeFileSync(path.resolve(argv[3]), canonical(result) + "\n", { flag: "wx" });
  process.stdout.write(JSON.stringify({ ...result.counts, inventory_sha256: result.inventory_sha256, output: path.resolve(argv[3]) }) + "\n");
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { MANIFEST_SCHEMA, OUTPUT_SCHEMA, HISTORICAL_SHA256, canonical, digest, sha256, coefficients, normalizeRecord, decodeSource, exportInventory, main };
