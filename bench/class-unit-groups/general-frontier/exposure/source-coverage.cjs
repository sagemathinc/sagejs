"use strict";
// Developer-only exact receipt verifier, not a runtime field algorithm.
const fs = require("node:fs");
const path = require("node:path");
const api = require("./export.cjs");
const reconciliation = require("./reconcile.cjs");
const SCHEMA = "sagejs.general-frontier/source-coverage-policy-v1";
const check = (ok, message) => { if (!ok) throw new Error(message); };
function keys(x, required, optional = []) {
  check(x && typeof x === "object" && !Array.isArray(x) && required.every(k => Object.hasOwn(x, k)) &&
    Object.keys(x).every(k => [...required, ...optional].includes(k)), "unknown or missing coverage keys");
}
function readPinned(root, descriptor) {
  keys(descriptor, ["path", "sha256"]);
  check(typeof descriptor.path === "string" && /^[a-f0-9]{64}$/.test(descriptor.sha256), "invalid source descriptor");
  const file = path.resolve(root, descriptor.path), stat = fs.lstatSync(file);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 64 * 1024 * 1024, "source is not bounded regular file");
  const bytes = fs.readFileSync(file);
  check(api.sha256(bytes) === descriptor.sha256, "audited source hash mismatch");
  return bytes;
}
function discriminantBoundSquared(values) {
  const c = api.coefficients(values);
  check(c.length >= 3 && c.length <= 11 && c.at(-1) === "1" && c.every(x => x.length <= 10000), "bound requires bounded monic degree 2-10 polynomial");
  let f = 0n, derivative = 0n;
  c.forEach((x, i) => { const a = BigInt(x); f += a * a; derivative += BigInt(i * i) * a * a; });
  const n = BigInt(c.length - 1);
  return f ** (n - 1n) * derivative ** n;
}
function compileCoverage(policy, root, pool) {
  keys(policy, ["schema", "sources", "presentations", "scope"]);
  check(policy.schema === SCHEMA && Array.isArray(policy.sources) && policy.sources.length <= 256 &&
    Array.isArray(policy.presentations) && policy.presentations.length <= 200, "invalid coverage policy");
  keys(policy.scope, ["description", "generic_override_history", "universal_history_claim", "holdout_eligible"]);
  check(typeof policy.scope.description === "string" && policy.scope.generic_override_history === "unresolved" &&
    policy.scope.universal_history_claim === false && policy.scope.holdout_eligible === null, "coverage cannot assert universal history or override exposure");
  const sources = new Map();
  for (const source of policy.sources) {
    keys(source, ["id", "input", "disposition"]);
    check(typeof source.id === "string" && !sources.has(source.id) &&
      ["reviewed-inline-presentations", "reviewed-fixture-presentations", "generic-capability-not-execution"].includes(source.disposition), "invalid source disposition/id");
    sources.set(source.id, { ...source, bytes: readPinned(root, source.input) });
  }
  const candidates = reconciliation.poolRecords(pool), ids = new Set(), audit = [], records = [];
  for (const row of policy.presentations) {
    keys(row, ["id", "source_id", "coefficients", "disposition"], ["label", "bound_squared", "fixture_id", "field_discriminant", "derivation"]);
    check(typeof row.id === "string" && row.id.length > 0 && !ids.has(row.id), "invalid presentation id"); ids.add(row.id);
    const source = sources.get(row.source_id);
    check(source && source.disposition !== "generic-capability-not-execution", "generic capability is not exposure evidence");
    const coefficients = api.coefficients(row.coefficients), degree = coefficients.length - 1;
    check(degree >= 2 && degree <= 10 && coefficients.at(-1) === "1", "invalid source polynomial");
    let proof;
    if (row.disposition === "sylvester-bound-outside-pool") {
      const bound = discriminantBoundSquared(coefficients);
      if (row.bound_squared !== undefined) check(row.bound_squared === bound.toString(), "false discriminant bound claim");
      check(!candidates.some(c => c.degree === degree && BigInt(c.discriminant) ** 2n <= bound), "bound does not exclude current pool");
      proof = { discriminant_bound_squared: bound.toString(), possible_pool_candidates: 0 };
    } else if (row.disposition === "fixture-discriminant-outside-pool") {
      check(source.disposition === "reviewed-fixture-presentations", "discriminant requires fixture source");
      const fixture = JSON.parse(source.bytes);
      check(fixture.schema === 1 && Array.isArray(fixture.cases), "unknown discriminant fixture schema");
      const cases = fixture.cases.filter(c => c.id === row.fixture_id);
      check(cases.length === 1 && api.canonical(api.coefficients(cases[0].coefficients)) === api.canonical(coefficients) &&
        typeof row.field_discriminant === "string" && /^-?[1-9][0-9]*$/.test(row.field_discriminant) &&
        cases[0].field_discriminant === row.field_discriminant, "fixture discriminant/polynomial binding mismatch");
      check(!candidates.some(c => c.degree === degree && c.discriminant.replace("-", "") === row.field_discriminant.replace("-", "")), "fixture discriminant overlaps pool");
      proof = { field_discriminant: row.field_discriminant, fixture_id: row.fixture_id, possible_pool_candidates: 0, identity: "source-asserted-not-isomorphism" };
    } else {
      check(row.disposition === "historical-quarantine" && typeof row.label === "string", "unknown coverage disposition");
      const normalized = api.normalizeRecord({ id: row.id, coefficients, label: row.label }, 0);
      check(normalized.degree === 2, "this reviewed quarantine supplement is quadratic only");
      records.push({ id: row.id, coefficients, label: row.label });
      proof = { category: "historical-quarantine", actual_execution_asserted: false };
    }
    audit.push({ ...row, coefficients, proof, source_sha256: source.input.sha256 });
  }
  records.sort((a, b) => a.id.localeCompare(b.id)); audit.sort((a, b) => a.id.localeCompare(b.id));
  const report = { schema: "sagejs.general-frontier/source-coverage-report-v1", producer_sha256: api.sha256(fs.readFileSync(__filename)),
    policy_sha256: api.digest(policy), pool_sha256: pool.pool_sha256, scope: policy.scope, sources: policy.sources,
    source_coverage_approved: false, holdout_eligible: null, presentations: audit };
  return { report: { ...report, report_sha256: api.digest(report) },
    supplement: { schema: "sagejs.general-frontier/exposure-presentations-v1", records } };
}
function main(argv) {
  check(argv.length === 10 && argv[0] === "--root" && argv[2] === "--policy" && argv[4] === "--sources" &&
    argv[6] === "--reconciliation" && argv[8] === "--output-dir", "Usage: node source-coverage.cjs --root ROOT --policy POLICY --sources HISTORICAL_MANIFEST --reconciliation INPUTS --output-dir NEW_DIRECTORY");
  const root = path.resolve(argv[1]), policyFile = path.resolve(argv[3]), historicalFile = path.resolve(argv[5]), inputFile = path.resolve(argv[7]);
  const policy = JSON.parse(fs.readFileSync(policyFile)), historical = JSON.parse(fs.readFileSync(historicalFile)), inputs = JSON.parse(fs.readFileSync(inputFile));
  // Validate the original pinned reconciliation inputs, including diagnostics,
  // before generating any new artifacts. No implicit reference-to-Sage promotion.
  reconciliation.fromManifest(inputs, path.dirname(inputFile));
  const pool = JSON.parse(readPinned(path.dirname(inputFile), inputs.pool));
  const compiled = compileCoverage(policy, root, pool), output = path.resolve(argv[9]);
  fs.mkdirSync(output); // Must not overwrite or relabel an existing v1 export.
  function write(name, value) { const file = path.join(output, name); const raw = api.canonical(value) + "\n";
    fs.writeFileSync(file, raw, { flag: "wx" }); return { path: file, sha256: api.sha256(raw) }; }
  const supplement = write("presentations.json", compiled.supplement);
  const coverage = write("coverage.json", compiled.report);
  const manifest = { ...historical, sources: historical.sources.map(s => ({ ...s, path: path.resolve(path.dirname(historicalFile), s.path) })) };
  if (manifest.candidates) manifest.candidates = { ...manifest.candidates, path: path.resolve(path.dirname(historicalFile), manifest.candidates.path) };
  manifest.sources.push({ id: "reviewed-source-quadratics-v1", kind: "explicit-presentations-v1", category: "historical-quarantine", ...supplement,
    note: `Finite source audit; not a claim all tests ran. Coverage receipt SHA256 ${coverage.sha256}` });
  write("sources.json", manifest);
  const inventory = write("inventory.json", api.exportInventory(manifest, output));
  const nextInputs = { ...inputs, inventory };
  for (const k of ["pool", "oracle_fixture", "additional_exposure"]) if (inputs[k]) nextInputs[k] = { ...inputs[k], path: path.resolve(path.dirname(inputFile), inputs[k].path) };
  write("reconciliation-inputs.json", nextInputs);
  const reconciled = reconciliation.fromManifest(nextInputs, output);
  write("reconciliation.json", reconciled);
  console.log(JSON.stringify({ output, coverage: coverage.sha256, ...reconciled.result.counts }));
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { SCHEMA, readPinned, discriminantBoundSquared, compileCoverage, main };
