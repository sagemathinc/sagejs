"use strict";
// Developer-only exact receipt verifier, not a runtime field algorithm.
const fs = require("node:fs");
const path = require("node:path");
const api = require("./export.cjs");
const reconciliation = require("./reconcile.cjs");
const SCHEMA = "sagejs.general-frontier/source-coverage-policy-v1";
const SCHEMA_V2 = "sagejs.general-frontier/source-coverage-policy-v2";
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
function isSquare(n) {
  if (n < 0n) return false;
  if (n < 2n) return true;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x * x === n;
}
function quadraticPossible(coefficients, candidates) {
  const c = api.coefficients(coefficients);
  check(c.length === 3 && c[2] === "1", "quadratic index test requires monic quadratic");
  const d = BigInt(c[1]) ** 2n - 4n * BigInt(c[0]);
  // A square discriminant is reducible over Q (including a repeated root).
  const reducible = isSquare(d);
  const possible = reducible ? [] : candidates.filter(c => c.degree === 2 && d % BigInt(c.discriminant) === 0n &&
    d / BigInt(c.discriminant) > 0n && isSquare(d / BigInt(c.discriminant)));
  return { equation_discriminant: d.toString(), reducible_over_Q: reducible, possible_pool_candidates: possible.length };
}
function lcgPresentations(family) {
  keys(family, ["id", "source_id", "kind", "seed", "degrees", "samples_per_degree"]);
  check(family.kind === "reviewed-round4-lcg-v1" && family.seed === "1729" && api.canonical(family.degrees) === "[2,3,4]" &&
    family.samples_per_degree === 10 && typeof family.id === "string", "unreviewed LCG family");
  let state = 1729n; const result = [];
  for (const degree of family.degrees) for (let sample = 0; sample < 10; sample++) {
    const coefficients = [];
    for (let i = 0; i < degree; i++) { state = (1103515245n * state + 12345n) % 2147483648n; coefficients.push((state % 11n - 5n).toString()); }
    coefficients.push("1");
    result.push({ id: `${family.id}-${degree}-${sample}`, source_id: family.source_id, coefficients,
      disposition: degree === 2 ? "quadratic-index-outside-pool" : "sylvester-bound-outside-pool" });
  }
  return result;
}
function verifyTransform(row) {
  if (!row.transform) return null;
  const t = row.transform, c = api.coefficients(row.coefficients).map(BigInt), n = c.length - 1;
  if (t.kind === "rational-scale") {
    keys(t, ["kind", "input_numerators", "scale"], ["scale_denominator"]);
    check(typeof t.scale === "string" && /^-?[1-9][0-9]*$/.test(t.scale) && t.scale.length <= 10000 &&
      (t.scale_denominator === undefined || (typeof t.scale_denominator === "string" && /^[1-9][0-9]*$/.test(t.scale_denominator) && t.scale_denominator.length <= 10000)), "invalid rational generator scale");
    const a = api.coefficients(t.input_numerators).map(BigInt), s = BigInt(t.scale), denominator = BigInt(t.scale_denominator ?? "1");
    check(a.length === c.length && s !== 0n, "invalid rational scale transform");
    for (let i = 0; i <= n; i++) check(a[i] * s ** BigInt(n - i) === c[i] * a[n] * denominator ** BigInt(n - i), "rational scale identity mismatch");
  } else {
    keys(t, ["kind", "input_coefficients", "shift"]);
    check(t.kind === "translation" && typeof t.shift === "string" && t.shift.length <= 10000 && /^-?(0|[1-9][0-9]*)$/.test(t.shift), "unknown exact transformation");
    const s = BigInt(t.shift), out = Array(n + 1).fill(0n);
    for (let i = 0; i <= n; i++) { let binomial = 1n;
      for (let j = 0; j <= i; j++) { out[j] += c[i] * binomial * (-s) ** BigInt(i - j); binomial = binomial * BigInt(i - j) / BigInt(j + 1); } }
    check(api.canonical(out.map(String)) === api.canonical(api.coefficients(t.input_coefficients)), "translation identity mismatch");
  }
  return { ...t, identity: "verified-invertible-rational-generator-change-not-a-discriminant-equality-claim" };
}
function bindHistoricalInventory(historical, base, pinnedInventory) {
  const rebuilt = api.exportInventory(historical, base);
  // Paths and producer hashes can legitimately differ on a relocated worktree;
  // exact evidence hashes/category/source IDs cannot. Require equality before
  // append, not merely a digest-valid smaller source manifest.
  const identities = x => x.records.map(r => r.evidence_sha256).sort();
  check(api.canonical(identities(rebuilt)) === api.canonical(identities(pinnedInventory)), "historical source manifest drops or changes pinned inventory evidence");
  return rebuilt;
}
function compileCoverage(policy, root, pool) {
  const v2 = policy.schema === SCHEMA_V2;
  keys(policy, ["schema", "sources", "presentations", "scope"], v2 ? ["families", "lexical_checklist"] : []);
  check([SCHEMA, SCHEMA_V2].includes(policy.schema) && Array.isArray(policy.sources) && policy.sources.length <= 256 &&
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
  let checklist = null;
  if (v2) {
    keys(policy.lexical_checklist, ["files", "sha256", "classification"]);
    check(policy.lexical_checklist.classification === "finite-lexical-path-checklist-not-exhaustive-family-parser" &&
      Array.isArray(policy.lexical_checklist.files) && policy.lexical_checklist.files.length === 65 &&
      api.digest(policy.lexical_checklist.files) === policy.lexical_checklist.sha256, "invalid lexical checklist");
    for (const file of policy.lexical_checklist.files) readPinned(root, file);
    checklist = policy.lexical_checklist;
  }
  check(!v2 || (Array.isArray(policy.families) && policy.families.length <= 4), "invalid family count");
  const expanded = [...policy.presentations, ...(v2 ? policy.families.flatMap(lcgPresentations) : [])];
  check(expanded.length <= 200, "expanded presentation cap exceeded");
  for (const row of expanded) {
    keys(row, ["id", "source_id", "coefficients", "disposition"], ["label", "bound_squared", "fixture_id", "field_discriminant", "derivation", ...(v2 ? ["transform", "assertion_fragments"] : [])]);
    check(typeof row.id === "string" && row.id.length > 0 && !ids.has(row.id), "invalid presentation id"); ids.add(row.id);
    const source = sources.get(row.source_id);
    check(source && source.disposition !== "generic-capability-not-execution", "generic capability is not exposure evidence");
    const coefficients = api.coefficients(row.coefficients), degree = coefficients.length - 1;
    check(degree >= 1 && degree <= 1024 && coefficients.at(-1) === "1", "invalid source polynomial");
    const transform = verifyTransform(row);
    let proof;
    if (row.disposition === "sylvester-bound-outside-pool") {
      const bound = discriminantBoundSquared(coefficients);
      if (row.bound_squared !== undefined) check(row.bound_squared === bound.toString(), "false discriminant bound claim");
      check(!candidates.some(c => c.degree === degree && BigInt(c.discriminant) ** 2n <= bound), "bound does not exclude current pool");
      proof = { discriminant_bound_squared: bound.toString(), possible_pool_candidates: 0 };
    } else if (v2 && row.disposition === "quadratic-index-outside-pool") {
      proof = quadraticPossible(coefficients, candidates);
      check(proof.possible_pool_candidates === 0, "quadratic index permits current pool overlap");
    } else if (v2 && row.disposition === "degree-outside-campaign") {
      check(degree < 2 || degree > 10, "degree is inside campaign");
      proof = { defining_polynomial_degree: degree, basis: "source-asserted-field-degree-not-factor-degrees", possible_pool_candidates: 0 };
    } else if (v2 && row.disposition === "source-global-discriminant-outside-pool") {
      check(typeof row.field_discriminant === "string" && /^-?[1-9][0-9]*$/.test(row.field_discriminant) &&
        Array.isArray(row.assertion_fragments) && row.assertion_fragments.length > 0 && row.assertion_fragments.length <= 8 &&
        row.assertion_fragments.every(f => typeof f === "string" && f.length > 0 && source.bytes.toString().includes(f)) &&
        row.assertion_fragments.join("") === row.field_discriminant, "global discriminant literal binding mismatch");
      check(!candidates.some(c => c.degree === degree && c.discriminant.replace("-", "") === row.field_discriminant.replace("-", "")), "global discriminant overlaps pool");
      proof = { field_discriminant: row.field_discriminant, assertion: "reviewed-global-maximal-order-result-not-local-order", possible_pool_candidates: 0 };
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
    if (row.disposition !== "historical-quarantine") {
      const exact = [coefficients, ...(row.transform?.input_coefficients ? [row.transform.input_coefficients] : [])].map(api.canonical);
      check(!candidates.some(c => exact.includes(api.canonical(c.coefficients))), "exact presentation conflicts with asserted pool non-overlap");
    }
    audit.push({ ...row, coefficients, proof, ...(transform ? { verified_transform: transform } : {}), source_sha256: source.input.sha256 });
  }
  records.sort((a, b) => a.id.localeCompare(b.id)); audit.sort((a, b) => a.id.localeCompare(b.id));
  const report = { schema: `sagejs.general-frontier/source-coverage-report-v${v2 ? 2 : 1}`, producer_sha256: api.sha256(fs.readFileSync(__filename)),
    policy_sha256: api.digest(policy), pool_sha256: pool.pool_sha256, scope: policy.scope, sources: policy.sources,
    ...(v2 ? { lexical_checklist: checklist, families: policy.families } : {}),
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
  bindHistoricalInventory(historical, path.dirname(historicalFile), JSON.parse(readPinned(path.dirname(inputFile), inputs.inventory)));
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
module.exports = { SCHEMA, SCHEMA_V2, readPinned, discriminantBoundSquared, quadraticPossible, lcgPresentations, verifyTransform, bindHistoricalInventory, compileCoverage, main };
