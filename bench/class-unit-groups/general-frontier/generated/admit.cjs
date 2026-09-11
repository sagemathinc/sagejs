"use strict";
// Developer-only admission bookkeeping. No field algorithm or benchmark runner.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("../exposure/export.cjs");
const reconciliation = require("../exposure/reconcile.cjs");
const coverageApi = require("../exposure/source-coverage.cjs");
const SCHEMA = "sagejs.general-frontier/generated-admission-inputs-v1";
const OUTPUT_SCHEMA = "sagejs.general-frontier/generated-admission-v1";
const check = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => api.canonical(a) === api.canonical(b);
function keys(value, required) {
  check(value && typeof value === "object" && !Array.isArray(value) &&
    same(Object.keys(value).sort(), [...required].sort()), "unknown or missing schema keys");
}
function integer(value, name) {
  check(typeof value === "string" && /^-?(?:0|[1-9][0-9]*)$/.test(value) && value !== "-0" && value.length <= 1024, `invalid exact ${name}`);
  return BigInt(value);
}
function squareRoot(n) {
  check(n > 0n, "index square must be positive");
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  check(x * x === n, "equation/field discriminant ratio is not a square");
  return x;
}
function indexFromDiscriminants(equation, field) {
  const e = integer(equation, "equation discriminant"), d = integer(field, "field discriminant");
  check(d !== 0n && e % d === 0n, "field discriminant does not divide equation discriminant");
  return squareRoot(e / d).toString();
}
function recordIdentity(record) {
  const n = record.degree, k = record.decimal_scale, j = record.parameter_index;
  check([3, 4].includes(n) && [4, 6, 8, 10, 12, 16, 20].includes(k) && Number.isInteger(j) && j >= 0 && j < 8, "unknown generated tuple");
  const family = n === 3 ? "eisenstein2-real-cubic" : "eisenstein2-mixed-quartic";
  check(record.family === family, "family/degree mismatch");
  const a = 2n * (10n ** BigInt(k) + 2n * BigInt(j) + 1n), b = 2n * (10n ** BigInt(k) + 4n * BigInt(j) + 1n);
  const coefficients = (n === 3 ? [b, -a, 0n, 1n] : [-b, -a, 0n, 0n, 1n]).map(String);
  const signature = n === 3 ? [3, 0] : [2, 1];
  const equation = (n === 3 ? 4n * a ** 3n - 27n * b ** 2n : -256n * b ** 3n - 27n * a ** 4n).toString();
  const coefficientHash = api.digest({ schema: "sagejs.monic-polynomial-coefficients.v1", degree: n, coefficients });
  check(same(record.coefficients, coefficients) && same(record.signature, signature) && record.r1 === signature[0] && record.r2 === signature[1] && record.unit_rank === 2, "generated coefficients/signature disagree with exact family");
  check(record.equation_discriminant === equation && record.coefficient_sha256 === coefficientHash && record.label === `generated-sha256-${coefficientHash}`, "generated polynomial identity mismatch");
  return { id: record.label, degree: n, signature, coefficients, equation_discriminant: equation,
    coefficient_sha256: coefficientHash, polynomial_sha256: api.digest(coefficients), family, decimal_scale: k, parameter_index: j };
}
function bucket(degree, signature, discriminant) { return `${degree}:${signature.join(",")}:${discriminant}`; }
function pairObservation(record, row) {
  check(row && row.label === record.id && row.sample === 1 && ["paired-discovery", "censored-or-missing", "exact-summary-disagreement"].includes(row.status), "unknown paired row identity/status");
  for (const engine of ["pari", "hecke"]) {
    const r = row[engine];
    check(r && r.engine === engine && r.label === record.id && r.sample === 1 && same(r.coefficients, record.coefficients), "paired input identity mismatch");
    check(["ok", "error", "timeout", "output-limit", "protocol-error", "shape-error", "crash", "interrupted"].includes(r.status), "unknown engine status");
    if (r.status === "ok") {
      check(same(r.signature, record.signature), "engine degree/signature conflict");
      indexFromDiscriminants(record.equation_discriminant, r.discriminant);
      check(integer(r.worker_nanoseconds, "worker time") >= 0n, "negative worker time");
    }
  }
  check(row.status !== "exact-summary-disagreement", "paired exact-summary disagreement");
  if (row.pari.status !== "ok" || row.hecke.status !== "ok") {
    check(row.status === "censored-or-missing" && row.faster_worker_nanoseconds === undefined, "censored request promoted to matched observation");
    return null;
  }
  check(row.status === "paired-discovery", "complete pair missing matched status");
  for (const key of ["discriminant", "signature", "class_number", "class_invariants", "torsion_order"]) check(same(row.pari[key], row.hecke[key]), `paired ${key} disagreement`);
  const p = BigInt(row.pari.worker_nanoseconds), h = BigInt(row.hecke.worker_nanoseconds), faster = p < h ? p : h;
  check(row.faster_worker_nanoseconds === faster.toString() && row.reference_at_least_one_second === (faster >= 10n ** 9n) && row.reference_at_least_ten_seconds === (faster >= 10n ** 10n), "paired cost flags disagree with worker times");
  const discriminant = row.pari.discriminant;
  return { field_discriminant: discriminant, equation_order_index: indexFromDiscriminants(record.equation_discriminant, discriminant),
    field_metadata_basis: "matching maximal-order discriminants/signatures parsed from pinned PARI b.disc and Hecke discriminant(O) worker receipts; not independently certified",
    bucket_key: bucket(record.degree, record.signature, discriminant), class_number: row.pari.class_number,
    class_invariants: row.pari.class_invariants, torsion_order: row.pari.torsion_order,
    faster_worker_nanoseconds: faster.toString(), reference_at_least_one_second: faster >= 10n ** 9n,
    reference_at_least_ten_seconds: faster >= 10n ** 10n,
    regulators: { pari: row.pari.regulator, hecke: row.hecke.regulator },
    reference_rows_sha256: { pari: api.digest(row.pari), hecke: api.digest(row.hecke) },
    raw_receipt_sha256: { pari: row.pari.receipt_sha256, hecke: row.hecke.receipt_sha256 } };
}
function finiteCoverage(record, observation, coverage) {
  const reasons = [], proofs = [];
  for (const r of coverage.presentations) {
    const n = r.coefficients.length - 1;
    let possible = false;
    if (r.disposition === "sylvester-bound-outside-pool") {
      const bound = coverageApi.discriminantBoundSquared(r.coefficients);
      check(bound.toString() === r.proof.discriminant_bound_squared, "finite discriminant bound mismatch");
      possible = n === record.degree && BigInt(observation.field_discriminant) ** 2n <= bound;
    } else if (["fixture-discriminant-outside-pool", "source-global-discriminant-outside-pool"].includes(r.disposition)) {
      check(r.field_discriminant === r.proof.field_discriminant, "finite asserted discriminant mismatch");
      possible = n === record.degree && r.field_discriminant === observation.field_discriminant;
    } else if (["quadratic-index-outside-pool", "historical-quarantine"].includes(r.disposition)) {
      check(n === 2, "unexpected nonquadratic finite disposition");
    } else if (r.disposition === "degree-outside-campaign") {
      check(n < 2 || n > 10, "false out-of-campaign degree claim");
    } else throw new Error("unknown finite coverage disposition");
    if (same(r.coefficients, record.coefficients) || (r.transform?.input_coefficients && same(r.transform.input_coefficients, record.coefficients))) possible = true;
    if (possible) reasons.push({ kind: "finite-historical-presentation-possible-collision", presentation_id: r.id, source_id: r.source_id });
    proofs.push({ presentation_id: r.id, disposition: r.disposition, possible_same_field: possible });
  }
  return { reasons, proofs };
}
function coordinateBuckets(records) {
  const buckets = new Map();
  for (const r of records) if (r.observation) {
    const key = r.observation.bucket_key;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  const proposals = [];
  for (const [key, members] of buckets) {
    const historical = members.filter(r => r.historical_quarantine_reasons.length).map(r => r.id).sort();
    for (const r of members) {
      r.generated_possible_same_field_ids = members.filter(s => s.id !== r.id).map(s => s.id).sort();
      if (historical.length) {
        if (!r.historical_quarantine_reasons.length) r.historical_quarantine_reasons.push({ kind: "generated-historical-bucket-propagation", presentation_ids: historical });
        r.exposure = "historical-quarantine";
        r.holdout_eligible = false;
      }
    }
    if (historical.length) for (const label of [...new Set(members.flatMap(r => r.union_possible_same_field_labels))].sort()) {
      proposals.push({ label, bucket_key: key, generated_historical_presentations: historical,
        disposition: "conservative-possible-same-field-quarantine-required-before-split", isomorphism_asserted: false });
    }
  }
  return proposals.sort((a, b) => a.label.localeCompare(b.label));
}
function buildCompanion(generator, paired, union, exposure, coverage) {
  check(generator.schema === "sagejs.rank-two-supplement.v1" && generator.records.length === 112, "unknown generator schema/count");
  check(paired.schema === "sagejs.general-frontier-paired-discovery.v1" && paired.qualification_evidence === false && paired.independent_replay === false, "unknown or qualified paired report");
  check(union.schema === "sagejs.general-class-unit-source-union.v1", "unknown LMFDB union schema");
  check(exposure.schema === "sagejs.general-frontier/conservative-exposure-reconciliation-v2" && exposure.source_coverage_approved === false, "unknown exposure reconciliation schema/state");
  check(coverage.schema === "sagejs.general-frontier/source-coverage-report-v3" && coverage.source_coverage_approved === false, "unknown finite coverage schema/state");
  const rows = new Map();
  for (const r of paired.rows) { check(!rows.has(r.label), "duplicate paired label"); rows.set(r.label, r); }
  const identities = generator.records.map(recordIdentity), ids = new Set(identities.map(r => r.id));
  check(ids.size === 112 && rows.size === 28 && [...rows.keys()].every(k => ids.has(k)), "paired/generated membership mismatch");
  const witnesses = [...exposure.source_assertions, ...exposure.additional_source_assertions];
  const records = identities.map(r => {
    const row = rows.get(r.id);
    check(Boolean(row) === (r.parameter_index < 2), "paired selection changed family/index declaration");
    const observation = row ? pairObservation(r, row) : null;
    const role = r.parameter_index < 2 ? "initial-reference-discovery" : r.parameter_index < 6 ? "development-only" : "reserve-unassigned";
    const historical = witnesses.filter(w => w.quarantine && (w.polynomial_sha256 === r.polynomial_sha256 || (observation && w.degree === r.degree && same(w.signature, r.signature) && (w.field_discriminant ?? w.discriminant) === observation.field_discriminant)))
      .map(w => ({ kind: w.polynomial_sha256 === r.polynomial_sha256 ? "historical-exact-polynomial" : "historical-possible-same-field-bucket", source_id: w.source_id ?? "explicit-additional-exposure", record_id: w.source_record_id ?? w.id, category: w.category }));
    const unionCollisions = union.records.filter(u => same(u.coefficients, r.coefficients) || (observation && u.degree === r.degree && same(u.signature, r.signature) && (BigInt(u.discriminant_absolute) * BigInt(u.discriminant_sign)).toString() === observation.field_discriminant)).map(u => u.label).sort();
    const audited = observation ? finiteCoverage(r, observation, coverage) : { reasons: [], proofs: [] };
    const reasons = [...historical, ...audited.reasons];
    return { ...r, declaration: role, observation_status: observation ? "matched-reference-metadata-only" : row ? "censored-reference-metadata-unadmitted" : "not-screened",
      reference_category: row ? "reference-only" : "selection-only", observation,
      historical_quarantine_reasons: reasons, union_possible_same_field_labels: unionCollisions,
      generated_possible_same_field_ids: [], finite_scope_checks: audited.proofs,
      exposure: reasons.length ? "historical-quarantine" : "unknown",
      holdout_eligible: reasons.length || role === "development-only" ? false : null,
      final_role: null, qualification_evidence: false, independent_replay: false };
  });
  const unionQuarantines = coordinateBuckets(records);
  const matched = records.filter(r => r.observation);
  return { schema: OUTPUT_SCHEMA, state: "separate-generated-reference-metadata-companion-not-frozen", source_kind: "deterministic-generated-presentations",
    source_coverage_approved: false, holdout_eligible: null, qualification_evidence: false, independent_replay: false,
    selection_uses_sagejs_results: false, generator_export_sha256: generator.export_sha256,
    distinct_field_count: null, distinctness: "Polynomial IDs are not field identities. If worker-reported field discriminants are correct, differing values separate fields; equal degree/signature/discriminant buckets require shared split ownership or exact isomorphism reconciliation, never automatic merging.",
    authority: "Raw-receipt reconstruction binds observations, not mathematical truth, executable-source authenticity or benchmark qualification. No generated record is automatically holdout eligible.",
    finite_source_scope: coverage.scope, remaining_exposure_obligations: "Review historical override coverage and coefficient-only possible-field cases; approve finite source scope explicitly; preserve actual Sage diagnostics separately from reference screens.",
    union_quarantine_proposals: unionQuarantines,
    counts: { polynomial_candidates: 112, initial_reference_requests: 28, matched_metadata: matched.length,
      censored_unadmitted: 28 - matched.length, development_only_unscreened: 56, reserve_unassigned_unscreened: 28,
      historical_quarantined_matched: matched.filter(r => r.exposure === "historical-quarantine").length,
      union_bucket_collisions: matched.filter(r => r.union_possible_same_field_labels.length).length,
      generated_bucket_collisions: matched.filter(r => r.generated_possible_same_field_ids.length).length,
      matched_distinct_discriminant_buckets: new Set(matched.map(r => r.observation.bucket_key)).size,
      reference_discovery_at_least_one_second: matched.filter(r => r.observation.reference_at_least_one_second).length,
      reference_discovery_at_least_ten_seconds: matched.filter(r => r.observation.reference_at_least_ten_seconds).length }, records };
}
function loadPinned(descriptor, base) {
  keys(descriptor, ["path", "sha256"]);
  const file = path.resolve(base, descriptor.path);
  const raw = coverageApi.readPinned(base, descriptor);
  return { value: JSON.parse(raw), descriptor: { path: file, sha256: descriptor.sha256 } };
}
function fromManifest(manifest, base) {
  keys(manifest, ["schema", "generator", "pilot", "pilot_selection", "paired", "union", "exposure", "coverage", "coverage_policy", "source_root", "reference_directories"]);
  check(manifest.schema === SCHEMA, "unknown generated admission input schema");
  keys(manifest.reference_directories, ["pari", "hecke"]);
  const loaded = Object.fromEntries(["generator", "pilot", "pilot_selection", "paired", "union", "exposure", "coverage", "coverage_policy"].map(k => [k, loadPinned(manifest[k], base)]));
  const replayRequest = Object.fromEntries(["generator", "pilot", "pilot_selection", "paired"].map(k => [k, loaded[k].descriptor]));
  replayRequest.reference_directories = Object.fromEntries(Object.entries(manifest.reference_directories).map(([k, v]) => { check(typeof v === "string" && v.length > 0, "invalid reference directory"); return [k, path.resolve(base, v)]; }));
  const proc = spawnSync("python", [path.join(__dirname, "replay_inputs.py")], { input: JSON.stringify(replayRequest), encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  check(proc.status === 0, `offline raw-input replay failed: ${proc.stderr || proc.error?.message || "unknown error"}`);
  const replayed = JSON.parse(proc.stdout);
  check(same(replayed.generator, loaded.generator.value) && same(replayed.paired, loaded.paired.value), "inputs changed during raw replay");
  const old = loaded.exposure.value;
  check(old.schema === "sagejs.general-frontier/exposure-reconciliation-envelope-v2", "expected explicit union exposure envelope");
  const reconstructed = reconciliation.fromManifest(old.inputs, path.dirname(loaded.exposure.descriptor.path));
  check(same(old, reconstructed), "exposure envelope differs from independently rebuilt inputs");
  const pool = reconciliation.loadCandidateInput(old.inputs, path.dirname(loaded.exposure.descriptor.path));
  check(same(pool, loaded.union.value), "union differs from exposure candidate source");
  check(typeof manifest.source_root === "string" && manifest.source_root.length > 0, "invalid audited source root");
  const compiled = coverageApi.compileCoverage(loaded.coverage_policy.value, path.resolve(base, manifest.source_root), pool);
  check(same(compiled.report, loaded.coverage.value), "finite coverage report differs from source-bound reconstruction");
  const result = buildCompanion(replayed.generator, replayed.paired, pool, reconstructed.result, compiled.report);
  const payload = { ...result, inputs: manifest, inputs_sha256: api.digest(manifest),
    pinned_inputs: Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k, v.descriptor])),
    raw_reference_files: replayed.raw_reference_files, replay_producers: replayed.replay_producers,
    producer_sha256: api.sha256(fs.readFileSync(__filename)), records_sha256: api.digest(result.records) };
  return { ...payload, admission_sha256: api.digest(payload) };
}
if (require.main === module) {
  try {
    const argv = process.argv.slice(2);
    check(argv.length === 4 && argv[0] === "--manifest" && argv[2] === "--output", "Usage: node admit.cjs --manifest INPUTS.json --output NEW.json");
    const p = path.resolve(argv[1]); const result = fromManifest(JSON.parse(fs.readFileSync(p)), path.dirname(p));
    fs.writeFileSync(argv[3], api.canonical(result) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ ...result.counts, admission_sha256: result.admission_sha256 }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { SCHEMA, OUTPUT_SCHEMA, indexFromDiscriminants, recordIdentity, pairObservation, finiteCoverage, coordinateBuckets, buildCompanion, loadPinned, fromManifest };
