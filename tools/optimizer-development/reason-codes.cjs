"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  array,
  contentId,
  deepFreeze,
  enumeration,
  exactKeys,
  identifier,
  nonemptyString,
  record,
  repositoryPath,
  stringArray,
  verifyDocumentIdentity,
} = require("./common.cjs");

const REASON_REGISTRY_SCHEMA = "sagejs.optimizer-reason-registry/v1";
const REGISTRY_PATH = path.resolve(__dirname, "../../architecture/optimizer-reason-codes.json");
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

function validateRegistry(document, label = "reason registry") {
  exactKeys(label, document, ["schema", "id", "codes"]);
  if (document.schema !== REASON_REGISTRY_SCHEMA) {
    throw new Error(`optimizer evidence ${label}.schema: unknown schema ${document.schema}`);
  }
  const codes = array(`${label}.codes`, document.codes, (entryLabel, entry) => {
    exactKeys(entryLabel, entry,
      ["code", "kind", "origin", "description", "detailFields"]);
    if (typeof entry.code !== "string" || !CODE_PATTERN.test(entry.code)) {
      throw new Error(`optimizer evidence ${entryLabel}.code: invalid stable reason code`);
    }
    return {
      code: entry.code,
      kind: enumeration(`${entryLabel}.kind`, entry.kind,
        ["rejection", "target-rejection", "heuristic", "guard", "integrity", "staleness"]),
      origin: enumeration(`${entryLabel}.origin`, entry.origin,
        ["compiler", "dashboard", "evaluator", "collector", "validator"]),
      description: nonemptyString(`${entryLabel}.description`, entry.description),
      detailFields: stringArray(`${entryLabel}.detailFields`, entry.detailFields,
        { identifiers: true }),
    };
  }, {
    minimum: 1,
    uniqueBy: (entry) => entry.code,
    sortedBy: (entry) => entry.code,
  });
  const normalized = { schema: document.schema, id: document.id, codes };
  verifyDocumentIdentity(label, normalized);
  return deepFreeze(normalized);
}

function loadReasonRegistry(filename = REGISTRY_PATH) {
  repositoryPath("reason registry repository location",
    path.relative(path.resolve(__dirname, "../.."), filename).split(path.sep).join("/"));
  return validateRegistry(JSON.parse(fs.readFileSync(filename, "utf8")), filename);
}

function registryMap(registry) {
  const checked = validateRegistry(registry);
  return new Map(checked.codes.map((entry) => [entry.code, entry]));
}

function normalizeLegacyReason(value) {
  nonemptyString("legacy reason", value);
  const prefix = "bounded-integer.unsupported-operation:";
  if (value.startsWith(prefix)) {
    return { code: "bounded-integer.unsupported-operation", detail: { operator: value.slice(prefix.length) } };
  }
  return { code: value, detail: {} };
}

function validateReason(value, registry = DEFAULT_REASON_REGISTRY, label = "reason") {
  if (typeof value === "string") value = normalizeLegacyReason(value);
  exactKeys(label, value, ["code", "detail"]);
  nonemptyString(`${label}.code`, value.code);
  const entry = registryMap(registry).get(value.code);
  if (!entry) throw new Error(`optimizer evidence ${label}.code: unknown reason code ${value.code}`);
  record(`${label}.detail`, value.detail);
  const detailFields = Object.keys(value.detail).sort();
  if (JSON.stringify(detailFields) !== JSON.stringify(entry.detailFields)) {
    throw new Error(
      `optimizer evidence ${label}.detail: fields must be exactly ${entry.detailFields.join(", ")}; ` +
      `got ${detailFields.join(", ")}`,
    );
  }
  const detail = {};
  for (const field of entry.detailFields) {
    detail[field] = nonemptyString(`${label}.detail.${field}`, value.detail[field]);
  }
  return deepFreeze({ code: value.code, detail });
}

function validateReasons(value, registry = DEFAULT_REASON_REGISTRY, label = "reasons") {
  return deepFreeze(array(label, value,
    (itemLabel, reason) => validateReason(reason, registry, itemLabel),
    { uniqueBy: (reason) => JSON.stringify(reason) }));
}

const DEFAULT_REASON_REGISTRY = loadReasonRegistry();

module.exports = {
  DEFAULT_REASON_REGISTRY,
  REASON_REGISTRY_SCHEMA,
  REGISTRY_PATH,
  loadReasonRegistry,
  normalizeLegacyReason,
  registryMap,
  validateReason,
  validateReasons,
  validateRegistry,
};
