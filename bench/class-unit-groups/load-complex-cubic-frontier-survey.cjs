"use strict";

const fs = require("node:fs");
const path = require("node:path");

const frozen = require("../optimization-engine/complex-cubic-frontier-corpus.cjs");
const {
  CORPUS_SCHEMA,
  SEED,
  canonicalDigest,
  sha256,
  validateCorpus,
} = require("./complex-cubic-frontier-schema.cjs");

const FROZEN_MANIFEST_ID =
  "sha256:6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6";
const FROZEN_PROJECTED_RECORDS_SHA256 =
  "14ecb29ebef8f30ef1de9c7ef0241a24187d8412bcceef97ae41447e5bc43cfa";
const FROZEN_PROJECTED_LABELS_SHA256 =
  "28742c0b2d29bb344c7ebe842a085868a6bd97a26942ab1098c21b779f08af4b";
const FROZEN_PROJECTED_CONTROL_LABELS_SHA256 =
  "562d172912bef0658897ac932c0fbea86850f1d85b82bf71ad27439dfe7c0548";

function projectField(record, selection) {
  return {
    label: record.label,
    coefficients: record.coefficients,
    discriminant: `-${record.discriminant_absolute}`,
    discriminant_absolute: record.discriminant_absolute,
    class_number: record.class_number,
    class_group_invariants: record.class_group,
    equation_order_index: record.equation_order_index,
    ramified_prime_count: record.ramified_prime_count,
    selection,
  };
}

function projectSurvey(manifest, survey, identity) {
  frozen.validateSurveyRecords(survey, manifest);
  if (!identity || typeof identity.manifestFilename !== "string" ||
      !/^[0-9a-f]{64}$/.test(identity.manifestFileSha256)) {
    throw new Error("complex cubic frontier survey projection needs manifest file identity");
  }
  const controls = new Map(
    survey.filter((record) => record.selection.role === "smoke")
      .map((record) => [record.label, record]),
  );
  const tune = new Map();
  for (const record of survey) {
    if (record.selection.role !== "tune") continue;
    tune.set(`${record.selection.stratum}:${record.selection.selection_rank}`, record);
  }
  const records = [];
  for (let rank = 1; rank <= manifest.counts.tune_per_stratum; rank += 1) {
    manifest.strata.forEach((stratum, shard) => {
      const record = tune.get(`${stratum}:${rank}`);
      if (!record) throw new Error(`complex cubic frontier survey misses ${stratum} rank ${rank}`);
      records.push(projectField(record, {
        global_rank: records.length + 1,
        stratum,
        stratum_rank: rank,
        shard,
      }));
    });
  }
  const warmups = manifest.controls.map((label, index) => {
    const record = controls.get(label);
    if (!record) throw new Error(`complex cubic frontier survey misses control ${label}`);
    return projectField(record, {
      global_rank: records.length + index + 1,
      stratum: "fixed-complex-controls",
      stratum_rank: index + 1,
      shard: index % manifest.strata.length,
    });
  });
  const surveyAsset = manifest.release.assets[0];
  const corpus = {
    schema: CORPUS_SCHEMA,
    schema_version: 1,
    created_at: manifest.snapshot.captured_at,
    manifest: {
      schema: manifest.schema,
      id: manifest.id,
      filename: identity.manifestFilename,
      file_sha256: identity.manifestFileSha256,
      selection_query_sha256: manifest.checksums.selection_sql_sha256,
    },
    survey_asset: {
      role: surveyAsset.role,
      filename: surveyAsset.filename,
      gzip_sha256: surveyAsset.gzip_sha256,
      records_sha256: surveyAsset.records_sha256,
      labels_sha256: surveyAsset.labels_sha256,
    },
    selection_policy: {
      seed: manifest.snapshot.selection_seed,
      field_count: manifest.counts.tune,
      warmup_count: manifest.counts.smoke,
      shard_count: manifest.counts.strata,
      fields_per_shard: manifest.counts.tune_per_stratum,
      strata: manifest.strata,
      tune_per_stratum: manifest.counts.tune_per_stratum,
      projection: "rank-major over manifest strata; one stratum per shard",
    },
    prior_exposure: {
      record_count: manifest.exclusions.count,
      labels_sha256: manifest.exclusions.labels_sha256,
      derivation: manifest.exclusions.derivation,
    },
    warmups,
    records,
    digests: {
      labels_sha256: sha256(`${records.map((record) => record.label).join("\n")}\n`),
      records_sha256: canonicalDigest(records),
      warmup_labels_sha256: sha256(`${warmups.map((record) => record.label).join("\n")}\n`),
    },
  };
  if (corpus.selection_policy.seed !== SEED) {
    throw new Error("complex cubic frontier survey selection seed is stale");
  }
  return validateCorpus(corpus);
}

function loadFrozenSurveyCorpus(manifestPath, assetDirectory) {
  const resolvedManifest = path.resolve(manifestPath);
  const manifestBytes = fs.readFileSync(resolvedManifest);
  const manifest = frozen.parseManifestBytes(manifestBytes, resolvedManifest);
  if (manifest.id !== FROZEN_MANIFEST_ID) {
    throw new Error(`complex cubic frontier runner requires frozen manifest ${FROZEN_MANIFEST_ID}`);
  }
  const resolvedAssets = path.resolve(assetDirectory || path.dirname(resolvedManifest));
  const survey = frozen.loadSurveyAsset(manifest, resolvedAssets);
  const corpus = projectSurvey(manifest, survey, {
    manifestFilename: path.basename(resolvedManifest),
    manifestFileSha256: sha256(manifestBytes),
  });
  const expected = {
    records_sha256: FROZEN_PROJECTED_RECORDS_SHA256,
    labels_sha256: FROZEN_PROJECTED_LABELS_SHA256,
    warmup_labels_sha256: FROZEN_PROJECTED_CONTROL_LABELS_SHA256,
  };
  for (const [key, digest] of Object.entries(expected)) {
    if (corpus.digests[key] !== digest) {
      throw new Error(`complex cubic frontier frozen ${key} is ${corpus.digests[key]}, expected ${digest}`);
    }
  }
  return corpus;
}

module.exports = {
  FROZEN_MANIFEST_ID,
  FROZEN_PROJECTED_CONTROL_LABELS_SHA256,
  FROZEN_PROJECTED_LABELS_SHA256,
  FROZEN_PROJECTED_RECORDS_SHA256,
  loadFrozenSurveyCorpus,
  projectField,
  projectSurvey,
};
