// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const corpus = require("./complex-cubic-frontier-corpus.cjs");

function groupFor(classId) {
  if (classId === "h0-trivial") return { class_number: "1", class_group: [] };
  if (classId === "h1-cyclic-2-4") {
    return { class_number: "2", class_group: ["2"] };
  }
  if (classId === "h2-cyclic-5-16") {
    return { class_number: "5", class_group: ["5"] };
  }
  if (classId === "h3-cyclic-ge-17") {
    return { class_number: "17", class_group: ["17"] };
  }
  return { class_number: "4", class_group: ["2", "2"] };
}

function sourceRecord(label, selection, group) {
  const discriminant = label.split(".")[2];
  return {
    selection,
    label,
    degree: 3,
    coefficients: ["1", "0", "-1", "1"],
    disc_sign: -1,
    discriminant_absolute: discriminant,
    r2: 1,
    unit_rank: 1,
    discriminant_radical: discriminant,
    equation_order_index: "1",
    monogenic: 1,
    galois_transitive_group: 2,
    galois_label: "3T2",
    ramified_prime_count: 1,
    ...group,
    regulator: "1.25",
    torsion_order: 2,
    used_grh: false,
    narrow_class_number: group.class_number,
    narrow_class_group: [...group.class_group],
    unit_signature_rank: 1,
  };
}

function syntheticRecords() {
  const records = corpus.CONTROL_LABELS.map((label, index) =>
    sourceRecord(
      label,
      {
        role: "smoke",
        stratum: "fixed-complex-controls",
        selection_rank: index + 1,
      },
      { class_number: "1", class_group: [] },
    ));
  corpus.DISCRIMINANT_BANDS.forEach((discriminantBand, discriminantIndex) => {
    corpus.CLASS_BANDS.forEach((classId, classIndex) => {
      for (let rank = 1; rank <= 70; rank += 1) {
        const discriminant =
          discriminantBand.lowerExclusive + BigInt(100 * rank + 10 * classIndex + 1);
        const label = `3.1.${discriminant}.${discriminantIndex * 5 + classIndex + 1}`;
        records.push(sourceRecord(
          label,
          {
            role: rank <= 50 ? "tune" : "holdout",
            stratum: `${discriminantBand.id}:${classId}`,
            selection_rank: rank,
          },
          groupFor(classId),
        ));
      }
    });
  });
  return records.sort(corpus.compareRecords);
}

const EXCLUDED = ["3.1.999999999.1", "3.3.961.1"];
const EXCLUDED_DIGEST = corpus.labelsSha256(EXCLUDED);
const CAPTURED_AT = "2026-09-02T12:00:00.000Z";

test("selection SQL freezes controls, strata, exposure exclusion, and seed", () => {
  const sql = corpus.selectionQuery([...EXCLUDED].reverse());
  assert.ok(sql.endsWith("\n"));
  assert.match(sql, /LEFT JOIN exposed USING \(label\)/u);
  assert.match(sql, /AND exposed\.label IS NULL/u);
  assert.match(sql, /selection_rank <= 50 THEN 'tune'/u);
  assert.match(sql, /selection_rank <= 70/u);
  assert.match(sql, new RegExp(corpus.SELECTION_SEED.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  for (const label of [...corpus.CONTROL_LABELS, ...EXCLUDED]) {
    assert.match(sql, new RegExp(label.replaceAll(".", "\\."), "u"));
  }
  assert.equal(corpus.selectionQuery(EXCLUDED), sql);
  assert.throws(() => corpus.selectionQuery(["3.1.23.1'; DROP TABLE nf_fields"]));
});

test("the synthetic 1412-row corpus validates every rank and metadata contract", () => {
  const records = syntheticRecords();
  assert.equal(corpus.validateCorpusRecords(records, EXCLUDED), records);
  assert.deepEqual(
    Object.fromEntries(["smoke", "tune", "holdout"].map((role) => [
      role,
      records.filter((record) => record.selection.role === role).length,
    ])),
    { smoke: 12, tune: 1000, holdout: 400 },
  );
  assert.equal(new Set(
    records.filter((record) => record.selection.role === "tune")
      .map((record) => record.selection.stratum),
  ).size, 20);
});

test("bundle assets and manifest have deterministic independent identities", () => {
  const records = syntheticRecords();
  const first = corpus.buildBundle(records, {
    excludedLabels: EXCLUDED,
    expectedExcludedDigest: EXCLUDED_DIGEST,
    capturedAt: CAPTURED_AT,
  });
  const second = corpus.buildBundle([...records].reverse(), {
    excludedLabels: [...EXCLUDED].reverse(),
    expectedExcludedDigest: EXCLUDED_DIGEST,
    capturedAt: CAPTURED_AT,
  });
  assert.equal(first.manifest.id, second.manifest.id);
  assert.deepEqual(first.manifest, second.manifest);
  assert.deepEqual(first.assets.survey.gzip, second.assets.survey.gzip);
  assert.deepEqual(first.assets.holdout.gzip, second.assets.holdout.gzip);
  assert.equal(first.manifest.release.assets[0].record_count, 1012);
  assert.equal(first.manifest.release.assets[1].record_count, 400);
  assert.deepEqual(first.manifest.exclusions.derivation, corpus.EXCLUSION_DERIVATION);
  assert.notEqual(
    first.manifest.release.assets[0].canonical_jsonl_sha256,
    first.manifest.release.assets[0].gzip_sha256,
  );
});

test("survey-only loading succeeds while the holdout is physically absent", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-cubic-survey-only-"));
  try {
    const bundle = corpus.buildBundle(syntheticRecords(), {
      excludedLabels: EXCLUDED,
      expectedExcludedDigest: EXCLUDED_DIGEST,
      capturedAt: CAPTURED_AT,
    });
    const survey = bundle.assets.survey;
    fs.writeFileSync(path.join(temporary, survey.descriptor.filename), survey.gzip);
    assert.equal(
      fs.existsSync(path.join(temporary, bundle.assets.holdout.descriptor.filename)),
      false,
    );
    const loaded = corpus.loadSurveyAsset(
      bundle.manifest,
      temporary,
      EXCLUDED_DIGEST,
    );
    assert.equal(loaded.length, 1012);
    assert.equal(loaded.filter((record) => record.selection.role === "tune").length, 1000);
    assert.equal(loaded.some((record) => record.selection.role === "holdout"), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("survey validation rejects role, control, rank, and stratum drift", () => {
  const bundle = corpus.buildBundle(syntheticRecords(), {
    excludedLabels: EXCLUDED,
    expectedExcludedDigest: EXCLUDED_DIGEST,
    capturedAt: CAPTURED_AT,
  });
  const survey = bundle.records.filter((record) => record.selection.role !== "holdout");

  const wrongRole = structuredClone(survey);
  wrongRole.find((record) => record.selection.role === "tune").selection.role = "holdout";
  assert.throws(
    () => corpus.validateSurveyRecords(wrongRole, bundle.manifest),
    /forbidden role/u,
  );

  const missingControl = survey.filter((record) => record.label !== corpus.CONTROL_LABELS[0]);
  assert.throws(
    () => corpus.validateSurveyRecords(missingControl, bundle.manifest),
    /exactly 1012/u,
  );

  const duplicateRank = structuredClone(survey);
  const sameStratum = duplicateRank.filter((record) =>
    record.selection.role === "tune" &&
    record.selection.stratum === corpus.expectedStrata()[0]);
  sameStratum[1].selection.selection_rank = sameStratum[0].selection.selection_rank;
  assert.throws(
    () => corpus.validateSurveyRecords(duplicateRank, bundle.manifest),
    /duplicate survey rank/u,
  );

  const wrongStratum = structuredClone(survey);
  wrongStratum.find((record) => record.selection.role === "tune").selection.stratum =
    corpus.expectedStrata()[1];
  assert.throws(
    () => corpus.validateSurveyRecords(wrongStratum, bundle.manifest),
    /invalid survey stratum or rank/u,
  );
});

test("emitted corpus validates offline and fails closed on logical or physical drift", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-cubic-frontier-"));
  try {
    const exclusionPath = path.join(temporary, "exposed.json");
    fs.writeFileSync(exclusionPath, `${JSON.stringify(EXCLUDED)}\n`);
    const bundle = corpus.buildBundle(syntheticRecords(), {
      excludedLabels: EXCLUDED,
      expectedExcludedDigest: EXCLUDED_DIGEST,
      capturedAt: CAPTURED_AT,
    });
    const emitted = corpus.emitBundle(bundle, temporary);
    assert.equal(path.basename(emitted.manifestPath), corpus.manifestFilename(bundle.manifest));
    const checked = corpus.validateBundle(
      corpus.readManifest(emitted.manifestPath),
      temporary,
      EXCLUDED,
      { expectedExcludedDigest: EXCLUDED_DIGEST },
    );
    assert.equal(checked.survey.length, 1012);
    assert.equal(checked.holdout.length, 400);

    const cli = childProcess.spawnSync(
      process.execPath,
      [
        path.join(__dirname, "complex-cubic-frontier-corpus.cjs"),
        "--check",
        "--manifest", emitted.manifestPath,
        "--exclude-labels", exclusionPath,
        "--expected-excluded-labels-sha256", EXCLUDED_DIGEST,
      ],
      { encoding: "utf8", env: { ...process.env, LMFDB_PGHOST: "offline.invalid" } },
    );
    assert.equal(cli.status, 0, cli.stderr || cli.stdout);
    assert.match(cli.stdout, /valid \(1412 records\)/u);

    const survey = bundle.manifest.release.assets[0];
    const surveyPath = path.join(temporary, survey.filename);
    const corrupted = fs.readFileSync(surveyPath);
    corrupted[corrupted.length - 1] ^= 1;
    fs.writeFileSync(surveyPath, corrupted);
    assert.throws(
      () => corpus.validateBundle(bundle.manifest, temporary, EXCLUDED, {
        expectedExcludedDigest: EXCLUDED_DIGEST,
      }),
      /compressed asset identity mismatch/u,
    );
    const renamedManifest = path.join(temporary, "renamed-manifest.json");
    fs.writeFileSync(renamedManifest, fs.readFileSync(emitted.manifestPath));
    assert.throws(() => corpus.readManifest(renamedManifest), /filename does not match/u);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("validation rejects exposure, stratum, order, and manifest mutations", () => {
  const records = syntheticRecords();
  const exposedRecord = records.find((record) => record.selection.role === "tune");
  assert.throws(
    () => corpus.validateCorpusRecords(records, [exposedRecord.label]),
    /exposed label was resampled/u,
  );
  const staleStratum = structuredClone(records);
  staleStratum.find((record) => record.selection.role === "tune").selection.stratum = "wrong";
  assert.throws(() => corpus.validateCorpusRecords(staleStratum, EXCLUDED), /stale stratum/u);
  const wrongOrder = structuredClone(records);
  [wrongOrder[0], wrongOrder[1]] = [wrongOrder[1], wrongOrder[0]];
  assert.throws(() => corpus.validateCorpusRecords(wrongOrder, EXCLUDED), /strictly ordered/u);

  const bundle = corpus.buildBundle(records, {
    excludedLabels: EXCLUDED,
    expectedExcludedDigest: EXCLUDED_DIGEST,
    capturedAt: CAPTURED_AT,
  });
  const changed = structuredClone(bundle.manifest);
  changed.counts.tune = 999;
  assert.throws(
    () => corpus.validateManifestShape(changed, EXCLUDED_DIGEST),
    /content identity is stale/u,
  );
});

test("replay SQL fetches pinned labels without resampling", () => {
  const labels = syntheticRecords().map((record) => record.label);
  const sql = corpus.replayQuery(labels);
  assert.match(sql, /WITH selected_labels\(label\) AS/u);
  assert.doesNotMatch(sql, /row_number\(\) OVER/u);
  assert.doesNotMatch(sql, /md5\(/u);
  assert.match(sql, /ORDER BY f\.degree, f\.disc_abs, f\.label/u);
  assert.match(sql, /3\.1\.9399\.1/u);
});

test("excluded-label input accepts supported forms and binds canonical order", () => {
  const newline = corpus.parseExcludedLabelsBytes("3.3.961.1\n3.1.999999999.1\n");
  const object = corpus.parseExcludedLabelsBytes(JSON.stringify({
    records: [...EXCLUDED].reverse().map((label) => ({ label })),
  }));
  assert.deepEqual(newline, corpus.canonicalLabels(EXCLUDED));
  assert.deepEqual(object, corpus.canonicalLabels(EXCLUDED));
  assert.equal(corpus.labelsSha256(newline), EXCLUDED_DIGEST);
  assert.throws(() => corpus.parseExcludedLabelsBytes("not-a-label\n"));
});

test("the production exclusion provenance freezes its count and extraction rule", () => {
  assert.equal(corpus.EXPECTED_EXCLUDED_LABELS_COUNT, 1815);
  assert.deepEqual(corpus.EXCLUSION_DERIVATION.roots, [
    ".agents/scratch",
    "bench",
    "test/fixtures/number-field-lmfdb-cubic-100.json",
    "test/fixtures/number-field-lmfdb-cubic-class-numbers.json",
  ]);
  assert.equal(corpus.EXCLUSION_DERIVATION.label_regex, String.raw`3\.(1|3)\.[0-9]+\.[0-9]+`);
});
