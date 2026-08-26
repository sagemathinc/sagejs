// sagejs-test-tier: integration
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const fixturePath = path.join(
  __dirname,
  "fixtures",
  "number-field-maximal-order-corpus.json",
);
const addprimesEvidencePath = path.join(
  __dirname,
  "..",
  "upstream-tests",
  "sage",
  "number-fields",
  "maximal-order",
  "addprimes-degree-7-oracle.json",
);
const round4GeneratorPath = path.join(
  path.dirname(addprimesEvidencePath),
  "build_pari_round4.py",
);

function digest(domain, value) {
  return crypto
    .createHash("sha256")
    .update(`${domain}\n${JSON.stringify(value)}`)
    .digest("hex");
}

function abs(value) {
  return value < 0n ? -value : value;
}

function pow(base, exponent) {
  let answer = 1n;
  let factor = base;
  let power = BigInt(exponent);
  while (power > 0n) {
    if (power & 1n) answer *= factor;
    factor *= factor;
    power >>= 1n;
  }
  return answer;
}

function badGeneratorPolynomial(degree, c) {
  let previousPrevious = [2n];
  let previous = [-1n];
  for (let step = 2; step <= degree; step += 1) {
    const current = previous.map((value) => -value);
    const shifted = [0n, ...previousPrevious.map((value) => c * value)];
    while (current.length < shifted.length) current.push(0n);
    for (let offset = 0; offset < shifted.length; offset += 1) {
      current[offset] += shifted[offset];
    }
    previousPrevious = previous;
    previous = current;
  }
  const coefficients = previous.map((value) => -2n * value);
  coefficients[0] += 4n * pow(c, degree);
  while (coefficients.length <= degree) coefficients.push(0n);
  coefficients[degree] += degree % 2 === 0 ? 1n : -1n;
  return coefficients.map(String);
}

function scaledGeneratorPolynomial(degree, scale) {
  return [String(-2n * pow(scale, degree)), ...Array(degree - 1).fill("0"), "1"];
}

function addprimesProjection(entry) {
  return {
    ordinal: 1,
    coefficients: entry.polynomial.coefficients,
    equation_discriminant: entry.equationDiscriminant,
    field_discriminant: entry.fieldDiscriminant,
    index: entry.equationOrderIndex,
    local_index_factors: entry.localIndexFactors.map((factor) => [
      factor.value,
      factor.valuation,
      factor.state,
    ]),
    basis_denominator: entry.basis.denominator,
    basis_numerator: entry.basis.numerator,
  };
}

test("addprimes regression is frozen from a global, cross-family maximal order", () => {
  const manifest = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const evidence = JSON.parse(fs.readFileSync(addprimesEvidencePath, "utf8"));
  const entry = manifest.cases.find((item) => item.id === evidence.caseId);
  assert(entry, `missing corpus entry ${evidence.caseId}`);
  assert.deepEqual(addprimesProjection(entry), evidence.generatedRow);
  assert.equal(
    evidence.oracles.pariGp.fieldDiscriminant,
    evidence.generatedRow.field_discriminant,
  );
  assert.equal(
    evidence.oracles.hecke.basisDigest,
    entry.basis.digest,
  );
  assert.equal(evidence.oracles.sage.equationOrderIndex, entry.equationOrderIndex);
  assert.deepEqual(
    evidence.oracles.sage.transitionDeterminantsToAndFromCanonicalHnf,
    ["1", "1"],
  );
});

const gpExecutable = process.env.PARI_GP || "gp";
const gpAvailable =
  childProcess.spawnSync(gpExecutable, ["--version"], { encoding: "utf8" })
    .status === 0;

test(
  "Round-4 generator regenerates the addprimes global maximal order",
  { skip: gpAvailable ? false : `${gpExecutable} is unavailable` },
  () => {
    const evidence = JSON.parse(fs.readFileSync(addprimesEvidencePath, "utf8"));
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "sagejs-addprimes-round4-"),
    );
    const sourcePath = path.join(temporaryDirectory, "round4");
    const polynomial = evidence.polynomial.coefficients
      .map((coefficient, exponent) => `(${coefficient})*x^${exponent}`)
      .join("+");
    fs.writeFileSync(sourcePath, `{ v = [${polynomial}]; }\n`);
    try {
      const result = childProcess.spawnSync(
        pythonExecutable(),
        [round4GeneratorPath, sourcePath, "--gp", gpExecutable],
        { encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), evidence.generatedRow);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  },
);

test("maximal-order corpus is a canonical self-consistent authority", () => {
  const manifest = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(manifest.schemaVersion, 1);

  const claimedManifestDigest = manifest.manifestDigest;
  delete manifest.manifestDigest;
  assert.equal(
    claimedManifestDigest,
    digest("sagejs-maximal-order-corpus-v1", manifest),
  );

  const ids = new Set();
  let standardCount = 0;
  let stressCount = 0;
  let basisAvailableCount = 0;
  let basisInlineCount = 0;
  let crossFamilyLatticeCount = 0;
  let degreeMinimum = Infinity;
  let degreeMaximum = -Infinity;

  for (const entry of manifest.cases) {
    assert.match(entry.id, /^[a-z0-9][a-z0-9.-]*$/);
    assert(!ids.has(entry.id), `duplicate case id ${entry.id}`);
    ids.add(entry.id);

    assert(["standard", "stress"].includes(entry.tier));
    if (entry.tier === "standard") standardCount += 1;
    else stressCount += 1;

    const polynomial = entry.polynomial;
    assert.equal(polynomial.coefficientOrder, "ascending");
    assert.equal(polynomial.coefficients.length, polynomial.degree + 1);
    assert.equal(polynomial.coefficients.at(-1), "1");
    assert(polynomial.coefficients.every((value) => /^-?\d+$/.test(value)));
    assert.equal(
      polynomial.digest,
      digest("sagejs-number-field-polynomial-v1", polynomial.coefficients),
    );
    const height = polynomial.coefficients.reduce(
      (maximum, value) => {
        const magnitude = abs(BigInt(value));
        return magnitude > maximum ? magnitude : maximum;
      },
      0n,
    );
    assert.equal(polynomial.coefficientHeight, height.toString());
    assert.equal(polynomial.coefficientHeightBits, height.toString(2).length);
    degreeMinimum = Math.min(degreeMinimum, polynomial.degree);
    degreeMaximum = Math.max(degreeMaximum, polynomial.degree);

    const equationDiscriminant = BigInt(entry.equationDiscriminant);
    const fieldDiscriminant = BigInt(entry.fieldDiscriminant);
    const index = BigInt(entry.equationOrderIndex);
    assert(index > 0n);
    assert.equal(equationDiscriminant, fieldDiscriminant * index * index);

    let localProduct = 1n;
    for (const factor of entry.localIndexFactors) {
      assert(BigInt(factor.value) > 1n);
      assert(Number.isSafeInteger(factor.valuation) && factor.valuation > 0);
      assert(
        [
          "proven-prime",
          "probable-prime",
          "composite-unresolved",
          "supplied-prime-hint",
        ].includes(factor.state),
      );
      localProduct *= pow(BigInt(factor.value), factor.valuation);
    }
    assert.equal(localProduct, index, `local index factors for ${entry.id}`);
    assert.equal(
      entry.primeSupportCertified,
      entry.localIndexFactors.every((factor) => factor.state === "proven-prime"),
    );

    assert.equal(entry.certification.expected, "certified-global-maximal-order");
    assert(entry.certification.discriminantFamilies.length > 0);
    assert(entry.provenance.source.length > 0);
    assert(entry.provenance.locator.length > 0);

    if (entry.certification.fixtureEvidence === "cross-family-lattice-agreement") {
      crossFamilyLatticeCount += 1;
      assert(entry.certification.discriminantFamilies.length >= 2);
      assert(entry.certification.latticeCrossChecks.length > 0);
    }

    const basis = entry.basis;
    if (basis.state === "unavailable") {
      assert.equal(entry.id, "pari-large-prime-quadratic-compositum");
      assert(basis.reason.length > 0);
      continue;
    }
    assert.equal(basis.state, "available");
    basisAvailableCount += 1;
    assert(BigInt(basis.denominator) > 0n);
    assert.match(basis.digest, /^[0-9a-f]{64}$/);
    if (!basis.numerator) {
      assert.equal(entry.tier, "stress");
      assert.equal(basis.storage, "digest-only");
      continue;
    }

    basisInlineCount += 1;
    assert.equal(basis.numerator.length, polynomial.degree);
    let diagonalProduct = 1n;
    for (let row = 0; row < polynomial.degree; row += 1) {
      assert.equal(basis.numerator[row].length, polynomial.degree);
      for (let column = row + 1; column < polynomial.degree; column += 1) {
        assert.equal(basis.numerator[row][column], "0");
      }
      const diagonal = BigInt(basis.numerator[row][row]);
      assert(diagonal > 0n);
      diagonalProduct *= diagonal;
    }
    assert.equal(
      diagonalProduct * index,
      pow(BigInt(basis.denominator), polynomial.degree),
      `basis covolume for ${entry.id}`,
    );
    assert.equal(
      basis.digest,
      digest("sagejs-maximal-order-hnf-v1", {
        denominator: basis.denominator,
        numerator: basis.numerator,
      }),
    );
  }

  assert.equal(ids.size, manifest.summary.caseCount);
  assert.deepEqual(
    {
      caseCount: ids.size,
      standardCount,
      stressCount,
      basisAvailableCount,
      basisInlineCount,
      crossFamilyLatticeCount,
      degreeMinimum,
      degreeMaximum,
    },
    manifest.summary,
  );

  assert.equal(
    manifest.cases.filter((entry) =>
      entry.id.startsWith("pari-round4-vector-"),
    ).length,
    430,
  );
  for (const required of [
    "pari-1710",
    "pari-1735",
    "pari-2011",
    "pari-2178",
    "pari-2510",
    "hecke-degree-18",
    "hecke-degree-90",
    "hecke-huge-degree-6",
    "hecke-precision-degree-12",
    "pure-bad-generator-n8-c2pow32",
    "pure-bad-generator-n96-c1009",
    "pure-bad-generator-n112-c1009",
    "pure-bad-generator-n128-c1009",
    "pure-bad-generator-n144-c1009",
    "pure-bad-generator-n160-c1009",
    "pure-bad-generator-n32-c2pow512",
    "pure-bad-generator-n32-c2pow2048",
    "scaled-generator-wild-p2-n16",
    "scaled-generator-wild-p2-n32",
    "scaled-generator-wild-p2-n64",
    "scaled-generator-many-prime-n16",
    "scaled-generator-many-prime-n32",
  ]) {
    assert(ids.has(required), `missing required case ${required}`);
  }

  assert(
    manifest.expectedOracleOutcomes.some(
      (outcome) => outcome.status === "timeout",
    ),
  );
  assert(
    manifest.expectedOracleOutcomes.some(
      (outcome) => outcome.status === "unavailable",
    ),
  );

  const scalable = manifest.cases.filter((entry) =>
    entry.tags.includes("scalable-stress"),
  );
  assert.equal(scalable.length, 11);
  for (const entry of scalable) {
    assert.equal(entry.tier, "stress");
    assert.equal(entry.construction.schemaVersion, 1);
    assert.equal(entry.basis.state, "available");
    assert.equal(entry.basis.storage, "digest-only");
    const parameters = entry.construction.parameters;
    if (entry.construction.kind === "pure-field-quadratic-generator") {
      assert.deepEqual(
        entry.polynomial.coefficients,
        badGeneratorPolynomial(parameters.n, BigInt(parameters.c)),
      );
      assert.equal(entry.primeSupportCertified, false);
    } else {
      assert.equal(entry.construction.kind, "scaled-pure-field-generator");
      const scale = BigInt(parameters.scale);
      assert.deepEqual(
        entry.polynomial.coefficients,
        scaledGeneratorPolynomial(parameters.n, scale),
      );
      assert.equal(
        BigInt(entry.equationOrderIndex),
        pow(scale, parameters.n * (parameters.n - 1) / 2),
      );
      assert.equal(entry.primeSupportCertified, true);
    }
    assert(
      manifest.expectedOracleOutcomes.some(
        (outcome) => outcome.caseId === entry.id &&
          outcome.oracle === "gp-nfbasis-2.17.3" &&
          outcome.status === "ok",
      ),
      `missing bounded GP outcome for ${entry.id}`,
    );
  }
});
