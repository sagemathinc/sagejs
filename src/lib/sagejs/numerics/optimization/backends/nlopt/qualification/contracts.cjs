"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CASE_RECEIPT_SCHEMA = "sagejs.numerical-nlopt-case-execution/v3";
const EVIDENCE_RECEIPT_SCHEMA = "sagejs.numerical-nlopt-release-evidence/v2";
const QUALIFICATION_SCHEMA = "sagejs.numerical-nlopt-qualification-summary/v3";
const MANIFEST_SCHEMA = "sagejs.numerical-nlopt-production-manifest/v1";
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function fail(message) {
  throw new Error(message);
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} has missing or extra fields: expected ${wanted.join(", ")}; got ${actual.join(", ")}`);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("undefined cannot enter canonical JSON");
  return encoded;
}

function formattedJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// A production build report records both the canonical toolchain recipe and
// the host which executed that recipe.  Host-builder provenance is important
// evidence, but it is not a portable source/artifact identity: reproducible
// Linux and macOS builds intentionally have different builder digests.  Bind
// qualification receipts to every report field except that local provenance.
// The raw report remains available through buildReportBinding for auditing.
function portableBuildReportBinding(report) {
  assertObject(report, "NLopt build report");
  const portable = structuredClone(report);
  const toolchain = assertObject(portable.toolchain, "NLopt build report toolchain");
  const builder = assertObject(toolchain.builder, "NLopt build report builder");
  exactKeys(builder, ["identity", "platform"], "NLopt build report builder");
  assertSha(builder.identity, "NLopt build report builder identity");
  if (typeof builder.platform !== "string" || builder.platform.length === 0) {
    fail("NLopt build report builder platform must be a non-empty string");
  }
  delete toolchain.builder;
  const bytes = Buffer.from(canonicalJson(portable));
  return { sha256: sha256(bytes), bytes: bytes.length };
}

function assertSha(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be a SHA-256 digest`);
}

function assertCommit(value, label = "candidate commit") {
  if (typeof value !== "string" || !COMMIT.test(value)) fail(`${label} must be a full lowercase commit ID`);
}

function assertExactArray(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length ||
      value.some((item, index) => item !== expected[index])) {
    fail(`${label} must be exactly ${JSON.stringify(expected)}`);
  }
}

function assertUnique(value, label) {
  if (new Set(value).size !== value.length) fail(`${label} contains duplicates`);
}

function regularBytes(filename, label) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symbolic-link file`);
  return fs.readFileSync(filename);
}

// JSON.parse silently accepts duplicate object keys. Release evidence does not:
// the producer, verifier, and reviewer must all see the same object.
function parseJsonText(text, label = "JSON") {
  let index = 0;
  const error = (message) => fail(`${label}: ${message} at byte ${Buffer.byteLength(
    text.slice(0, index),
  )}`);
  const whitespace = () => {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[index])) ++index;
  };
  const string = () => {
    const start = index++;
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') {
        try { return JSON.parse(text.slice(start, index)); } catch { error("invalid string"); }
      }
      if (character === "\\") {
        if (index >= text.length) error("unterminated escape");
        const escaped = text[index++];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index, index + 4))) {
            error("invalid Unicode escape");
          }
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escaped)) error("invalid escape");
      } else if (character.charCodeAt(0) < 0x20) error("unescaped control character");
    }
    return error("unterminated string");
  };
  const number = () => {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      text.slice(index),
    );
    if (match === null) error("invalid number");
    index += match[0].length;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) error("non-finite number");
    return result;
  };
  const value = () => {
    whitespace();
    const character = text[index];
    if (character === '"') return string();
    if (character === "[") {
      ++index;
      whitespace();
      const result = [];
      if (text[index] === "]") { ++index; return result; }
      for (;;) {
        result.push(value());
        whitespace();
        if (text[index] === "]") { ++index; return result; }
        if (text[index++] !== ",") error("expected ',' or ']'");
      }
    }
    if (character === "{") {
      ++index;
      whitespace();
      const result = Object.create(null);
      const keys = new Set();
      if (text[index] === "}") { ++index; return result; }
      for (;;) {
        whitespace();
        if (text[index] !== '"') error("expected an object key");
        const key = string();
        if (keys.has(key)) error(`duplicate object key ${JSON.stringify(key)}`);
        keys.add(key);
        whitespace();
        if (text[index++] !== ":") error("expected ':'");
        result[key] = value();
        whitespace();
        if (text[index] === "}") { ++index; return result; }
        if (text[index++] !== ",") error("expected ',' or '}'");
      }
    }
    for (const [token, result] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(token, index)) { index += token.length; return result; }
    }
    if (character === "-" || /[0-9]/.test(character ?? "")) return number();
    return error("expected a JSON value");
  };
  const result = value();
  whitespace();
  if (index !== text.length) error("trailing content");
  return result;
}

function readJson(filename, label) {
  const bytes = regularBytes(filename, label);
  let value;
  try {
    value = parseJsonText(bytes.toString("utf8"), label);
  } catch (error) {
    fail(`${label} is not strict JSON: ${error.message}`);
  }
  return { value, bytes, sha256: sha256(bytes), size: bytes.length };
}

function validateSelection(selection) {
  exactKeys(selection, [
    "schema", "method", "upstream_identity", "case_ids", "evidence_kinds",
    "portable_platforms", "browser_evidence", "historical_exclusions",
  ], "qualification selection");
  if (selection.schema !== "sagejs.numerical-nlopt-qualification-selection/v2" ||
      selection.method !== "nlopt-nelder-mead" ||
      selection.upstream_identity !== "NLOPT_LN_NELDERMEAD") {
    fail("qualification selection has the wrong method identity");
  }
  if (!Array.isArray(selection.case_ids) || selection.case_ids.length === 0) {
    fail("qualification selection has no cases");
  }
  assertUnique(selection.case_ids, "qualification case IDs");
  if (selection.case_ids.some((id) => typeof id !== "string" || /cobyla/i.test(id))) {
    fail("qualification selection contains an invalid or COBYLA case");
  }
  assertExactArray(selection.evidence_kinds, [
    "sanitizer", "destructive-wasm", "browser-lifecycle", "public-integration",
    "resource-corruption", "relocation", "sea",
  ], "qualification evidence kinds");
  exactKeys(selection.portable_platforms, [
    "linux-x64", "linux-arm64", "macos-arm64", "windows-x64",
  ], "portable platforms");
  const expected = {
    "linux-x64": ["linux", "x64", "bench-1"],
    "linux-arm64": ["linux", "arm64", "bench-arm"],
    "macos-arm64": ["darwin", "arm64", "m1"],
    "windows-x64": ["win32", "x64", "windows"],
  };
  for (const [id, [os, architecture, hostAlias]] of Object.entries(expected)) {
    exactKeys(selection.portable_platforms[id], [
      "os", "architecture", "host_alias", "operator_signing",
    ], `portable platform ${id}`);
    if (selection.portable_platforms[id].os !== os ||
        selection.portable_platforms[id].architecture !== architecture ||
        selection.portable_platforms[id].host_alias !== hostAlias) {
      fail(`portable platform ${id} has the wrong runtime identity`);
    }
    const operatorSigning = selection.portable_platforms[id].operator_signing;
    exactKeys(operatorSigning, [
      "algorithm", "public_key_spki_sha256", "public_key_pem",
    ], `portable platform ${id} operator signing`);
    if (operatorSigning.algorithm !== "rsa-pkcs1-sha256") {
      fail(`portable platform ${id} has an unsupported operator-signing algorithm`);
    }
    assertSha(operatorSigning.public_key_spki_sha256,
      `portable platform ${id} public-key digest`);
    let key;
    try { key = crypto.createPublicKey(operatorSigning.public_key_pem); } catch {
      fail(`portable platform ${id} has an invalid public key`);
    }
    if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails?.modulusLength < 3072 ||
        sha256(key.export({ type: "spki", format: "der" })) !==
          operatorSigning.public_key_spki_sha256) {
      fail(`portable platform ${id} public-key identity mismatch`);
    }
  }
  exactKeys(selection.browser_evidence, [
    "engine", "version", "result_case_ids", "results_sha256",
  ], "browser evidence selection");
  if (selection.browser_evidence.engine !== "chromium" ||
      !/^\d+\.\d+\.\d+\.\d+$/.test(selection.browser_evidence.version)) {
    fail("browser evidence has an invalid exact Chromium identity");
  }
  assertExactArray(selection.browser_evidence.result_case_ids, selection.case_ids,
    "browser evidence result case IDs");
  assertSha(selection.browser_evidence.results_sha256, "browser result digest");
  exactKeys(selection.historical_exclusions, ["nlopt-cobyla"], "historical exclusions");
  const cobyla = selection.historical_exclusions["nlopt-cobyla"];
  exactKeys(cobyla, ["status", "reason", "qualification_rule"], "COBYLA exclusion");
  if (cobyla.status !== "excluded" || !/undefined behavior/i.test(cobyla.reason) ||
      !/never accepted/i.test(cobyla.qualification_rule)) {
    fail("COBYLA exclusion does not fail closed");
  }
  return selection;
}

function assertChallenge(value) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail("qualification campaign challenge must be a SHA-256 digest");
  }
  return value;
}

function receiptBody(receipt) {
  const body = { ...receipt };
  delete body.origin;
  return body;
}

function attachReceiptOrigin(receipt, {
  context, platformId, campaignChallenge, privateKeyPath,
}) {
  assertChallenge(campaignChallenge);
  const platform = context.selection.portable_platforms[platformId];
  if (platform === undefined) fail(`unknown operator-signed platform ${platformId}`);
  const privateKey = crypto.createPrivateKey(regularBytes(
    privateKeyPath, `${platformId} operator-signing private key`,
  ));
  const publicKey = crypto.createPublicKey(privateKey);
  const publicDigest = sha256(publicKey.export({ type: "spki", format: "der" }));
  if (publicKey.asymmetricKeyType !== "rsa" || publicDigest !==
      platform.operator_signing.public_key_spki_sha256) {
    fail(`${platformId} operator-signing key is not the selected persistent-host key`);
  }
  const payload = Buffer.from(formattedJson(receiptBody(receipt)));
  const signature = crypto.sign("sha256", payload, {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  }).toString("base64");
  return {
    ...receipt,
    origin: {
      schema: "sagejs.numerical-nlopt-persistent-host-operator-signature/v1",
      platform_id: platformId,
      host_alias: platform.host_alias,
      campaign_challenge: campaignChallenge,
      algorithm: platform.operator_signing.algorithm,
      public_key_spki_sha256: publicDigest,
      payload_sha256: sha256(payload),
      payload_bytes: payload.length,
      signature,
    },
  };
}

function validateReceiptOrigin(receipt, context, platformId, campaignChallenge, label) {
  assertChallenge(campaignChallenge);
  const platform = context.selection.portable_platforms[platformId];
  if (platform === undefined) fail(`${label} names unknown platform ${platformId}`);
  const origin = receipt.origin;
  exactKeys(origin, [
    "schema", "platform_id", "host_alias", "campaign_challenge", "algorithm",
    "public_key_spki_sha256", "payload_sha256", "payload_bytes", "signature",
  ], `${label} origin`);
  if (origin.schema !== "sagejs.numerical-nlopt-persistent-host-operator-signature/v1" ||
      origin.platform_id !== platformId || origin.host_alias !== platform.host_alias ||
      origin.campaign_challenge !== campaignChallenge ||
      origin.algorithm !== platform.operator_signing.algorithm ||
      origin.public_key_spki_sha256 !== platform.operator_signing.public_key_spki_sha256) {
    fail(`${label} does not have the exact candidate-bound platform origin`);
  }
  assertSha(origin.payload_sha256, `${label} operator-signed-payload digest`);
  if (!Number.isSafeInteger(origin.payload_bytes) || origin.payload_bytes <= 0 ||
      typeof origin.signature !== "string" || !BASE64.test(origin.signature) ||
      Buffer.from(origin.signature, "base64").toString("base64") !== origin.signature) {
    fail(`${label} has an invalid persistent-host signature`);
  }
  const payload = Buffer.from(formattedJson(receiptBody(receipt)));
  if (origin.payload_sha256 !== sha256(payload) || origin.payload_bytes !== payload.length) {
    fail(`${label} persistent-host signed payload is stale`);
  }
  const valid = crypto.verify("sha256", payload, {
    key: platform.operator_signing.public_key_pem,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  }, Buffer.from(origin.signature, "base64"));
  if (!valid) fail(`${label} persistent-host signature is invalid`);
  return origin;
}

function validateCorpus(corpus, selection) {
  exactKeys(corpus, ["schema", "cases"], "NLopt corpus");
  if (corpus.schema !== "sagejs.numerical-nlopt-corpus/v1" || !Array.isArray(corpus.cases)) {
    fail("invalid NLopt corpus");
  }
  const allIds = corpus.cases.map(({ id }) => id);
  assertUnique(allIds, "corpus case IDs");
  const selected = corpus.cases.filter(({ id }) => selection.case_ids.includes(id));
  assertExactArray(selected.map(({ id }) => id), selection.case_ids, "selected corpus cases");
  for (const record of selected) {
    if (record.method !== "nlopt-nelder-mead" || /cobyla/i.test(canonicalJson(record))) {
      fail(`selected corpus case ${record.id} is not Nelder-Mead-only`);
    }
  }
  const methodCases = corpus.cases.filter(({ method }) => method === "nlopt-nelder-mead");
  assertExactArray(methodCases.map(({ id }) => id), selection.case_ids,
    "complete Nelder-Mead corpus selection");
  return selected;
}

function validateOracle(oracle, selection, corpusSha256, oracleSourceSha256) {
  exactKeys(oracle, [
    "schema", "method", "oracle", "corpus_sha256", "oracle_source_sha256",
    "selected_results_encoding", "selected_results_sha256", "runtime", "case_ids",
    "accepted_cases", "cases", "scope", "historical_cobyla_evidence",
  ], "oracle summary");
  if (oracle.schema !== "sagejs.numerical-nlopt-nelder-mead-oracle-summary/v2" ||
      oracle.method !== "nlopt-nelder-mead" ||
      oracle.oracle !== "scipy.optimize.Nelder-Mead") fail("oracle summary has the wrong identity");
  assertExactArray(oracle.case_ids, selection.case_ids, "oracle case IDs");
  if (oracle.accepted_cases !== selection.case_ids.length ||
      oracle.corpus_sha256 !== corpusSha256 ||
      oracle.oracle_source_sha256 !== oracleSourceSha256) {
    fail("oracle summary is stale or incomplete");
  }
  assertSha(oracle.selected_results_sha256, "oracle selected-results digest");
  if (!Array.isArray(oracle.cases)) fail("oracle cases must be an array");
  if (oracle.selected_results_encoding !== "canonical-json-sorted-object-keys/v1" ||
      oracle.selected_results_sha256 !== sha256(Buffer.from(canonicalJson(oracle.cases)))) {
    fail("oracle selected-results digest mismatch");
  }
  assertExactArray(oracle.cases.map(({ id }) => id), selection.case_ids, "oracle result case IDs");
  for (const record of oracle.cases) {
    if (record.oracle !== "scipy.optimize.Nelder-Mead" || record.success !== true ||
        record.status !== 0 || !Array.isArray(record.value) ||
        record.value.some((value) => !Number.isFinite(value)) ||
        !Number.isFinite(record.objective) || record.maximum_violation !== 0 ||
        /cobyla/i.test(canonicalJson(record))) fail(`oracle case ${record.id} is invalid`);
  }
  if (oracle.historical_cobyla_evidence !== "excluded" ||
      !/no COBYLA result or status contributes/i.test(oracle.scope)) {
    fail("oracle summary does not exclude historical COBYLA evidence");
  }
  if (/cobyla/i.test(canonicalJson(oracle.runtime))) {
    fail("oracle runtime contains COBYLA implementation evidence");
  }
  return oracle;
}

function validateManifestShape(manifest) {
  if (manifest.schema !== MANIFEST_SCHEMA) fail("wrong production manifest schema");
  if (manifest.selection !== "explicit-only" ||
      canonicalJson(manifest.methods) !== canonicalJson({
        "nlopt-nelder-mead": "NLOPT_LN_NELDERMEAD",
      })) fail("production manifest is not explicit Nelder-Mead-only");
  if (manifest.source?.luksan_enabled !== false ||
      manifest.source?.compiled_sources?.some((source) => /cobyla|luksan|esch|ags/i.test(source))) {
    fail("production manifest contains an excluded source family");
  }
  assertSha(manifest.public_semantics_bundle?.sha256, "public semantics bundle digest");
  return validateManifestQualificationState(manifest);
}

function validateManifestQualificationState(manifest) {
  const qualification = assertObject(manifest.qualification, "production manifest qualification");
  if (qualification.status === "pending_source_current_requalification") {
    exactKeys(qualification, [
      "status", "reason", "public_semantics_bundle_sha256",
      "qualification_tooling_bundle_sha256", "selection_sha256", "oracle_sha256",
      "invalidated_summary",
    ], "pending production manifest qualification");
    if (typeof qualification.reason !== "string" || qualification.reason.length === 0 ||
        qualification.invalidated_summary !== "qualification-v1.json") {
      fail("pending production manifest qualification has invalid provenance");
    }
    for (const field of [
      "public_semantics_bundle_sha256", "qualification_tooling_bundle_sha256",
      "selection_sha256", "oracle_sha256",
    ]) assertSha(qualification[field], `pending qualification ${field}`);
    return "pending";
  }
  if (qualification.status === "qualified") {
    exactKeys(qualification, [
      "status", "candidate_commit", "summary_sha256", "summary_bytes",
      "public_semantics_bundle_sha256", "qualification_tooling_bundle_sha256",
      "selection_sha256", "corpus_sha256", "oracle_sha256", "source_closure_sha256",
      "artifact_sha256", "artifact_bytes", "case_execution_sha256",
      "campaign_challenge", "evidence_receipts_sha256", "portable_receipts_sha256",
      "historical_cobyla_status",
    ], "qualified production manifest qualification");
    assertCommit(qualification.candidate_commit, "qualified candidate commit");
    for (const field of [
      "summary_sha256", "public_semantics_bundle_sha256",
      "qualification_tooling_bundle_sha256", "selection_sha256", "corpus_sha256",
      "oracle_sha256", "source_closure_sha256", "artifact_sha256",
      "case_execution_sha256", "campaign_challenge",
    ]) assertSha(qualification[field], `qualified qualification ${field}`);
    if (!Number.isSafeInteger(qualification.summary_bytes) || qualification.summary_bytes <= 0 ||
        !Number.isSafeInteger(qualification.artifact_bytes) || qualification.artifact_bytes <= 0 ||
        qualification.historical_cobyla_status !== "excluded-not-qualified") {
      fail("qualified production manifest qualification has invalid exact bindings");
    }
    assertObject(qualification.evidence_receipts_sha256,
      "qualified evidence receipt bindings");
    assertObject(qualification.portable_receipts_sha256,
      "qualified portable receipt bindings");
    return "qualified";
  }
  fail(`production manifest qualification has forbidden state ${JSON.stringify(
    qualification.status,
  )}; expected exactly pending_source_current_requalification or qualified`);
}

function git(root, arguments_, options = {}) {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function validateCandidateBindings(root, candidate, filenames) {
  const commit = git(root, ["cat-file", "-e", `${candidate}^{commit}`]);
  if (commit.status !== 0) fail(`candidate commit does not exist: ${candidate}`);
  const ancestor = git(root, ["merge-base", "--is-ancestor", candidate, "HEAD"]);
  if (ancestor.status !== 0) fail(`candidate commit is not an ancestor of HEAD: ${candidate}`);
  for (const relative of [...new Set(filenames)].sort()) {
    if (path.isAbsolute(relative) || relative.includes("..") || relative.includes(":")) {
      fail(`candidate binding has an unsafe path: ${relative}`);
    }
    const blob = git(root, ["show", `${candidate}:${relative}`]);
    if (blob.status !== 0) fail(`candidate does not contain source-current file: ${relative}`);
    if (sha256(blob.stdout) !== sha256(regularBytes(path.join(root, relative), relative))) {
      fail(`working source does not match candidate blob: ${relative}`);
    }
  }
}

function reviewedBundle(root, files, label) {
  assertObject(files, `${label} files`);
  const records = Object.entries(files).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0);
  if (records.length === 0) fail(`${label} has no files`);
  for (const [relative, expected] of records) {
    assertSha(expected, `${label} ${relative}`);
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(`${path.resolve(root)}${path.sep}`)) fail(`${label} path escapes repository`);
    const actual = sha256(regularBytes(filename, `${label} ${relative}`));
    if (actual !== expected) fail(`${label} file changed: ${relative}`);
  }
  return sha256(Buffer.from(records.map(([name, digest]) => `${name}\0${digest}\0`).join("")));
}

function loadCurrentContext({ root, candidate, manifestPath, artifactPath, buildReportPath,
  corpusPath, oraclePath, oracleSourcePath, selectionPath }) {
  assertCommit(candidate);
  const manifestRecord = readJson(manifestPath, "production manifest");
  const manifest = manifestRecord.value;
  const manifestState = validateManifestShape(manifest);
  const packageRoot = path.dirname(path.dirname(manifestPath));
  const sourceLock = readJson(path.join(packageRoot, "source-lock.json"), "NLopt source lock");
  const license = regularBytes(path.join(packageRoot, "licenses/COPYING"), "NLopt license");
  const build = readJson(buildReportPath, "NLopt build report");
  const portableBuild = portableBuildReportBinding(build.value);
  const artifact = regularBytes(artifactPath, "NLopt Wasm artifact");
  if (build.value.schema !== "sagejs.numerical-nlopt-build/v1" ||
      canonicalJson(build.value.methods) !== canonicalJson(["nlopt-nelder-mead"]) ||
      build.value.selection !== "explicit-only" ||
      build.value.artifact?.sha256 !== sha256(artifact) ||
      build.value.artifact?.bytes !== artifact.length) {
    fail("artifact is not the source-current NM-only build-report artifact");
  }
  if (build.value.source_closure?.compiled_sources?.some((source) => /cobyla/i.test(source))) {
    fail("build report contains COBYLA source");
  }
  assertExactArray(build.value.source_closure?.compiled_sources,
    manifest.source.compiled_sources, "exact NM compiled source allowlist");
  assertExactArray(build.value.source_closure?.rejected_source_patterns, [
    "src/algs/luksan/", "src/algs/esch/", "src/algs/ags/",
  ], "excluded source-family patterns");
  if (sourceLock.value.schema !== "sagejs.numerical-nlopt-source-lock/v1" ||
      canonicalJson(sourceLock.value.nlopt) !== canonicalJson(build.value.source) ||
      sourceLock.sha256 !== manifest.source.source_lock_sha256 ||
      sha256(license) !== manifest.source.license_sha256) {
    fail("source lock, license, build report, and manifest are not identical bindings");
  }
  for (const field of ["revision", "archive_sha256", "license_sha256"]) {
    if (manifest.source[field] !== build.value.source[field]) fail(`manifest/build ${field} mismatch`);
  }
  if (manifest.source.source_closure_sha256 !== build.value.source_closure.sha256) {
    fail("manifest/build source closure mismatch");
  }
  if (manifest.artifact.sha256 !== build.value.artifact.sha256 ||
      manifest.artifact.bytes !== build.value.artifact.bytes) {
    fail("manifest/build artifact mismatch");
  }
  for (const field of [
    "gzip_bytes", "brotli_bytes", "initial_memory_bytes", "maximum_memory_bytes",
  ]) {
    if (manifest.artifact[field] !== build.value.artifact[field]) {
      fail(`manifest/build artifact ${field} mismatch`);
    }
  }
  if (canonicalJson(manifest.artifact.imports) !== canonicalJson(build.value.artifact.imports) ||
      canonicalJson(manifest.artifact.imports) !== canonicalJson(
        WebAssembly.Module.imports(new WebAssembly.Module(artifact)))) {
    fail("manifest/build/runtime Wasm imports mismatch");
  }
  for (const field of ["identity", "target", "floating_point_contract"]) {
    if (manifest.toolchain[field] !== build.value.toolchain[field]) {
      fail(`manifest/build toolchain ${field} mismatch`);
    }
  }
  const publicDigest = reviewedBundle(root, manifest.reviewed_sagejs_files, "public semantics bundle");
  if (publicDigest !== manifest.public_semantics_bundle.sha256) {
    fail("public semantics bundle digest mismatch");
  }
  const toolingDigest = reviewedBundle(root, manifest.qualification_tooling_files,
    "qualification tooling bundle");
  if (toolingDigest !== manifest.qualification_tooling_bundle.sha256) {
    fail("qualification tooling bundle digest mismatch");
  }
  const selectionRecord = readJson(selectionPath, "qualification selection");
  const selection = validateSelection(selectionRecord.value);
  const corpusRecord = readJson(corpusPath, "NLopt corpus");
  validateCorpus(corpusRecord.value, selection);
  const oracleSource = regularBytes(oracleSourcePath, "SciPy oracle source");
  const oracleRecord = readJson(oraclePath, "oracle summary");
  validateOracle(oracleRecord.value, selection, corpusRecord.sha256, sha256(oracleSource));
  if (manifestState === "pending") {
    const pending = manifest.qualification;
    const bindings = [
      ["public_semantics_bundle_sha256", manifest.public_semantics_bundle.sha256],
      ["qualification_tooling_bundle_sha256", manifest.qualification_tooling_bundle.sha256],
      ["selection_sha256", selectionRecord.sha256],
      ["oracle_sha256", oracleRecord.sha256],
    ];
    for (const [field, expected] of bindings) {
      if (pending[field] !== expected) fail(`pending qualification has stale ${field}`);
    }
  }
  validateCandidateBindings(root, candidate, [
    ...Object.keys(manifest.reviewed_sagejs_files),
    ...Object.keys(manifest.qualification_tooling_files),
    path.relative(root, path.join(packageRoot, "source-lock.json")).replaceAll(path.sep, "/"),
    path.relative(root, path.join(packageRoot, "licenses/COPYING")).replaceAll(path.sep, "/"),
    path.relative(root, corpusPath).replaceAll(path.sep, "/"),
  ]);
  return {
    root: path.resolve(root),
    candidate,
    manifest,
    manifestState,
    manifestRecord,
    buildReport: build.value,
    buildReportBinding: { sha256: build.sha256, bytes: build.size },
    artifact: { sha256: sha256(artifact), bytes: artifact.length },
    source: {
      revision: build.value.source.revision,
      source_lock_sha256: sourceLock.sha256,
      source_closure_sha256: build.value.source_closure.sha256,
      build_report_sha256: portableBuild.sha256,
    },
    publicSemantics: { ...manifest.public_semantics_bundle },
    tooling: { ...manifest.qualification_tooling_bundle },
    selection,
    selectionBinding: { sha256: selectionRecord.sha256, bytes: selectionRecord.size },
    corpus: corpusRecord.value,
    corpusBinding: { sha256: corpusRecord.sha256, bytes: corpusRecord.size },
    oracle: oracleRecord.value,
    oracleBinding: { sha256: oracleRecord.sha256, bytes: oracleRecord.size },
    oracleSourceSha256: sha256(oracleSource),
  };
}

function commonReceiptKeys() {
  return [
    "candidate_commit", "artifact", "public_semantics_bundle_sha256",
    "qualification_tooling_bundle_sha256", "source_lock_sha256",
    "source_closure_sha256", "build_report_sha256", "corpus_sha256",
    "oracle_sha256", "oracle_source_sha256", "selection_sha256", "selected_case_ids",
  ];
}

function validateCommonReceipt(receipt, context, label) {
  if (receipt.candidate_commit !== context.candidate) fail(`${label} has the wrong candidate`);
  exactKeys(receipt.artifact, ["sha256", "bytes"], `${label} artifact`);
  if (receipt.artifact.sha256 !== context.artifact.sha256 ||
      receipt.artifact.bytes !== context.artifact.bytes) fail(`${label} has the wrong artifact`);
  const expected = [
    ["public_semantics_bundle_sha256", context.publicSemantics.sha256],
    ["qualification_tooling_bundle_sha256", context.tooling.sha256],
    ["source_lock_sha256", context.source.source_lock_sha256],
    ["source_closure_sha256", context.source.source_closure_sha256],
    ["build_report_sha256", context.source.build_report_sha256],
    ["corpus_sha256", context.corpusBinding.sha256],
    ["oracle_sha256", context.oracleBinding.sha256],
    ["oracle_source_sha256", context.oracleSourceSha256],
    ["selection_sha256", context.selectionBinding.sha256],
  ];
  for (const [field, value] of expected) {
    if (receipt[field] !== value) fail(`${label} has stale ${field}`);
  }
  assertExactArray(receipt.selected_case_ids, context.selection.case_ids,
    `${label} selected case IDs`);
}

function validateRuntime(runtime, label) {
  exactKeys(runtime, ["node", "os", "architecture"], `${label} runtime`);
  const match = typeof runtime.node === "string"
    ? /^v(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(runtime.node)
    : null;
  if (match === null ||
      typeof runtime.os !== "string" || typeof runtime.architecture !== "string") {
    fail(`${label} has an invalid runtime`);
  }
  const version = match.slice(1, 4).map(Number);
  if (version[0] < 22 || (version[0] === 22 &&
      (version[1] < 22 || (version[1] === 22 && version[2] < 2)))) {
    fail(`${label} used unsupported Node ${runtime.node}`);
  }
}

function objective(record, values) {
  const [x, y = 0] = values;
  switch (record.problem) {
    case "rosenbrock": return (1 - x) ** 2 + 100 * (y - x * x) ** 2;
    case "beale": return (1.5 - x + x * y) ** 2 +
      (2.25 - x + x * y ** 2) ** 2 + (2.625 - x + x * y ** 3) ** 2;
    case "absolute": return Math.abs(x) + 2 * Math.abs(y);
    case "outside_box": return (x - 3) ** 2 + (y + 2) ** 2;
    case "ill_scaled": return ((x - 1e6) / 1e6) ** 2 + ((y - 1e-6) / 1e-6) ** 2;
    default: fail(`selected case ${record.id} has an unsupported objective`);
  }
}

function validateNumericalResult(result, record) {
  if (!Array.isArray(result.value) || result.value.length !== record.expected.length ||
      result.value.some((value) => !Number.isFinite(value))) {
    fail(`case result ${result.id} has the wrong finite dimension`);
  }
  if (record.lower?.some((bound, index) => result.value[index] < bound) ||
      record.upper?.some((bound, index) => result.value[index] > bound)) {
    fail(`case result ${result.id} violates its bounds`);
  }
  if (result.value.some((value, index) =>
    Math.abs(value - record.expected[index]) > record.point_tolerance[index])) {
    fail(`case result ${result.id} misses the independent point envelope`);
  }
  const recomputed = objective(record, result.value);
  const roundoff = 64 * Number.EPSILON * Math.max(1, Math.abs(recomputed));
  if (Math.abs(result.objective - recomputed) > roundoff ||
      recomputed > record.objective_tolerance || result.maximum_violation !== 0) {
    fail(`case result ${result.id} misses the independent objective envelope`);
  }
  if (result.backend_status !== 4 || result.backend_converged !== true ||
      !Number.isSafeInteger(result.evaluations) || result.evaluations <= 0 ||
      result.evaluations > 4000 ||
      !Number.isSafeInteger(result.callbacks) || result.callbacks !== result.evaluations) {
    fail(`case result ${result.id} has an invalid NM termination contract`);
  }
}

function validateCaseReceipt(receipt, context, expectedPlatform, campaignChallenge) {
  exactKeys(receipt, [
    "schema", ...commonReceiptKeys(), "runtime", "method", "results",
    "results_sha256", "lifecycle_after", "automatic_selection", "origin",
  ], "case receipt");
  if (receipt.schema !== CASE_RECEIPT_SCHEMA || receipt.method !== "nlopt-nelder-mead" ||
      receipt.automatic_selection !== false) fail("case receipt has the wrong method contract");
  validateCommonReceipt(receipt, context, "case receipt");
  validateRuntime(receipt.runtime, "case receipt");
  const platform = context.selection.portable_platforms[expectedPlatform];
  if (platform === undefined || receipt.runtime.os !== platform.os ||
      receipt.runtime.architecture !== platform.architecture) {
    fail(`portable receipt has the wrong platform for ${expectedPlatform}`);
  }
  validateReceiptOrigin(receipt, context, expectedPlatform, campaignChallenge,
    `${expectedPlatform} case receipt`);
  if (!Array.isArray(receipt.results)) fail("case receipt results must be an array");
  const ids = receipt.results.map(({ id }) => id);
  assertUnique(ids, "case receipt result IDs");
  assertExactArray(ids, context.selection.case_ids, "case receipt result IDs");
  for (const result of receipt.results) {
    exactKeys(result, [
      "id", "method", "backend_status", "backend_converged", "value", "objective",
      "maximum_violation", "evaluations", "callbacks", "independently_accepted",
    ], `case result ${result.id}`);
    if (result.method !== "nlopt-nelder-mead" || result.independently_accepted !== true ||
        /cobyla/i.test(canonicalJson(result)) ||
        !Number.isFinite(result.objective) || !Number.isFinite(result.maximum_violation) ||
        !Number.isSafeInteger(result.evaluations) || !Number.isSafeInteger(result.callbacks)) {
      fail(`case result ${result.id} did not independently pass`);
    }
    const record = context.corpus.cases.find(({ id }) => id === result.id);
    if (record === undefined) fail(`case result ${result.id} is not in the bound corpus`);
    validateNumericalResult(result, record);
  }
  if (receipt.results_sha256 !== sha256(Buffer.from(canonicalJson(receipt.results)))) {
    fail("case receipt result digest mismatch");
  }
  exactKeys(receipt.lifecycle_after, [
    "activeContexts", "activeHandle", "liveAllocations", "liveBytes", "memoryBytes",
  ], "case receipt lifecycle");
  if (receipt.lifecycle_after.activeContexts !== 0 ||
      receipt.lifecycle_after.activeHandle !== 0 ||
      receipt.lifecycle_after.liveAllocations !== 0 ||
      receipt.lifecycle_after.liveBytes !== 0 ||
      !Number.isSafeInteger(receipt.lifecycle_after.memoryBytes) ||
      receipt.lifecycle_after.memoryBytes <= 0) {
    fail("case receipt leaked Wasm state");
  }
  return receipt;
}

const REQUIRED_CHECKS = Object.freeze({
  sanitizer: ["address", "undefined", "leak"],
  "destructive-wasm": ["allocation-failure", "corrupt-region", "malformed-artifact", "post-failure-recovery"],
  "browser-lifecycle": ["selected-corpus", "cooperative-cancel", "hard-worker-replacement", "zero-live-allocations"],
  "public-integration": ["explicit-identity", "heuristic-only", "optimality-not-certified", "cobyla-unsupported", "failure-attribution"],
  "resource-corruption": ["browser-corrupt-fail-closed", "npm-corrupt-fail-closed", "npm-missing-fail-closed"],
  relocation: ["npm-pack", "fresh-install", "relocated-execution"],
  sea: ["embedded-artifact-identity", "relocated-execution"],
});

const EVIDENCE_PROGRAMS = Object.freeze({
  sanitizer: [{
    id: "native-sanitizers",
    executable: "node",
    arguments: [
      "scripts/numerical-computing/qualification/run-native-sanitizers.cjs",
      "--output", "<collector-output>",
    ],
    result: "native-sanitizer-json",
  }],
  "destructive-wasm": [{
    id: "wasm-destructive",
    executable: "node",
    arguments: [
      "scripts/numerical-computing/qualification/run-wasm-destructive.cjs",
      "--output", "<collector-output>",
    ],
    result: "wasm-destructive-json",
  }],
  "browser-lifecycle": [{
    id: "browser-selected-corpus",
    executable: "node",
    arguments: ["test/numerical-p3-nlopt/browser.mjs"],
    result: "browser-json",
  }],
  "public-integration": [{
    id: "public-integration",
    executable: "node",
    arguments: [
      "--test", "--test-reporter=tap", "test/numerical-p3-nlopt/public-integration.cjs",
    ],
    result: "node-test-tap",
  }],
  "resource-corruption": [{
    id: "browser-resource-corruption",
    executable: "node",
    arguments: [
      "--test", "--test-reporter=tap", "test/numerical-p3-nlopt/public-browser.mjs",
    ],
    result: "node-test-tap",
  }, {
    id: "npm-resource-corruption",
    executable: "node",
    arguments: [
      "--test", "--test-reporter=tap", "test/numerical-p3-nlopt/public-relocation.cjs",
    ],
    result: "node-test-tap",
  }],
  relocation: [{
    id: "npm-relocation",
    executable: "node",
    arguments: [
      "--test", "--test-reporter=tap", "test/numerical-p3-nlopt/public-relocation.cjs",
    ],
    result: "node-test-tap",
  }],
  sea: [{
    id: "sea-relocation",
    executable: "node",
    arguments: [
      "--test", "--test-reporter=tap", "test/numerical-p3-nlopt/public-sea.cjs",
    ],
    result: "node-test-tap",
  }, {
    id: "sea-resource-probe",
    executable: "sagepython",
    arguments: ["--qualification-resource-digests"],
    result: "sea-resource-json",
  }],
});

function validateRawSanitizer(value, context) {
  if (value.schema !== "sagejs.numerical-native-sanitizer-evidence/v1" ||
      value.status !== "passed" || value.repository?.commit !== context.candidate ||
      value.repository?.clean !== true) fail("raw sanitizer evidence is stale or failed");
  const components = value.components ?? [];
  const componentIds = components.map(({ id }) => id).sort();
  if (components.length !== 2 || canonicalJson(componentIds) !==
      canonicalJson(["cminpack", "nlopt"])) {
    fail("raw sanitizer evidence must contain exactly cminpack and NLopt");
  }
  const nlopt = components.find(({ id }) => id === "nlopt");
  if (nlopt?.status !== "passed" || nlopt.source_closure_sha256 !==
      context.source.source_closure_sha256 || nlopt.artifact?.content_sha256 !==
      context.artifact.sha256 || nlopt.source_files?.some(({ path: name }) => /cobyla/i.test(name))) {
    fail("raw sanitizer evidence is not bound to the NM-only artifact/source closure");
  }
  const runs = nlopt.runs ?? [];
  const names = runs.map(({ sanitizer }) => sanitizer);
  if (runs.length !== 3 || new Set(names).size !== 3 ||
      ["address", "undefined", "leak"].some((name) => !names.includes(name)) ||
      runs.some((run) => run.status !== "passed" || run.execute?.status !== 0 ||
        run.execute?.signal !== null)) fail("raw sanitizer runs are incomplete");
}

function validateRawDestructive(value, context) {
  if (value.schema !== "sagejs.numerical-wasm-destructive-evidence/v1" ||
      value.status !== "passed" || value.repository?.commit !== context.candidate ||
      value.repository?.clean !== true || value.execution?.status !== 0 ||
      value.execution?.signal !== null || value.scope?.source_and_artifact_bound !== true ||
      value.scope?.host_output_independently_validated !== true) {
    fail("raw destructive Wasm evidence is stale or failed");
  }
  if (value.source_closures?.nlopt !== context.source.source_closure_sha256) {
    fail("raw destructive Wasm evidence has the wrong source closure");
  }
  const artifact = (value.artifacts ?? []).find(({ name }) => name === "nlopt-wasm");
  const artifactNames = (value.artifacts ?? []).map(({ name }) => name).sort();
  if (canonicalJson(artifactNames) !== canonicalJson(["cminpack-wasm", "nlopt-wasm"]) ||
      artifact?.content_sha256 !== context.artifact.sha256 ||
      artifact?.bytes !== context.artifact.bytes) {
    fail("raw destructive Wasm evidence has the wrong NLopt artifact");
  }
  const checks = value.checks ?? {};
  const expectedChecks = [
    "allocation-failure", "corrupt-region", "harness-input-artifact-mismatch",
    "post-failure-recovery", "product-malformed-artifact-fail-closed",
    "runner-build-report-artifact-mismatch",
  ];
  if (canonicalJson(Object.keys(checks).sort()) !== canonicalJson(expectedChecks)) {
    fail("raw destructive Wasm evidence has missing or extra checks");
  }
  for (const name of expectedChecks) {
    if (checks[name]?.status !== "passed") fail(`raw destructive check ${name} did not pass`);
  }
}

function combinedProgramStream(programs, field) {
  return programs.map((program) => `${program.id}\n${program[field]}`).join("\n");
}

function validateZeroLifecycle(value, label) {
  exactKeys(value, [
    "activeContexts", "activeHandle", "liveAllocations", "liveBytes", "memoryBytes",
  ], label);
  if (value.activeContexts !== 0 || value.activeHandle !== 0 ||
      value.liveAllocations !== 0 || value.liveBytes !== 0 ||
      !Number.isSafeInteger(value.memoryBytes) || value.memoryBytes <= 0) {
    fail(`${label} is not fully quiescent`);
  }
}

function validateProgramEvidence(program, specification, context, kind) {
  exactKeys(program, [
    "id", "executable", "arguments", "status", "signal", "stdout", "stderr",
    "stdout_sha256", "stderr_sha256", "result",
  ], `${kind} program ${specification.id}`);
  if (program.id !== specification.id || program.executable !== specification.executable) {
    fail(`${kind} executed the wrong program identity`);
  }
  assertExactArray(program.arguments, specification.arguments,
    `${kind} ${program.id} arguments`);
  if (program.status !== 0 || program.signal !== null ||
      typeof program.stdout !== "string" || program.stdout.length === 0 ||
      typeof program.stderr !== "string" ||
      program.stdout_sha256 !== sha256(program.stdout) ||
      program.stderr_sha256 !== sha256(program.stderr)) {
    fail(`${kind} ${program.id} has an empty, failed, or stale command transcript`);
  }
  assertSha(program.stdout_sha256, `${kind} ${program.id} stdout digest`);
  assertSha(program.stderr_sha256, `${kind} ${program.id} stderr digest`);
  if (specification.result === "native-sanitizer-json") {
    validateRawSanitizer(program.result, context);
  } else if (specification.result === "wasm-destructive-json") {
    validateRawDestructive(program.result, context);
  } else if (specification.result === "browser-json") {
    const result = program.result;
    exactKeys(result, [
      "schema", "chromium", "cases", "result_case_ids", "results_sha256",
      "public_semantics_bundle_sha256", "pre_set_shared_atomic_force_stop",
      "hard_worker_replacement", "lifecycle_after",
    ], "browser lifecycle result");
    if (result.schema !== "sagejs.numerical-nlopt-browser/v1" ||
        result.chromium !== context.selection.browser_evidence.version ||
        result.cases !== context.selection.case_ids.length ||
        result.results_sha256 !== context.selection.browser_evidence.results_sha256 ||
        result.public_semantics_bundle_sha256 !== context.publicSemantics.sha256 ||
        result.pre_set_shared_atomic_force_stop !== "pass" ||
        result.hard_worker_replacement !== "pass") {
      fail("browser lifecycle result has the wrong exact identity or result digest");
    }
    assertExactArray(result.result_case_ids, context.selection.case_ids,
      "browser result case IDs");
    validateZeroLifecycle(result.lifecycle_after, "browser lifecycle result");
  } else if (specification.result === "node-test-tap") {
    const result = program.result;
    exactKeys(result, [
      "schema", "tests", "passed", "failed", "cancelled", "skipped", "todo",
      "subtest_names", "stdout_sha256",
    ], `${kind} ${program.id} TAP result`);
    if (result.schema !== "sagejs.node-test-tap-summary/v1" ||
        !Number.isSafeInteger(result.tests) || result.tests <= 0 ||
        result.passed !== result.tests || result.failed !== 0 || result.cancelled !== 0 ||
        result.skipped !== 0 || result.todo !== 0 ||
        result.stdout_sha256 !== program.stdout_sha256 ||
        !Array.isArray(result.subtest_names) ||
        result.subtest_names.length !== result.tests ||
        result.subtest_names.some((name) => typeof name !== "string" || name.length === 0)) {
      fail(`${kind} ${program.id} TAP result is incomplete or failed`);
    }
    assertUnique(result.subtest_names, `${kind} ${program.id} TAP subtests`);
  } else if (specification.result === "sea-resource-json") {
    const result = program.result;
    if (result?.schema !== "sagejs.sea-qualification-resource-digests/v1" ||
        !Array.isArray(result.resources)) fail("SEA resource probe result is invalid");
    const matches = result.resources.filter(
      ({ name }) => name === "numerical/nlopt-methods.wasm",
    );
    if (matches.length !== 1 || matches[0].sha256 !== context.artifact.sha256 ||
        matches[0].bytes !== context.artifact.bytes) {
      fail("SEA resource probe is not bound to the exact qualified artifact");
    }
  } else fail(`${kind} has unsupported result contract ${specification.result}`);
}

function validateEmbeddedEvidence(sourceEvidence, context, kind) {
  exactKeys(sourceEvidence, ["schema", "sha256", "bytes", "payload"],
    `${kind} source evidence`);
  const binding = bindRecord(sourceEvidence.payload);
  if (sourceEvidence.sha256 !== binding.sha256 || sourceEvidence.bytes !== binding.bytes) {
    fail(`${kind} embedded source evidence digest mismatch`);
  }
  if (sourceEvidence.schema !== "sagejs.numerical-nlopt-program-evidence/v1") {
    fail(`${kind} has the wrong structured program-evidence schema`);
  }
  exactKeys(sourceEvidence.payload, ["programs"], `${kind} structured program evidence`);
  const specifications = EVIDENCE_PROGRAMS[kind];
  if (!Array.isArray(sourceEvidence.payload.programs)) fail(`${kind} programs must be an array`);
  assertExactArray(sourceEvidence.payload.programs.map(({ id }) => id),
    specifications.map(({ id }) => id), `${kind} program IDs`);
  sourceEvidence.payload.programs.forEach((program, index) =>
    validateProgramEvidence(program, specifications[index], context, kind));
}

function validateEvidenceReceipt(receipt, context, expectedKind, campaignChallenge) {
  exactKeys(receipt, [
    "schema", ...commonReceiptKeys(), "kind", "status", "platform", "checks",
    "collector", "execution", "source_evidence", "origin",
  ], `${expectedKind} evidence`);
  if (receipt.schema !== EVIDENCE_RECEIPT_SCHEMA || receipt.kind !== expectedKind ||
      receipt.status !== "passed") fail(`${expectedKind} evidence did not pass`);
  validateCommonReceipt(receipt, context, `${expectedKind} evidence`);
  if (!context.selection.evidence_kinds.includes(expectedKind)) {
    fail(`unexpected evidence kind ${expectedKind}`);
  }
  exactKeys(receipt.platform, ["id", "os", "architecture"], `${expectedKind} platform`);
  if (receipt.platform.id !== "linux-x64" || receipt.platform.os !== "linux" ||
      receipt.platform.architecture !== "x64") fail(`${expectedKind} evidence must be linux-x64`);
  validateReceiptOrigin(receipt, context, "linux-x64", campaignChallenge,
    `${expectedKind} evidence`);
  assertExactArray(receipt.checks, REQUIRED_CHECKS[expectedKind], `${expectedKind} checks`);
  exactKeys(receipt.collector, ["path", "sha256"], `${expectedKind} collector`);
  if (typeof receipt.collector.path !== "string" || !receipt.collector.path.startsWith(
    "src/lib/sagejs/numerics/optimization/backends/nlopt/qualification/")) {
    fail(`${expectedKind} evidence has an untrusted collector path`);
  }
  assertSha(receipt.collector.sha256, `${expectedKind} collector digest`);
  if (context.manifest.qualification_tooling_files?.[receipt.collector.path] !==
      receipt.collector.sha256) {
    fail(`${expectedKind} evidence collector is not source-current qualification tooling`);
  }
  validateEmbeddedEvidence(receipt.source_evidence, context, expectedKind);
  exactKeys(receipt.execution, ["status", "signal", "stdout_sha256", "stderr_sha256"],
    `${expectedKind} execution`);
  if (receipt.execution.status !== 0 || receipt.execution.signal !== null) {
    fail(`${expectedKind} command did not exit successfully`);
  }
  assertSha(receipt.execution.stdout_sha256, `${expectedKind} stdout digest`);
  assertSha(receipt.execution.stderr_sha256, `${expectedKind} stderr digest`);
  const programs = receipt.source_evidence.payload.programs;
  if (receipt.execution.stdout_sha256 !== sha256(combinedProgramStream(programs, "stdout")) ||
      receipt.execution.stderr_sha256 !== sha256(combinedProgramStream(programs, "stderr"))) {
    fail(`${expectedKind} execution transcript digest mismatch`);
  }
  return receipt;
}

function bindRecord(record) {
  const bytes = Buffer.from(formattedJson(record));
  return { sha256: sha256(bytes), bytes: bytes.length };
}

function requireCanonicalRecord(record, label) {
  const binding = bindRecord(record.value);
  if (record.sha256 !== binding.sha256 || record.size !== binding.bytes) {
    fail(`${label} must use deterministic formatted JSON`);
  }
}

function buildQualification({
  context, campaignChallenge, caseReceiptRecord, evidenceRecords, portableRecords,
}) {
  assertChallenge(campaignChallenge);
  if (validateManifestQualificationState(context.manifest) !== "pending") {
    fail("promotion requires exactly the documented pending source-current state");
  }
  requireCanonicalRecord(caseReceiptRecord, "case receipt");
  validateCaseReceipt(caseReceiptRecord.value, context, "linux-x64", campaignChallenge);
  const evidenceByKind = new Map();
  for (const record of evidenceRecords) {
    requireCanonicalRecord(record, "evidence receipt");
    const kind = record.value?.kind;
    if (evidenceByKind.has(kind)) fail(`duplicate evidence kind ${kind}`);
    if (!context.selection.evidence_kinds.includes(kind)) fail(`extra evidence kind ${kind}`);
    validateEvidenceReceipt(record.value, context, kind, campaignChallenge);
    evidenceByKind.set(kind, record);
  }
  assertExactArray([...evidenceByKind.keys()].sort(),
    [...context.selection.evidence_kinds].sort(), "evidence kinds");
  const portableByPlatform = new Map();
  for (const record of portableRecords) {
    requireCanonicalRecord(record, "portable receipt");
    const runtime = record.value?.runtime;
    const found = Object.entries(context.selection.portable_platforms).find(
      ([, platform]) => platform.os === runtime?.os && platform.architecture === runtime?.architecture,
    );
    if (found === undefined) fail("extra portable platform evidence");
    const [platformId] = found;
    if (portableByPlatform.has(platformId)) fail(`duplicate portable platform ${platformId}`);
    validateCaseReceipt(record.value, context, platformId, campaignChallenge);
    portableByPlatform.set(platformId, record);
  }
  assertExactArray([...portableByPlatform.keys()].sort(),
    Object.keys(context.selection.portable_platforms).sort(), "portable platforms");

  const evidence = Object.fromEntries(context.selection.evidence_kinds.map((kind) => {
    const record = evidenceByKind.get(kind);
    return [kind, { sha256: record.sha256, bytes: record.size, receipt: record.value }];
  }));
  const portable = Object.fromEntries(Object.keys(context.selection.portable_platforms).map((id) => {
    const record = portableByPlatform.get(id);
    return [id, {
      sha256: record.sha256,
      bytes: record.size,
      node: record.value.runtime.node,
      receipt: record.value,
    }];
  }));
  const summary = {
    schema: QUALIFICATION_SCHEMA,
    status: "qualified",
    candidate_commit: context.candidate,
    method: "nlopt-nelder-mead",
    upstream_identity: "NLOPT_LN_NELDERMEAD",
    automatic_selection: false,
    optimality_claim: "heuristic-only; neither local nor global optimality is certified",
    campaign_challenge: campaignChallenge,
    artifact: { ...context.artifact },
    source: { ...context.source },
    public_semantics_bundle: { ...context.publicSemantics },
    qualification_tooling_bundle: { ...context.tooling },
    selection: { ...context.selectionBinding, case_ids: [...context.selection.case_ids] },
    corpus: { ...context.corpusBinding },
    oracle: {
      ...context.oracleBinding,
      oracle_source_sha256: context.oracleSourceSha256,
      selected_results_sha256: context.oracle.selected_results_sha256,
    },
    case_execution: {
      sha256: caseReceiptRecord.sha256,
      bytes: caseReceiptRecord.size,
      receipt: caseReceiptRecord.value,
    },
    evidence,
    portable_receipts: portable,
    historical_exclusions: context.selection.historical_exclusions,
  };
  const summaryBinding = bindRecord(summary);
  const manifest = JSON.parse(JSON.stringify(context.manifest));
  manifest.qualification = {
    status: "qualified",
    candidate_commit: context.candidate,
    summary_sha256: summaryBinding.sha256,
    summary_bytes: summaryBinding.bytes,
    public_semantics_bundle_sha256: context.publicSemantics.sha256,
    qualification_tooling_bundle_sha256: context.tooling.sha256,
    selection_sha256: context.selectionBinding.sha256,
    corpus_sha256: context.corpusBinding.sha256,
    oracle_sha256: context.oracleBinding.sha256,
    source_closure_sha256: context.source.source_closure_sha256,
    artifact_sha256: context.artifact.sha256,
    artifact_bytes: context.artifact.bytes,
    case_execution_sha256: caseReceiptRecord.sha256,
    campaign_challenge: campaignChallenge,
    evidence_receipts_sha256: Object.fromEntries(Object.entries(evidence).map(
      ([kind, binding]) => [kind, binding.sha256],
    )),
    portable_receipts_sha256: Object.fromEntries(Object.entries(portable).map(
      ([id, binding]) => [id, binding.sha256],
    )),
    historical_cobyla_status: "excluded-not-qualified",
  };
  return { summary, manifest, summaryBinding };
}

function validateQualificationSummary(summaryRecord, context, manifest = context.manifest) {
  requireCanonicalRecord(summaryRecord, "qualification summary");
  const summary = summaryRecord.value;
  exactKeys(summary, [
    "schema", "status", "candidate_commit", "method", "upstream_identity",
    "automatic_selection", "optimality_claim", "campaign_challenge", "artifact", "source",
    "public_semantics_bundle", "qualification_tooling_bundle", "selection", "corpus",
    "oracle", "case_execution", "evidence", "portable_receipts", "historical_exclusions",
  ], "qualification summary");
  if (summary.schema !== QUALIFICATION_SCHEMA || summary.status !== "qualified" ||
      summary.candidate_commit !== context.candidate || summary.method !== "nlopt-nelder-mead" ||
      summary.upstream_identity !== "NLOPT_LN_NELDERMEAD" ||
      summary.automatic_selection !== false || !/neither local nor global/i.test(
        summary.optimality_claim)) fail("qualification summary has the wrong method or claim");
  assertChallenge(summary.campaign_challenge);
  const equal = (actual, expected, label) => {
    if (canonicalJson(actual) !== canonicalJson(expected)) fail(`${label} mismatch`);
  };
  equal(summary.artifact, context.artifact, "qualification artifact");
  equal(summary.source, context.source, "qualification source");
  equal(summary.public_semantics_bundle, context.publicSemantics,
    "qualification public semantics bundle");
  equal(summary.qualification_tooling_bundle, context.tooling,
    "qualification tooling bundle");
  equal(summary.selection, {
    ...context.selectionBinding, case_ids: context.selection.case_ids,
  }, "qualification selection");
  equal(summary.corpus, context.corpusBinding, "qualification corpus");
  equal(summary.oracle, {
    ...context.oracleBinding,
    oracle_source_sha256: context.oracleSourceSha256,
    selected_results_sha256: context.oracle.selected_results_sha256,
  }, "qualification oracle");
  exactKeys(summary.case_execution, ["sha256", "bytes", "receipt"], "case execution binding");
  assertSha(summary.case_execution.sha256, "case execution digest");
  if (!Number.isSafeInteger(summary.case_execution.bytes) || summary.case_execution.bytes <= 0) {
    fail("case execution binding has invalid bytes");
  }
  equal(bindRecord(summary.case_execution.receipt), {
    sha256: summary.case_execution.sha256, bytes: summary.case_execution.bytes,
  }, "case execution durable binding");
  validateCaseReceipt(summary.case_execution.receipt, context, "linux-x64",
    summary.campaign_challenge);
  exactKeys(summary.evidence, context.selection.evidence_kinds, "qualification evidence");
  for (const [kind, binding] of Object.entries(summary.evidence)) {
    exactKeys(binding, ["sha256", "bytes", "receipt"], `${kind} evidence binding`);
    assertSha(binding.sha256, `${kind} evidence digest`);
    if (!Number.isSafeInteger(binding.bytes) || binding.bytes <= 0) fail(`${kind} evidence bytes invalid`);
    equal(bindRecord(binding.receipt), { sha256: binding.sha256, bytes: binding.bytes },
      `${kind} durable evidence binding`);
    validateEvidenceReceipt(binding.receipt, context, kind, summary.campaign_challenge);
  }
  exactKeys(summary.portable_receipts, Object.keys(context.selection.portable_platforms),
    "portable qualification receipts");
  for (const [platform, binding] of Object.entries(summary.portable_receipts)) {
    exactKeys(binding, ["sha256", "bytes", "node", "receipt"], `${platform} portable binding`);
    assertSha(binding.sha256, `${platform} portable digest`);
    if (!Number.isSafeInteger(binding.bytes) || binding.bytes <= 0 ||
        typeof binding.node !== "string" || !binding.node.startsWith("v")) {
      fail(`${platform} portable binding invalid`);
    }
    equal(bindRecord(binding.receipt), { sha256: binding.sha256, bytes: binding.bytes },
      `${platform} durable portable binding`);
    validateCaseReceipt(binding.receipt, context, platform, summary.campaign_challenge);
  }
  equal(summary.historical_exclusions, context.selection.historical_exclusions,
    "historical exclusions");
  if (validateManifestQualificationState(manifest) !== "qualified") {
    fail("production manifest is not in the exact qualified state");
  }
  const qualification = manifest.qualification;
  if (qualification?.status !== "qualified" ||
      qualification.candidate_commit !== context.candidate ||
      qualification.summary_sha256 !== summaryRecord.sha256 ||
      qualification.summary_bytes !== summaryRecord.size ||
      qualification.public_semantics_bundle_sha256 !== context.publicSemantics.sha256 ||
      qualification.qualification_tooling_bundle_sha256 !== context.tooling.sha256 ||
      qualification.selection_sha256 !== context.selectionBinding.sha256 ||
      qualification.corpus_sha256 !== context.corpusBinding.sha256 ||
      qualification.oracle_sha256 !== context.oracleBinding.sha256 ||
      qualification.source_closure_sha256 !== context.source.source_closure_sha256 ||
      qualification.artifact_sha256 !== context.artifact.sha256 ||
      qualification.artifact_bytes !== context.artifact.bytes ||
      qualification.case_execution_sha256 !== summary.case_execution.sha256 ||
      qualification.campaign_challenge !== summary.campaign_challenge ||
      qualification.historical_cobyla_status !== "excluded-not-qualified") {
    fail("production manifest qualification binding mismatch");
  }
  equal(qualification.evidence_receipts_sha256,
    Object.fromEntries(Object.entries(summary.evidence).map(([kind, value]) => [kind, value.sha256])),
    "manifest evidence bindings");
  equal(qualification.portable_receipts_sha256,
    Object.fromEntries(Object.entries(summary.portable_receipts).map(
      ([platform, value]) => [platform, value.sha256])), "manifest portable bindings");
  return summary;
}

function atomicWriteFile(filename, bytes) {
  const directory = path.dirname(filename);
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink()) {
    fail(`refusing to replace symbolic-link output ${filename}`);
  }
  const temporary = path.join(directory,
    `.${path.basename(filename)}.${process.pid}.${crypto.randomBytes(12).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filename);
    if (process.platform !== "win32") {
      const directoryDescriptor = fs.openSync(directory, "r");
      try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function preflightOutput(filename) {
  const directory = path.dirname(filename);
  const resolvedDirectory = fs.realpathSync(directory);
  if (resolvedDirectory !== path.resolve(directory)) {
    fail(`refusing non-canonical output directory ${directory}`);
  }
  if (fs.existsSync(filename)) {
    const status = fs.lstatSync(filename);
    if (!status.isFile() || status.isSymbolicLink()) {
      fail(`refusing non-regular output ${filename}`);
    }
  }
}

function writePromotion({ summaryPath, manifestPath, summary, manifest }) {
  summaryPath = path.resolve(summaryPath);
  manifestPath = path.resolve(manifestPath);
  if (summaryPath === manifestPath) fail("summary and manifest outputs must be different files");
  preflightOutput(summaryPath);
  preflightOutput(manifestPath);
  const summaryBytes = Buffer.from(formattedJson(summary));
  const qualifiedBytes = Buffer.from(formattedJson(manifest));
  if (sha256(summaryBytes) !== manifest.qualification.summary_sha256 ||
      summaryBytes.length !== manifest.qualification.summary_bytes) {
    fail("internal summary binding mismatch");
  }
  const pending = JSON.parse(JSON.stringify(manifest));
  pending.qualification = {
    status: "promotion_in_progress",
    candidate_commit: manifest.qualification.candidate_commit,
    reason: "Fail-closed transaction marker; a qualified manifest is written only after the summary.",
  };
  atomicWriteFile(manifestPath, Buffer.from(formattedJson(pending)));
  atomicWriteFile(summaryPath, summaryBytes);
  atomicWriteFile(manifestPath, qualifiedBytes);
}

module.exports = {
  CASE_RECEIPT_SCHEMA,
  EVIDENCE_PROGRAMS,
  EVIDENCE_RECEIPT_SCHEMA,
  MANIFEST_SCHEMA,
  QUALIFICATION_SCHEMA,
  REQUIRED_CHECKS,
  assertCommit,
  attachReceiptOrigin,
  atomicWriteFile,
  bindRecord,
  buildQualification,
  canonicalJson,
  formattedJson,
  loadCurrentContext,
  parseJsonText,
  portableBuildReportBinding,
  readJson,
  sha256,
  validateCaseReceipt,
  validateEvidenceReceipt,
  validateManifestQualificationState,
  validateReceiptOrigin,
  validateRawDestructive,
  validateRawSanitizer,
  validateQualificationSummary,
  validateSelection,
  writePromotion,
};
