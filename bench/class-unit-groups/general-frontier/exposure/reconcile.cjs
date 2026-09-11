"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { canonical, digest, sha256, normalizeRecord, OUTPUT_SCHEMA } = require("./export.cjs");
const SCHEMA = "sagejs.general-frontier/conservative-exposure-reconciliation-v1";
const INPUT_SCHEMA = "sagejs.general-frontier/exposure-reconciliation-inputs-v1";
const fail = (message) => { throw new Error(message); };
const check = (ok, message) => { if (!ok) fail(message); };
const sort = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function exactKeys(value, names, optional = []) {
  check(value && typeof value === "object" && !Array.isArray(value) && names.every((k) => Object.hasOwn(value, k)) &&
    Object.keys(value).every((k) => [...names, ...optional].includes(k)), "unknown or missing object keys");
}
function verifyDigest(value, key) {
  const { [key]: expected, ...body } = value;
  check(typeof expected === "string" && digest(body) === expected, `${key} mismatch`);
}
function signedInteger(value) {
  check(typeof value === "string" && /^-?[1-9][0-9]*$/.test(value), "invalid exact nonzero discriminant");
  return BigInt(value).toString();
}
function labelMetadata(label) {
  const r = normalizeRecord({ label }, 0);
  const absolute = BigInt(label.split(".")[2]);
  return { degree: r.degree, signature: r.signature, discriminant: (r.signature[1] % 2 ? -absolute : absolute).toString() };
}
function signature(value, degree) {
  check(Array.isArray(value) && value.length === 2 && value.every((x) => Number.isSafeInteger(x) && x >= 0) &&
    value[0] + 2 * value[1] === degree, "invalid signature");
  return value;
}
function sameSignature(a, b) { return canonical(a) === canonical(b); }

function poolRecords(pool) {
  check(pool.schema === "sagejs.general-class-unit-candidate-pool.v2" && pool.policy?.schema === "sagejs.general-class-unit-candidate-policy.v2", "unknown pool schema/policy");
  verifyDigest(pool, "pool_sha256");
  check(Array.isArray(pool.records) && pool.records.length <= 100_000 && pool.selected_count === pool.records.length &&
    digest(pool.records) === pool.records_sha256, "pool record binding mismatch");
  check(sha256(pool.records.map((r) => r.label).join("\n") + (pool.records.length ? "\n" : "")) === pool.labels_sha256, "pool label binding mismatch");
  const seen = new Set();
  return pool.records.map((r) => {
    check(Array.isArray(r.coefficients), "pool coefficients must be an array");
    const n = normalizeRecord(r, 0), m = labelMetadata(r.label);
    check(!seen.has(r.label), "duplicate pool label"); seen.add(r.label);
    check(n.degree >= 2 && n.degree <= 10 && r.r1 === m.signature[0] && r.r2 === m.signature[1] &&
      sameSignature(r.signature, m.signature), "pool signature/degree conflict");
    check([1, -1].includes(r.discriminant_sign) && typeof r.discriminant_absolute === "string" && /^[1-9][0-9]*$/.test(r.discriminant_absolute) &&
      (BigInt(r.discriminant_sign) * BigInt(r.discriminant_absolute)).toString() === m.discriminant, "pool discriminant/label conflict");
    return { label: r.label, coefficients: n.coefficients, polynomial_sha256: n.polynomial_sha256,
      degree: n.degree, signature: m.signature, discriminant: m.discriminant,
      source_record_sha256: digest(r) };
  });
}

function reconcile(pool, inventory, oracle, oracleRawSha256, additional = null) {
  const candidates = poolRecords(pool);
  check(inventory.schema === OUTPUT_SCHEMA, "unknown inventory schema");
  verifyDigest(inventory, "inventory_sha256");
  check(Array.isArray(inventory.records) && inventory.records.length <= 100_000 && Array.isArray(inventory.sources), "invalid inventory shape");
  const sourceMap = new Map();
  for (const s of inventory.sources) { check(!sourceMap.has(s.id), "duplicate inventory source"); sourceMap.set(s.id, s); }
  check(oracle.schema === undefined && oracle.schema_version === 1 && Array.isArray(oracle.cases) && oracle.oracle_baseline?.oracles, "unknown oracle fixture schema");
  const oracleCases = new Map();
  for (const r of oracle.cases) { check(!oracleCases.has(r.id), "duplicate oracle case id"); oracleCases.set(r.id, r); }
  const oracleMaps = ["sage_pari", "magma"].map((system) => {
    const rs = oracle.oracle_baseline.oracles[system]?.records;
    check(Array.isArray(rs), "missing named oracle records");
    const map = new Map();
    for (const r of rs) { check(!map.has(r.id), "duplicate oracle result id"); map.set(r.id, r); }
    return map;
  });
  const witnesses = [], unresolved = [], joins = [];
  for (const r of inventory.records) {
    const { evidence_sha256, ...body } = r;
    check(digest(body) === evidence_sha256, "inventory evidence digest mismatch");
    const s = sourceMap.get(r.source_id);
    check(s && s.category === r.category, "inventory source/category conflict");
    check(["source-asserted-presentation", "declared-invalid-quarantined"].includes(r.input_status), "unknown inventory input status");
    check(["prior-sage-exposure", "historical-quarantine", "selection-only", "reference-only"].includes(r.category), "unknown category");
    const normalized = normalizeRecord({ ...(r.label === null ? {} : { label: r.label }),
      ...(r.coefficients === null ? {} : { coefficients: r.coefficients }), degree: r.degree,
      ...(r.signature === null ? {} : { signature: r.signature }) }, 0, { invalid: r.input_status === "declared-invalid-quarantined" });
    check(normalized.polynomial_sha256 === r.polynomial_sha256, "inventory polynomial digest mismatch");
    let d = r.field_discriminant === null ? null : signedInteger(r.field_discriminant);
    let sig = r.signature === null ? null : signature(r.signature, r.degree);
    let method = d === null ? "missing" : "inventory-source-asserted-discriminant";
    if (r.label !== null) {
      const m = labelMetadata(r.label);
      check((d === null || d === m.discriminant) && (sig === null || sameSignature(sig, m.signature)), "historical label/discriminant/signature conflict");
      d = m.discriminant; sig = m.signature; method = "canonical-source-asserted-label";
    }
    if (r.label === null && s.kind === "class-unit-oracles") {
      check(s.sha256 === oracleRawSha256, "oracle fixture is not bound to inventory source");
      const c = oracleCases.get(r.source_record_id);
      if (c) {
        check(normalizeRecord(c, 0).polynomial_sha256 === r.polynomial_sha256, "oracle case polynomial conflict");
        const matches = oracleMaps.map((m) => m.get(r.source_record_id));
        if (matches.every(Boolean)) {
          check(matches.every((m) => m.degree === undefined || m.degree === r.degree), "conflicting oracle degree metadata");
          const md = matches.map((m) => signedInteger(m.field_discriminant));
          const ms = matches.map((m) => signature(m.signature, r.degree));
          check(md[0] === md[1] && sameSignature(ms[0], ms[1]) && (d === null || d === md[0]) &&
            (sig === null || sameSignature(sig, ms[0])), "conflicting oracle discriminant/signature metadata");
          if (d === null) joins.push({ evidence_sha256, case_id: r.source_record_id, field_discriminant: md[0], signature: ms[0],
            systems: ["sage_pari", "magma"], source_sha256: oracleRawSha256 });
          d = md[0]; sig = ms[0]; method = "joined-agreeing-pinned-sage-pari-and-magma";
        }
      }
    }
    const invalid = r.input_status === "declared-invalid-quarantined";
    if (d !== null && sig !== null) check((BigInt(d) < 0n) === (sig[1] % 2 === 1), "discriminant sign conflicts with signature");
    const quarantine = invalid || ["prior-sage-exposure", "historical-quarantine"].includes(r.category);
    const w = { evidence_sha256, source_id: r.source_id, source_record_id: r.source_record_id, category: r.category,
      label: r.label, polynomial_sha256: r.polynomial_sha256, degree: r.degree, signature: sig,
      field_discriminant: d, metadata_method: method, invalid, quarantine };
    witnesses.push(w);
    if (quarantine && !invalid && r.degree >= 2 && r.degree <= 10 && d === null) unresolved.push(w);
  }
  const polynomialMetadata = new Map();
  for (const w of witnesses.filter((w) => w.polynomial_sha256 !== null && !w.invalid)) {
    const previous = polynomialMetadata.get(w.polynomial_sha256);
    if (previous) {
      check(previous.degree === w.degree && (previous.field_discriminant === null || w.field_discriminant === null || previous.field_discriminant === w.field_discriminant) &&
        (previous.signature === null || w.signature === null || sameSignature(previous.signature, w.signature)), "conflicting metadata for identical polynomial");
      previous.field_discriminant ??= w.field_discriminant; previous.signature ??= w.signature;
    } else polynomialMetadata.set(w.polynomial_sha256, { ...w });
  }
  let extras = [];
  if (additional !== null) {
    exactKeys(additional, ["schema", "category", "records"]);
    check(additional.schema === "sagejs.general-frontier/additional-exposure-v1" &&
      ["prior-sage-exposure", "historical-quarantine", "selection-only", "reference-only"].includes(additional.category) && Array.isArray(additional.records) && additional.records.length <= 100_000, "unknown additional exposure schema/category");
    const seen = new Set();
    extras = additional.records.map((r) => {
      exactKeys(r, ["id", "coefficients"], ["label"]);
      check(typeof r.id === "string" && r.id.length > 0 && !seen.has(r.id) && Array.isArray(r.coefficients), "invalid or duplicate additional exposure row"); seen.add(r.id);
      const n = normalizeRecord(r, 0);
      const m = n.label === null ? { degree: n.degree, signature: null, discriminant: null } : labelMetadata(n.label);
      return { id: r.id, label: n.label, polynomial_sha256: n.polynomial_sha256, category: additional.category, ...m,
        quarantine: ["prior-sage-exposure", "historical-quarantine"].includes(additional.category) };
    });
  }
  const results = candidates.map((c) => {
    const reasons = [];
    for (const w of witnesses) {
      let kind = null;
      if (w.label === c.label) kind = "exact-source-asserted-label";
      else if (w.polynomial_sha256 === c.polynomial_sha256) kind = "exact-coefficients";
      else if (!w.invalid && w.degree === c.degree && (w.signature === null || sameSignature(w.signature, c.signature))) {
        if (w.field_discriminant === c.discriminant) kind = "possible-same-field-bucket-not-isomorphism";
        else if (w.field_discriminant === null && w.quarantine) kind = "unresolved-historical-metadata";
      }
      if (kind !== null) reasons.push({ kind, evidence_sha256: w.evidence_sha256, category: w.category, quarantine: w.quarantine });
    }
    for (const r of extras) {
      let kind = null;
      if (r.label === c.label || r.polynomial_sha256 === c.polynomial_sha256) kind = "explicit-additional-exposure-match";
      else if (r.degree === c.degree && (r.signature === null || sameSignature(r.signature, c.signature))) {
        if (r.discriminant === c.discriminant) kind = "explicit-additional-possible-same-field-bucket";
        else if (r.discriminant === null && r.quarantine) kind = "explicit-additional-unresolved-metadata";
      }
      if (kind) reasons.push({ kind, additional_id: r.id, category: r.category, quarantine: r.quarantine });
    }
    reasons.sort((a, b) => sort(canonical(a), canonical(b)));
    const quarantined = reasons.some((r) => r.quarantine);
    return { ...c, quarantine: quarantined, holdout_eligible: quarantined ? false : null,
      status: quarantined ? "conservatively-quarantined" : "not-quarantined-by-these-inputs-coverage-approval-pending", reasons };
  }).sort((a, b) => sort(a.label, b.label));
  const count = (rs) => ({ total: rs.length, quarantined: rs.filter((r) => r.quarantine).length,
    not_quarantined: rs.filter((r) => !r.quarantine).length });
  const perDegree = Array.from({ length: 9 }, (_, i) => i + 2).map((degree) => {
    const rs = results.filter((r) => r.degree === degree);
    return { degree, ...count(rs), signatures: Array.from({ length: Math.floor(degree / 2) + 1 }, (_, r2) => {
      const sig = [degree - 2 * r2, r2]; return { signature: sig, ...count(rs.filter((r) => sameSignature(r.signature, sig))) };
    }) };
  });
  const payload = { schema: SCHEMA, state: "conservative-quarantine-not-field-isomorphism-or-final-eligibility",
    source_coverage_approved: false, distinct_fields: null, pool_sha256: pool.pool_sha256,
    inventory_sha256: inventory.inventory_sha256, oracle_fixture_sha256: oracleRawSha256,
    metadata_joins: joins.sort((a, b) => sort(a.evidence_sha256, b.evidence_sha256)),
    unresolved_metadata: unresolved.sort((a, b) => sort(a.evidence_sha256, b.evidence_sha256)),
    source_assertions: witnesses.sort((a, b) => sort(a.evidence_sha256, b.evidence_sha256)),
    additional_exposure_sha256: additional === null ? null : digest(additional),
    additional_source_assertions: extras.sort((a, b) => sort(a.id, b.id)),
    additional_unresolved_metadata: extras.filter((r) => r.quarantine && r.discriminant === null),
    counts: count(results), per_degree: perDegree, candidates: results };
  return { ...payload, reconciliation_sha256: digest(payload) };
}
function load(descriptor, base) {
  exactKeys(descriptor, ["path", "sha256"]);
  check(typeof descriptor.path === "string" && descriptor.path.length > 0 && /^[a-f0-9]{64}$/.test(descriptor.sha256), "invalid input descriptor");
  const file = path.resolve(base, descriptor.path), st = fs.lstatSync(file);
  check(st.isFile() && !st.isSymbolicLink() && st.size <= 64 * 1024 * 1024, "input must be bounded regular file");
  const bytes = fs.readFileSync(file); check(sha256(bytes) === descriptor.sha256, "raw input SHA256 mismatch");
  return JSON.parse(bytes);
}
function fromManifest(manifest, base) {
  exactKeys(manifest, ["schema", "pool", "inventory", "oracle_fixture"], ["additional_exposure"]);
  check(manifest.schema === INPUT_SCHEMA, "unknown reconciliation manifest schema");
  const result = reconcile(load(manifest.pool, base), load(manifest.inventory, base),
    load(manifest.oracle_fixture, base), manifest.oracle_fixture.sha256,
    manifest.additional_exposure ? load(manifest.additional_exposure, base) : null);
  const payload = { schema: "sagejs.general-frontier/exposure-reconciliation-envelope-v1", inputs: manifest,
    inputs_sha256: digest(manifest), producer_sha256: sha256(fs.readFileSync(__filename)),
    normalization_producer_sha256: sha256(fs.readFileSync(path.join(__dirname, "export.cjs"))), result };
  return { ...payload, envelope_sha256: digest(payload) };
}
if (require.main === module) {
  try {
    const argv = process.argv.slice(2); check(argv.length === 4 && argv[0] === "--manifest" && argv[2] === "--output", "Usage: node reconcile.cjs --manifest INPUTS.json --output NEW.json");
    const p = path.resolve(argv[1]); const out = fromManifest(JSON.parse(fs.readFileSync(p)), path.dirname(p));
    fs.writeFileSync(argv[3], canonical(out) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ ...out.result.counts, metadata_joins: out.result.metadata_joins.length, unresolved_metadata: out.result.unresolved_metadata.length, envelope_sha256: out.envelope_sha256 }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { SCHEMA, INPUT_SCHEMA, reconcile, fromManifest, poolRecords, labelMetadata };
