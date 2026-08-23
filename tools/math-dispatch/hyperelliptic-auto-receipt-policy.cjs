"use strict";

/*
 * This module is deliberately independent of the mathematical selectors.  A
 * future `algorithm="auto"` dispatcher may query only an object returned by
 * `verifyPolicy`; explicit native development paths do not use this policy.
 * The checked-in manifest is disabled until exact post-freeze receipts exist.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const POLICY_SCHEMA = "sagejs.hyperelliptic-auto-receipt-policy/v1";
const RECEIPT_SCHEMA = "sagejs.hyperelliptic-auto-receipt/v1";
const SOURCE_BUNDLE_ALGORITHM = "sagejs.source-bundle-sha256/v1";
const PLATFORMS = Object.freeze([
  "linux-x64",
  "linux-arm64",
  "darwin-arm64",
  "win32-x64",
]);
const REQUIRED_FAILURES = Object.freeze([
  "missing-artifact",
  "cancellation",
  "memory-exhaustion",
  "worker-loss",
  "cache-corruption",
]);
const REQUIRED_SANITIZERS = Object.freeze(["address", "undefined", "leak"]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const VERIFIED_POLICIES = new WeakSet();
const EXECUTION_TARGETS = Object.freeze(["dynamic", "native", "wasm", "standalone"]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, required, optional, label) {
  if (!plainObject(value)) throw new Error(`${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing ${key}`);
  }
  return value;
}

function checkedString(value, label, pattern = null) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  if (pattern !== null && !pattern.test(value)) {
    throw new Error(`${label} has an invalid value`);
  }
  return value;
}

function checkedBoolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function checkedInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer at least ${minimum}`);
  }
  return value;
}

function checkedUniqueArray(value, label, check, { nonempty = true } = {}) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    throw new Error(`${label} must be ${nonempty ? "a nonempty" : "an"} array`);
  }
  const result = value.map((item, index) => check(item, `${label}[${index}]`));
  if (new Set(result.map((item) => JSON.stringify(item))).size !== result.length) {
    throw new Error(`${label} contains duplicates`);
  }
  return result;
}

function checkedIdentifier(value, label) {
  return checkedString(value, label, IDENTIFIER_PATTERN);
}

function checkedPlatform(value, label) {
  checkedString(value, label);
  if (!PLATFORMS.includes(value)) throw new Error(`${label} is unsupported`);
  return value;
}

function checkedSafePath(value, label) {
  checkedString(value, label);
  if (
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value === "." ||
    value.split("/").some((component) => component === "" || component === "..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return value;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sameSet(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === left.length &&
    rightSet.size === right.length &&
    leftSet.size === rightSet.size &&
    [...leftSet].every((item) => rightSet.has(item))
  );
}

function checkedSourcePaths(value, label) {
  const paths = checkedUniqueArray(value, label, checkedSafePath);
  const sorted = [...paths].sort();
  if (!sameArray(paths, sorted)) throw new Error(`${label} must be sorted`);
  return paths;
}

function validateSourceBundleContract(value, label = "source bundle contract") {
  exactKeys(value, ["algorithm", "paths"], [], label);
  if (value.algorithm !== SOURCE_BUNDLE_ALGORITHM) {
    throw new Error(`${label} uses an unsupported algorithm`);
  }
  return {
    algorithm: value.algorithm,
    paths: checkedSourcePaths(value.paths, `${label} paths`),
  };
}

function validateSourceBundle(value, label = "source bundle") {
  exactKeys(value, ["algorithm", "paths", "sha256", "source_commit"], [], label);
  const contract = validateSourceBundleContract(
    { algorithm: value.algorithm, paths: value.paths },
    label,
  );
  return {
    ...contract,
    sha256: checkedString(value.sha256, `${label} sha256`, SHA256_PATTERN),
    source_commit: checkedString(
      value.source_commit,
      `${label} source_commit`,
      COMMIT_PATTERN,
    ),
  };
}

function validateDomainConstraints(value, label) {
  exactKeys(value, ["genus", "field_kind", "model_kind", "h_kind"], [], label);
  return {
    genus: checkedUniqueArray(value.genus, `${label} genus`, (item, itemLabel) =>
      checkedInteger(item, itemLabel, 1)),
    field_kind: checkedUniqueArray(
      value.field_kind,
      `${label} field_kind`,
      checkedIdentifier,
    ),
    model_kind: checkedUniqueArray(
      value.model_kind,
      `${label} model_kind`,
      checkedIdentifier,
    ),
    h_kind: checkedUniqueArray(value.h_kind, `${label} h_kind`, (item, itemLabel) => {
      if (!['zero', 'nonzero'].includes(item)) {
        throw new Error(`${itemLabel} must be zero or nonzero`);
      }
      return item;
    }),
  };
}

function validateModel(value, label) {
  if (!plainObject(value)) throw new Error(`${label} must be an object`);
  if (value.kind === "exact-fingerprint") {
    exactKeys(value, ["kind", "fingerprints"], [], label);
    return {
      kind: value.kind,
      fingerprints: checkedUniqueArray(
        value.fingerprints,
        `${label} fingerprints`,
        (item, itemLabel) => checkedString(item, itemLabel, SHA256_PATTERN),
      ),
    };
  }
  if (value.kind === "domain-envelope") {
    exactKeys(value, ["kind", "domain_id", "constraints"], [], label);
    return {
      kind: value.kind,
      domain_id: checkedIdentifier(value.domain_id, `${label} domain_id`),
      constraints: validateDomainConstraints(value.constraints, `${label} constraints`),
    };
  }
  throw new Error(`${label} has an unsupported kind`);
}

const ENVELOPE_FIELDS = Object.freeze([
  "prime_min",
  "prime_max",
  "interval_start_min",
  "interval_stop_max",
  "interval_span_max",
  "batch_items_min",
  "batch_items_max",
  "scalar_bits_max",
  "resource_bytes_max",
]);

function validateEnvelope(value, label) {
  exactKeys(value, ENVELOPE_FIELDS, [], label);
  const answer = {};
  for (const field of ENVELOPE_FIELDS) {
    answer[field] = checkedInteger(
      value[field],
      `${label} ${field}`,
      field === "interval_span_max" ? 1 : 0,
    );
  }
  if (answer.prime_min > answer.prime_max) {
    throw new Error(`${label} has prime_min greater than prime_max`);
  }
  if (answer.interval_start_min > answer.interval_stop_max) {
    throw new Error(`${label} has interval_start_min greater than interval_stop_max`);
  }
  if (answer.batch_items_min > answer.batch_items_max) {
    throw new Error(`${label} has batch_items_min greater than batch_items_max`);
  }
  return answer;
}

function validateCorpus(value, label) {
  exactKeys(value, ["id", "path", "sha256"], [], label);
  return {
    id: checkedIdentifier(value.id, `${label} id`),
    path: checkedSafePath(value.path, `${label} path`),
    sha256: checkedString(value.sha256, `${label} sha256`, SHA256_PATTERN),
  };
}

function validateFileIdentity(value, label) {
  exactKeys(value, ["path", "sha256"], [], label);
  return {
    path: checkedSafePath(value.path, `${label} path`),
    sha256: checkedString(value.sha256, `${label} sha256`, SHA256_PATTERN),
  };
}

function validateEvidenceRequirements(value, entryPlatforms, enabled, label) {
  exactKeys(value, ["failures", "sanitizers"], [], label);
  const validateList = (items, itemLabel, allowed, required) => {
    const result = checkedUniqueArray(
      items,
      itemLabel,
      (item, requirementLabel) => {
        exactKeys(item, ["id", "platforms"], [], requirementLabel);
        const id = checkedIdentifier(item.id, `${requirementLabel} id`);
        if (!allowed.includes(id)) throw new Error(`${requirementLabel} has unknown id ${id}`);
        const platforms = checkedUniqueArray(
          item.platforms,
          `${requirementLabel} platforms`,
          checkedPlatform,
        );
        if (!platforms.every((platform) => entryPlatforms.includes(platform))) {
          throw new Error(`${requirementLabel} names a platform outside its entry`);
        }
        return { id, platforms };
      },
      { nonempty: enabled },
    );
    const ids = result.map((item) => item.id);
    if (enabled && !sameSet(ids, required)) {
      throw new Error(`${itemLabel} must require exactly ${required.join(", ")}`);
    }
    return result;
  };
  return {
    failures: validateList(
      value.failures,
      `${label} failures`,
      REQUIRED_FAILURES,
      REQUIRED_FAILURES,
    ),
    sanitizers: validateList(
      value.sanitizers,
      `${label} sanitizers`,
      REQUIRED_SANITIZERS,
      REQUIRED_SANITIZERS,
    ),
  };
}

function validateReceiptReferences(value, label) {
  return checkedUniqueArray(
    value,
    label,
    (item, itemLabel) => {
      exactKeys(item, ["platform", "path", "sha256"], [], itemLabel);
      return {
        platform: checkedPlatform(item.platform, `${itemLabel} platform`),
        path: checkedSafePath(item.path, `${itemLabel} path`),
        sha256: checkedString(item.sha256, `${itemLabel} sha256`, SHA256_PATTERN),
      };
    },
    { nonempty: false },
  );
}

function validateEntry(value, manifest, label) {
  exactKeys(
    value,
    [
      "id",
      "enabled",
      "backend",
      "operation",
      "platforms",
      "source_bundle_sha256",
      "corpus",
      "harness",
      "required_targets",
      "exact_result_sha256",
      "model",
      "envelope",
      "required_evidence",
      "receipts",
    ],
    [],
    label,
  );
  const enabled = checkedBoolean(value.enabled, `${label} enabled`);
  const platforms = checkedUniqueArray(
    value.platforms,
    `${label} platforms`,
    checkedPlatform,
  );
  if (enabled && !sameSet(platforms, manifest.required_platforms)) {
    throw new Error(`${label} does not cover every required platform`);
  }
  const entry = {
    id: checkedIdentifier(value.id, `${label} id`),
    enabled,
    backend: checkedIdentifier(value.backend, `${label} backend`),
    operation: checkedIdentifier(value.operation, `${label} operation`),
    platforms,
    source_bundle_sha256: checkedString(
      value.source_bundle_sha256,
      `${label} source_bundle_sha256`,
      SHA256_PATTERN,
    ),
    corpus: validateCorpus(value.corpus, `${label} corpus`),
    harness: validateFileIdentity(value.harness, `${label} harness`),
    required_targets: checkedUniqueArray(
      value.required_targets,
      `${label} required_targets`,
      (target, targetLabel) => {
        if (!EXECUTION_TARGETS.includes(target)) {
          throw new Error(`${targetLabel} is unsupported`);
        }
        return target;
      },
    ),
    exact_result_sha256: checkedString(
      value.exact_result_sha256,
      `${label} exact_result_sha256`,
      SHA256_PATTERN,
    ),
    model: validateModel(value.model, `${label} model`),
    envelope: validateEnvelope(value.envelope, `${label} envelope`),
    required_evidence: null,
    receipts: validateReceiptReferences(value.receipts, `${label} receipts`),
  };
  entry.required_evidence = validateEvidenceRequirements(
    value.required_evidence,
    platforms,
    enabled,
    `${label} required_evidence`,
  );
  if (enabled) {
    const receiptPlatforms = entry.receipts.map((receipt) => receipt.platform);
    if (!sameSet(receiptPlatforms, platforms)) {
      throw new Error(`${label} receipt platforms do not match its platform envelope`);
    }
  }
  return entry;
}

function validatePolicyDocument(value) {
  exactKeys(
    value,
    [
      "schema",
      "enabled",
      "required_platforms",
      "source_bundle_contract",
      "source_bundle",
      "entries",
    ],
    ["$schema"],
    "policy",
  );
  if (value.schema !== POLICY_SCHEMA) throw new Error("unsupported policy schema");
  if (value.$schema !== undefined) checkedString(value.$schema, "policy $schema");
  const enabled = checkedBoolean(value.enabled, "policy enabled");
  const requiredPlatforms = checkedUniqueArray(
    value.required_platforms,
    "policy required_platforms",
    checkedPlatform,
  );
  if (!sameSet(requiredPlatforms, PLATFORMS)) {
    throw new Error("policy required_platforms must name every Phase-10 platform");
  }
  const contract = validateSourceBundleContract(value.source_bundle_contract);
  const bundle = value.source_bundle === null ? null : validateSourceBundle(value.source_bundle);
  if (enabled && bundle === null) throw new Error("enabled policy has no source bundle");
  if (bundle !== null && !sameArray(bundle.paths, contract.paths)) {
    throw new Error("source bundle paths do not match the source bundle contract");
  }
  if (!Array.isArray(value.entries)) throw new Error("policy entries must be an array");
  const context = { required_platforms: requiredPlatforms };
  const entries = value.entries.map((entry, index) =>
    validateEntry(entry, context, `policy entry ${index}`));
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error("policy entry IDs are not unique");
  if (bundle !== null) {
    for (const entry of entries) {
      if (entry.source_bundle_sha256 !== bundle.sha256) {
        throw new Error(`policy entry ${entry.id} has a mismatched source bundle`);
      }
    }
  }
  return {
    schema: value.schema,
    enabled,
    required_platforms: requiredPlatforms,
    source_bundle_contract: contract,
    source_bundle: bundle,
    entries,
  };
}

function lengthPrefix(bytes) {
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64BE(BigInt(bytes.length));
  return prefix;
}

function checkedFile(root, relativePath, label) {
  const rootReal = fs.realpathSync(root);
  const components = relativePath.split("/");
  let cursor = rootReal;
  for (const component of components) {
    cursor = path.join(cursor, component);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link`);
  }
  const real = fs.realpathSync(cursor);
  const prefix = `${rootReal}${path.sep}`;
  if (!real.startsWith(prefix) || !fs.statSync(real).isFile()) {
    throw new Error(`${label} is not a regular file inside the repository`);
  }
  return real;
}

function generateSourceBundle(root, sourcePaths) {
  const paths = checkedSourcePaths(sourcePaths, "source bundle paths");
  const digest = crypto.createHash("sha256");
  const header = Buffer.from(`${SOURCE_BUNDLE_ALGORITHM}\0`, "utf8");
  digest.update(lengthPrefix(header));
  digest.update(header);
  for (const relativePath of paths) {
    const pathBytes = Buffer.from(relativePath, "utf8");
    const bytes = fs.readFileSync(checkedFile(root, relativePath, `source ${relativePath}`));
    digest.update(lengthPrefix(pathBytes));
    digest.update(pathBytes);
    digest.update(lengthPrefix(bytes));
    digest.update(bytes);
  }
  return {
    algorithm: SOURCE_BUNDLE_ALGORITHM,
    paths,
    sha256: digest.digest("hex"),
  };
}

function modelWithin(policy, evidence) {
  if (policy.kind !== evidence.kind) return false;
  if (policy.kind === "exact-fingerprint") {
    return policy.fingerprints.every((fingerprint) =>
      evidence.fingerprints.includes(fingerprint));
  }
  if (policy.domain_id !== evidence.domain_id) return false;
  return Object.keys(policy.constraints).every((name) =>
    policy.constraints[name].every((item) => evidence.constraints[name].includes(item)));
}

function envelopeWithin(policy, evidence) {
  return (
    policy.prime_min >= evidence.prime_min &&
    policy.prime_max <= evidence.prime_max &&
    policy.interval_start_min >= evidence.interval_start_min &&
    policy.interval_stop_max <= evidence.interval_stop_max &&
    policy.interval_span_max <= evidence.interval_span_max &&
    policy.batch_items_min >= evidence.batch_items_min &&
    policy.batch_items_max <= evidence.batch_items_max &&
    policy.scalar_bits_max <= evidence.scalar_bits_max &&
    policy.resource_bytes_max <= evidence.resource_bytes_max
  );
}

function validateEvidenceResult(value, label) {
  exactKeys(value, ["status", "artifact_sha256"], [], label);
  if (value.status !== "passed") throw new Error(`${label} did not pass`);
  return {
    status: value.status,
    artifact_sha256: checkedString(
      value.artifact_sha256,
      `${label} artifact_sha256`,
      SHA256_PATTERN,
    ),
  };
}

function validateEvidenceMap(value, label) {
  if (!plainObject(value)) throw new Error(`${label} must be an object`);
  return Object.fromEntries(
    Object.entries(value).map(([id, result]) => [
      checkedIdentifier(id, `${label} id`),
      validateEvidenceResult(result, `${label} ${id}`),
    ]),
  );
}

function validateReceiptDocument(value, label) {
  exactKeys(
    value,
    [
      "schema",
      "platform",
      "source_bundle",
      "corpus",
      "backend",
      "operation",
      "model_evidence",
      "envelope_evidence",
      "exact",
      "evidence",
    ],
    [],
    label,
  );
  if (value.schema !== RECEIPT_SCHEMA) throw new Error(`${label} has unsupported schema`);
  exactKeys(value.exact, ["harness_sha256", "targets"], [], `${label} exact`);
  if (!plainObject(value.exact.targets) || Object.keys(value.exact.targets).length === 0) {
    throw new Error(`${label} exact targets must be a nonempty object`);
  }
  const targets = {};
  for (const [target, result] of Object.entries(value.exact.targets)) {
    if (!EXECUTION_TARGETS.includes(target)) {
      throw new Error(`${label} exact targets has unsupported target ${target}`);
    }
    exactKeys(result, ["result_sha256"], [], `${label} exact target ${target}`);
    targets[target] = {
      result_sha256: checkedString(
        result.result_sha256,
        `${label} exact target ${target} result_sha256`,
        SHA256_PATTERN,
      ),
    };
  }
  exactKeys(value.evidence, ["failures", "sanitizers"], [], `${label} evidence`);
  return {
    schema: value.schema,
    platform: checkedPlatform(value.platform, `${label} platform`),
    source_bundle: validateSourceBundle(value.source_bundle, `${label} source_bundle`),
    corpus: validateCorpus(value.corpus, `${label} corpus`),
    backend: checkedIdentifier(value.backend, `${label} backend`),
    operation: checkedIdentifier(value.operation, `${label} operation`),
    model_evidence: validateModel(value.model_evidence, `${label} model_evidence`),
    envelope_evidence: validateEnvelope(
      value.envelope_evidence,
      `${label} envelope_evidence`,
    ),
    exact: {
      harness_sha256: checkedString(
        value.exact.harness_sha256,
        `${label} harness_sha256`,
        SHA256_PATTERN,
      ),
      targets,
    },
    evidence: {
      failures: validateEvidenceMap(value.evidence.failures, `${label} failures`),
      sanitizers: validateEvidenceMap(value.evidence.sanitizers, `${label} sanitizers`),
    },
  };
}

function verifyReceipt(entry, reference, root, bundle) {
  const filename = checkedFile(root, reference.path, `receipt ${reference.path}`);
  const bytes = fs.readFileSync(filename);
  if (sha256(bytes) !== reference.sha256) {
    throw new Error(`receipt ${reference.path} hash does not match policy`);
  }
  let raw;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`receipt ${reference.path} is not valid JSON`, { cause: error });
  }
  const receipt = validateReceiptDocument(raw, `receipt ${reference.path}`);
  if (receipt.platform !== reference.platform) {
    throw new Error(`receipt ${reference.path} has a mismatched platform`);
  }
  if (
    receipt.backend !== entry.backend ||
    receipt.operation !== entry.operation ||
    receipt.corpus.id !== entry.corpus.id ||
    receipt.corpus.path !== entry.corpus.path ||
    receipt.corpus.sha256 !== entry.corpus.sha256 ||
    receipt.exact.harness_sha256 !== entry.harness.sha256
  ) {
    throw new Error(`receipt ${reference.path} does not match its policy workload`);
  }
  if (
    receipt.source_bundle.algorithm !== bundle.algorithm ||
    receipt.source_bundle.source_commit !== bundle.source_commit ||
    receipt.source_bundle.sha256 !== bundle.sha256 ||
    !sameArray(receipt.source_bundle.paths, bundle.paths)
  ) {
    throw new Error(`receipt ${reference.path} has a mismatched source bundle`);
  }
  if (!modelWithin(entry.model, receipt.model_evidence)) {
    throw new Error(`policy entry ${entry.id} has a broader model envelope than its receipt`);
  }
  if (!envelopeWithin(entry.envelope, receipt.envelope_evidence)) {
    throw new Error(`policy entry ${entry.id} has a broader workload envelope than its receipt`);
  }
  for (const target of entry.required_targets) {
    if (receipt.exact.targets[target] === undefined) {
      throw new Error(`receipt ${reference.path} lacks required exact target ${target}`);
    }
    if (receipt.exact.targets[target].result_sha256 !== entry.exact_result_sha256) {
      throw new Error(`receipt ${reference.path} has a mismatched exact ${target} digest`);
    }
  }
  for (const [kind, requirements] of Object.entries(entry.required_evidence)) {
    for (const requirement of requirements) {
      if (requirement.platforms.includes(reference.platform)) {
        const observed = receipt.evidence[kind][requirement.id];
        if (observed === undefined) {
          throw new Error(
            `receipt ${reference.path} lacks required ${kind} evidence ${requirement.id}`,
          );
        }
      }
    }
  }
  return { reference, receipt };
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function verifyPolicy(rawPolicy, { root, sourceCommit = null }) {
  const policy = validatePolicyDocument(rawPolicy);
  if (!policy.enabled) {
    const disabled = deepFreeze({ ...policy, verified_receipts: [] });
    VERIFIED_POLICIES.add(disabled);
    return disabled;
  }
  checkedString(sourceCommit, "verified source commit", COMMIT_PATTERN);
  if (sourceCommit !== policy.source_bundle.source_commit) {
    throw new Error("policy source commit does not match the verified checkout");
  }
  const generated = generateSourceBundle(root, policy.source_bundle_contract.paths);
  if (
    generated.algorithm !== policy.source_bundle.algorithm ||
    generated.sha256 !== policy.source_bundle.sha256
  ) {
    throw new Error("checked-in source bundle does not match repository contents");
  }
  const verified = [];
  for (const entry of policy.entries) {
    if (!entry.enabled) continue;
    const corpusBytes = fs.readFileSync(checkedFile(root, entry.corpus.path, `corpus ${entry.corpus.path}`));
    if (sha256(corpusBytes) !== entry.corpus.sha256) {
      throw new Error(`policy entry ${entry.id} corpus hash does not match repository contents`);
    }
    const harnessBytes = fs.readFileSync(
      checkedFile(root, entry.harness.path, `harness ${entry.harness.path}`),
    );
    if (sha256(harnessBytes) !== entry.harness.sha256) {
      throw new Error(`policy entry ${entry.id} harness hash does not match repository contents`);
    }
    for (const reference of entry.receipts) {
      verified.push({
        entry_id: entry.id,
        ...verifyReceipt(entry, reference, root, policy.source_bundle),
      });
    }
  }
  const result = deepFreeze({ ...policy, verified_receipts: verified });
  VERIFIED_POLICIES.add(result);
  return result;
}

function validateQueryModel(value, label) {
  if (!plainObject(value)) throw new Error(`${label} must be an object`);
  if (value.kind === "exact-fingerprint") {
    exactKeys(value, ["kind", "fingerprint"], [], label);
    return {
      kind: value.kind,
      fingerprint: checkedString(value.fingerprint, `${label} fingerprint`, SHA256_PATTERN),
    };
  }
  if (value.kind === "domain-envelope") {
    exactKeys(
      value,
      ["kind", "domain_id", "genus", "field_kind", "model_kind", "h_kind"],
      [],
      label,
    );
    const hKind = value.h_kind;
    if (!["zero", "nonzero"].includes(hKind)) throw new Error(`${label} h_kind is invalid`);
    return {
      kind: value.kind,
      domain_id: checkedIdentifier(value.domain_id, `${label} domain_id`),
      genus: checkedInteger(value.genus, `${label} genus`, 1),
      field_kind: checkedIdentifier(value.field_kind, `${label} field_kind`),
      model_kind: checkedIdentifier(value.model_kind, `${label} model_kind`),
      h_kind: hKind,
    };
  }
  throw new Error(`${label} has unsupported kind`);
}

function validateQuery(value) {
  exactKeys(
    value,
    ["platform", "backend", "operation", "source_bundle_sha256", "model", "workload"],
    [],
    "query",
  );
  exactKeys(
    value.workload,
    ["prime", "interval_start", "interval_stop", "batch_items", "scalar_bits", "resource_bytes"],
    [],
    "query workload",
  );
  const workload = {
    prime: checkedInteger(value.workload.prime, "query prime"),
    interval_start: checkedInteger(value.workload.interval_start, "query interval_start"),
    interval_stop: checkedInteger(value.workload.interval_stop, "query interval_stop"),
    batch_items: checkedInteger(value.workload.batch_items, "query batch_items"),
    scalar_bits: checkedInteger(value.workload.scalar_bits, "query scalar_bits"),
    resource_bytes: checkedInteger(value.workload.resource_bytes, "query resource_bytes"),
  };
  if (workload.interval_stop < workload.interval_start) {
    throw new Error("query interval is reversed");
  }
  return {
    platform: checkedPlatform(value.platform, "query platform"),
    backend: checkedIdentifier(value.backend, "query backend"),
    operation: checkedIdentifier(value.operation, "query operation"),
    source_bundle_sha256: checkedString(
      value.source_bundle_sha256,
      "query source_bundle_sha256",
      SHA256_PATTERN,
    ),
    model: validateQueryModel(value.model, "query model"),
    workload,
  };
}

function queryModelMatches(policy, query) {
  if (policy.kind !== query.kind) return false;
  if (policy.kind === "exact-fingerprint") {
    return policy.fingerprints.includes(query.fingerprint);
  }
  return (
    policy.domain_id === query.domain_id &&
    policy.constraints.genus.includes(query.genus) &&
    policy.constraints.field_kind.includes(query.field_kind) &&
    policy.constraints.model_kind.includes(query.model_kind) &&
    policy.constraints.h_kind.includes(query.h_kind)
  );
}

function queryEnvelopeMatches(envelope, workload) {
  const span = workload.interval_stop - workload.interval_start + 1;
  return (
    workload.prime >= envelope.prime_min &&
    workload.prime <= envelope.prime_max &&
    workload.interval_start >= envelope.interval_start_min &&
    workload.interval_stop <= envelope.interval_stop_max &&
    span <= envelope.interval_span_max &&
    workload.batch_items >= envelope.batch_items_min &&
    workload.batch_items <= envelope.batch_items_max &&
    workload.scalar_bits <= envelope.scalar_bits_max &&
    workload.resource_bytes <= envelope.resource_bytes_max
  );
}

function queryAutoReceiptPolicy(verifiedPolicy, rawQuery) {
  if (!verifiedPolicy || !VERIFIED_POLICIES.has(verifiedPolicy)) {
    throw new Error("query requires a verified immutable policy");
  }
  if (!verifiedPolicy.enabled) {
    return Object.freeze({ selected: false, reason: "policy-disabled" });
  }
  const query = validateQuery(rawQuery);
  const matches = verifiedPolicy.entries.filter((entry) =>
    entry.enabled &&
    entry.platforms.includes(query.platform) &&
    entry.backend === query.backend &&
    entry.operation === query.operation &&
    entry.source_bundle_sha256 === query.source_bundle_sha256 &&
    queryModelMatches(entry.model, query.model) &&
    queryEnvelopeMatches(entry.envelope, query.workload));
  if (matches.length === 0) {
    return Object.freeze({ selected: false, reason: "unreceipted-fallback" });
  }
  if (matches.length > 1) {
    return Object.freeze({ selected: false, reason: "ambiguous-policy" });
  }
  const entry = matches[0];
  return Object.freeze({
    selected: true,
    reason: "exact-receipt-policy-match",
    entry_id: entry.id,
    backend: entry.backend,
  });
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

module.exports = {
  PLATFORMS,
  POLICY_SCHEMA,
  RECEIPT_SCHEMA,
  REQUIRED_FAILURES,
  REQUIRED_SANITIZERS,
  EXECUTION_TARGETS,
  SOURCE_BUNDLE_ALGORITHM,
  envelopeWithin,
  generateSourceBundle,
  modelWithin,
  queryAutoReceiptPolicy,
  readJson,
  sha256,
  validatePolicyDocument,
  validateReceiptDocument,
  verifyPolicy,
};
