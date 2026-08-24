const RUNTIME_SCHEMA = "sagejs.hyperelliptic-auto-receipt-runtime/v1";

function contains(values, value) {
  return Array.isArray(values) && values.includes(value);
}

function modelMatches(model, values) {
  if (model?.kind === "exact-fingerprint") {
    return contains(model.fingerprints, values.fingerprint);
  }
  if (model?.kind !== "domain-envelope") return false;
  const constraints = model.constraints;
  return (
    model.domain_id === values.domainId &&
    contains(constraints?.genus, values.genus) &&
    contains(constraints?.field_kind, values.fieldKind) &&
    contains(constraints?.model_kind, values.modelKind) &&
    contains(constraints?.h_kind, values.hKind)
  );
}

function envelopeMatches(envelope, values) {
  const span = values.intervalStop - values.intervalStart + 1;
  return (
    Number.isSafeInteger(span) &&
    span >= 1 &&
    values.prime >= envelope.prime_min &&
    values.prime <= envelope.prime_max &&
    values.intervalStart >= envelope.interval_start_min &&
    values.intervalStop <= envelope.interval_stop_max &&
    span <= envelope.interval_span_max &&
    values.batchItems >= envelope.batch_items_min &&
    values.batchItems <= envelope.batch_items_max &&
    values.scalarBits <= envelope.scalar_bits_max &&
    values.resourceBytes <= envelope.resource_bytes_max
  );
}

function runtimeInteger(value, label) {
  const result = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer`);
  }
  return result;
}

function decision(policy, values) {
  if (policy?.enabled !== true) {
    return Object.freeze({
      schema: RUNTIME_SCHEMA,
      policy_enabled: false,
      selected: false,
      reason: "policy-disabled",
      entry_id: null,
      backend: values.backend,
      operation: values.operation,
    });
  }
  const matches = policy.entries.filter((entry) =>
    entry.enabled === true &&
    entry.backend === values.backend &&
    entry.operation === values.operation &&
    entry.source_bundle_sha256 === policy.source_bundle.sha256 &&
    modelMatches(entry.model, values) &&
    envelopeMatches(entry.envelope, values));
  if (matches.length !== 1) {
    return Object.freeze({
      schema: RUNTIME_SCHEMA,
      policy_enabled: true,
      selected: false,
      reason: matches.length === 0 ? "unreceipted-fallback" : "ambiguous-policy",
      entry_id: null,
      backend: values.backend,
      operation: values.operation,
    });
  }
  return Object.freeze({
    schema: RUNTIME_SCHEMA,
    policy_enabled: true,
    selected: true,
    reason: "exact-receipt-policy-match",
    entry_id: matches[0].id,
    backend: values.backend,
    operation: values.operation,
  });
}

/** Create the browser-side provider from a build-verified policy document. */
export function createBrowserAutoReceiptPolicyRuntime(policy) {
  if (policy === null || typeof policy !== "object" || !Array.isArray(policy.entries)) {
    throw new TypeError("invalid build-verified hyperelliptic receipt policy");
  }
  const decide = (
    backend,
    operation,
    fingerprint,
    domainId,
    genus,
    fieldKind,
    modelKind,
    hKind,
    prime,
    intervalStart,
    intervalStop,
    batchItems,
    scalarBits,
    resourceBytes,
  ) => decision(policy, {
    backend,
    operation,
    fingerprint,
    domainId,
    genus: runtimeInteger(genus, "genus"),
    fieldKind,
    modelKind,
    hKind,
    prime: runtimeInteger(prime, "prime"),
    intervalStart: runtimeInteger(intervalStart, "interval_start"),
    intervalStop: runtimeInteger(intervalStop, "interval_stop"),
    batchItems: runtimeInteger(batchItems, "batch_items"),
    scalarBits: runtimeInteger(scalarBits, "scalar_bits"),
    resourceBytes: runtimeInteger(resourceBytes, "resource_bytes"),
  });
  return Object.freeze({
    schema: RUNTIME_SCHEMA,
    enabled: policy.enabled === true,
    platform: "wasm-portable",
    source_bundle_sha256: policy.source_bundle?.sha256 ?? null,
    decide,
  });
}

export { RUNTIME_SCHEMA };
