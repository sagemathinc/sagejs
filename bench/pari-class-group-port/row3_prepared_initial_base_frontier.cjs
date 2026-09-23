"use strict";

// Smallest honest row-3 prepared predecessor: authenticated prepared nf ->
// degree catalog -> PARI initial C1/C2 factor-base selection.  Descriptor,
// relation, HNF, and answer data are deliberately not inputs.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const SCHEMA = "sagejs.pari-class-group/row3-prepared-initial-base-frontier-v1";
const PREPARED_SHA256 =
  "8dd27ea0c2f070e34964db79efcc03fa60e869891c996aba9f51b0291a97f41f";
const FIELD_ID =
  "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9";
const SOURCES = Object.freeze({
  degree: path.join(HERE, "prime_degree_catalog.py"),
  discriminant: path.join(HERE, "discriminant_log.py"),
  initial: path.join(HERE, "initial_base.py"),
  catalog: path.join(HERE, "initial_kummer_catalog.py"),
  packets: path.join(HERE, "selected_ideal_packets.py"),
  metadata: path.join(HERE, "selected_ideal_metadata.py"),
  random: path.join(HERE, "pari_random.py"),
  bad: path.join(HERE, "bad_subfactor.py"),
  subfactorProduct: path.join(HERE, "subfactor_product.py"),
  subfactor: path.join(HERE, "subfactor_base.py"),
  relations: path.join(HERE, "relation_insertion.py"),
});

const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value);

function packedAt(buffer, index) {
  const signedWords = buffer.sizes[index];
  const words = Math.abs(signedWords);
  let value = 0n;
  for (let word = words - 1; word >= 0; word -= 1)
    value = (value << 64n) + buffer.limbs[index * buffer.wordCapacity + word];
  return signedWords < 0 ? -value : value;
}

function packedSlice(buffer, start, end) {
  return Array.from({ length: end - start }, (_, index) =>
    String(packedAt(buffer, start + index)));
}

function verifyOwner(owner) {
  assert.equal(owner.schema, SCHEMA);
  assert.equal(owner.field.id, FIELD_ID);
  assert.deepEqual(owner.field.polynomial,
    ["20000000042", "-20000000022", "0", "1"]);
  assert.deepEqual(owner.field.signature, ["3", "0"]);
  assert.equal(owner.authority.preparedSha256, PREPARED_SHA256);
  assert.match(owner.authority.degreeSourceSha256, /^[0-9a-f]{64}$/);
  assert.match(owner.authority.initialSourceSha256, /^[0-9a-f]{64}$/);
  assert.match(owner.authority.discriminantSourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(owner.provenance.inputPolicy, "authenticated-prepared-nf-only");
  assert.equal(owner.provenance.frozenAnswerInputs, false);
  assert.equal(owner.publication.initialBaseComplete, true);
  assert.equal(owner.publication.factorDescriptorsComplete, true);
  assert.equal(owner.publication.factorIdealsComplete, true);
  assert.equal(owner.publication.relationsComplete, false);
  assert.equal(owner.publication.hnfComplete, false);
  const bounds = owner.bounds;
  for (const key of ["C1", "C2", "KC", "KCZ", "KCZ2", "KC2", "prodZ"])
    assert.match(bounds[key], /^(0|[1-9][0-9]*)$/);
  assert.equal(owner.factorSelection.rationalPrimes.length, Number(bounds.KCZ2));
  assert.equal(owner.factorSelection.selectedDescriptorIndices.length,
    Number(bounds.KC2));
  return true;
}

async function run(prepared) {
  const auth = require("./prepared_nf_authentication.cjs");
  const authority = auth.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_SHA256,
    "row3 prepared authority changed");
  assert.deepEqual(Object.keys(prepared).sort(), [
    "admission_factorlimit", "admission_matrix_e", "admission_matrix_m",
    "admission_matrix_p", "admission_prime_limit", "admission_primes",
    "admission_products", "admission_real_count", "analytic_discriminant",
    "analytic_primes", "analytic_roots_of_unity", "basis_table", "n",
    "precision", "prep_index", "prep_invzk", "prep_polynomial", "prep_zk",
    "prep_zk_degrees", "prep_zkden", "preparation_embedding",
    "preparation_rounded_embedding",
  ]);
  assert.equal(prepared.n, "3");
  assert.equal(prepared.prep_index, "1");
  assert.equal(prepared.admission_real_count, "3");
  assert.equal(prepared.precision, "192");
  assert.equal(prepared.admission_prime_limit, "65537");
  assert.deepEqual(prepared.prep_polynomial,
    ["20000000042", "-20000000022", "0", "1"]);

  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const [degreeBuilt, discriminantBuilt, initialBuilt, catalogBuilt,
    packetsBuilt, metadataBuilt, randomBuilt, badBuilt, subfactorProductBuilt,
    subfactorBuilt, relationsBuilt] = await Promise.all([
    compileKernel({ sourcePath: SOURCES.degree }),
    compileKernel({ sourcePath: SOURCES.discriminant }),
    compileKernel({ sourcePath: SOURCES.initial }),
    compileKernel({ sourcePath: SOURCES.catalog }),
    compileKernel({ sourcePath: SOURCES.packets }),
    compileKernel({ sourcePath: SOURCES.metadata }),
    compileKernel({ sourcePath: SOURCES.random }),
    compileKernel({ sourcePath: SOURCES.bad }),
    compileKernel({ sourcePath: SOURCES.subfactorProduct }),
    compileKernel({ sourcePath: SOURCES.subfactor }),
    compileKernel({ sourcePath: SOURCES.relations }),
  ]);
  const degree = require(degreeBuilt.modulePath).pari_prime_degree_catalog;
  const discriminant = require(discriminantBuilt.modulePath).pari_discriminant_log;
  const initial = require(initialBuilt.modulePath).pari_prepared_initial_base;
  const catalog = require(catalogBuilt.modulePath).pari_initial_kummer_catalog;
  const packets = require(packetsBuilt.modulePath).pari_selected_ideal_packets;
  const metadata = require(metadataBuilt.modulePath).pari_selected_ideal_metadata;
  const randomSeed = require(randomBuilt.modulePath).pari_random_seed;
  const badFlags = require(badBuilt.modulePath).pari_bad_subfactor_flags;
  const subfactorProduct = require(subfactorProductBuilt.modulePath)
    .pari_subfactor_product;
  const subfactor = require(subfactorBuilt.modulePath).pari_prepared_subfactor_base;
  const initializeRelations = require(relationsBuilt.modulePath)
    .pari_initialize_owned_relations;
  for (const fn of [degree, discriminant, initial, catalog, packets, metadata,
    randomSeed, badFlags, subfactorProduct, subfactor, initializeRelations])
    assert.equal(fn.nativeAvailable, true, "row3 frontier native function unavailable");

  const buffer = (length, words = 4, values = undefined) =>
    degree.createIntegerBuffer(length, words, values?.map(BigInt));
  const primesRaw = prepared.admission_primes.map(Number);
  let primeCount = primesRaw.findIndex(value => value > 10007);
  if (primeCount < 0) throw new Error("neutral prime table has no 10007 sentinel");
  primeCount += 1;
  const primesRawPrefix = primesRaw.slice(0, primeCount);
  const primes = buffer(primeCount, 2, primesRawPrefix);
  const capacity = 3 * primeCount;
  const patternOffsets = buffer(primeCount, 2);
  const patternCounts = buffer(primeCount, 2);
  const patternDegrees = buffer(capacity, 2);
  const multiplicities = buffer(capacity, 2);
  const fullOffsets = buffer(primeCount, 2);
  const fullCounts = buffer(primeCount, 2);
  const fullDegrees = buffer(capacity, 2);
  const degreeState = buffer(4, 2);
  const degreeStatus = degree.gmp(
    buffer(4, 8, prepared.prep_polynomial), 3n, 1n, primes,
    BigInt(primeCount), buffer(393, 8), buffer(3, 2), buffer(3, 2),
    buffer(3, 2), buffer(3, 2), buffer(3, 2), patternOffsets,
    patternCounts, patternDegrees, multiplicities, fullOffsets, fullCounts,
    fullDegrees, degreeState);
  assert.equal(degreeStatus, 0n, "row3 degree catalog failed");

  const selectedPrimes = buffer(primeCount, 2);
  const selectedIndices = buffer(capacity, 2);
  const offsets = buffer(65538, 2);
  const counts = buffer(65538, 2);
  const complete = buffer(65538, 2);
  const logD = discriminant.gmp(BigInt(prepared.analytic_discriminant));
  const answer = initial.gmp(
    3n, 3n, [Number(logD), 0, 0], primes, patternOffsets, patternCounts,
    patternDegrees, multiplicities, fullOffsets, fullCounts, fullDegrees,
    buffer(4, 2), Array(primeCount + 2).fill(0), [0, 0],
    Array(primeCount + 1).fill(0), selectedPrimes, offsets, counts, complete,
    selectedIndices);
  assert(Array.isArray(answer) && answer.length === 7,
    "row3 initial-base ABI changed");
  const [c1, c2, kc, kcz, kcz2, kc2, product] = answer.map(BigInt);
  assert.equal(kcz, kcz2, "row3 honesty-extension factor base is not closed");
  assert.equal(kc, kc2, "row3 relation/checking factor bases differ");
  assert(c2 <= 10007n, "row3 prime catalog ceiling is too short");
  const selectedRational = packedSlice(selectedPrimes, 0, Number(kcz2));
  const selectedDescriptorIndices = packedSlice(selectedIndices, 0, Number(kc2));

  // Continue the live dependency graph through FBgen's requested Kummer
  // descriptor catalog and the selected prime-ideal packets.  All capacities
  // are public functions of the neutral prime-table length and degree.
  const randomState = buffer(66, 2);
  randomSeed.gmp(randomState, 1n);
  const catalogPrimes = buffer(capacity, 2);
  const catalogE = buffer(capacity, 2);
  const catalogF = buffer(capacity, 2);
  const catalogInert = buffer(capacity, 2);
  const catalogGenerators = buffer(capacity * 3, 16);
  const catalogTau = buffer(capacity * 9, 32);
  const requestedCounts = buffer(primeCount, 2);
  const catalogState = buffer(4, 2);
  const written = catalog.gmp(
    primes, patternOffsets, patternCounts, patternDegrees, multiplicities,
    fullOffsets, BigInt(primeCount), c2,
    buffer(4, 8, prepared.prep_polynomial),
    buffer(9, 16, prepared.prep_invzk), buffer(9, 16, prepared.prep_zk),
    buffer(3, 4, prepared.prep_zk_degrees),
    buffer(27, 16, prepared.basis_table), 3n, 1n,
    BigInt(prepared.prep_zkden), randomState,
    buffer(16994, 32), buffer(4, 16), buffer(3, 16), buffer(1, 16),
    buffer(64, 16), buffer(3, 16), buffer(3, 16), buffer(6, 16),
    buffer(3, 16), buffer(3, 16), buffer(12, 32), buffer(25, 32),
    buffer(3, 16), buffer(9, 32), buffer(12, 16), buffer(57, 32),
    buffer(9, 16), buffer(3, 2), buffer(3, 2), buffer(2, 2),
    buffer(57, 32), buffer(3, 2), catalogPrimes, catalogE, catalogF,
    catalogInert, catalogGenerators, catalogTau, requestedCounts, catalogState);
  assert.equal(written, kc, "row3 generated descriptor count mismatch");
  const catalogCount = Number(packedAt(degreeState, 3));
  const packetIdeals = buffer(Number(kc) * 9, 32);
  const packetNorms = buffer(Number(kc), 16);
  const packetCount = packets.gmp(
    buffer(27, 16, prepared.basis_table), catalogPrimes, catalogF,
    catalogInert, catalogGenerators, BigInt(catalogCount), selectedIndices, kc,
    3n, buffer(3, 16), buffer(9, 16), buffer(9, 16), buffer(3, 2),
    buffer(9, 16), packetIdeals, packetNorms);
  assert.equal(packetCount, kc, "row3 selected ideal packet count mismatch");
  const relationPrimes = buffer(Number(kc), 2);
  const ramification = buffer(Number(kc), 2);
  const residueDegrees = buffer(Number(kc), 2);
  const inertFlags = buffer(Number(kc), 2);
  const selectedTau = buffer(Number(kc) * 9, 32);
  const metadataCount = metadata.gmp(
    catalogPrimes, catalogE, catalogF, catalogInert, catalogTau,
    BigInt(catalogCount), selectedIndices, kc, 3n, relationPrimes,
    ramification, residueDegrees, inertFlags, selectedTau);
  assert.equal(metadataCount, kc, "row3 selected metadata count mismatch");
  const descriptors = Array.from({ length: Number(kc) }, (_, position) => {
    const index = Number(packedAt(selectedIndices, position));
    return { p: String(packedAt(catalogPrimes, index)),
      e: String(packedAt(catalogE, index)),
      f: String(packedAt(catalogF, index)),
      inert: String(packedAt(catalogInert, index)),
      generator: packedSlice(catalogGenerators, 3 * index, 3 * index + 3),
      tau: packedSlice(catalogTau, 9 * index, 9 * index + 9) };
  });
  const compactOffsets = selectedRational.map(prime =>
    String(packedAt(offsets, Number(prime))));
  const compactCounts = selectedRational.map(prime =>
    String(packedAt(counts, Number(prime))));
  const compactComplete = selectedRational.map(prime =>
    String(packedAt(complete, Number(prime))));
  const bad = buffer(Number(kc), 2);
  badFlags.gmp(buffer(compactOffsets.length, 2, compactOffsets),
    buffer(compactCounts.length, 2, compactCounts),
    buffer(compactComplete.length, 2, compactComplete), kcz,
    kc, bad);
  const productLimit = subfactorProduct.gmp(3n, 0n, Number(logD), c2);
  const permutation = buffer(Number(kc), 2);
  const chosen = buffer(Number(kc), 2);
  const rejected = buffer(Number(kc), 2);
  const subfactorAnswer = subfactor.gmp(packetNorms, bad, [Number(productLimit)],
    3n, buffer(Number(kc), 2), buffer(Number(kc), 2),
    buffer(3 * Number(kc) + 3, 2), chosen, rejected, permutation);
  assert(Array.isArray(subfactorAnswer) && subfactorAnswer.length === 3,
    "row3 subfactor ABI changed");
  const [subfactorCount, relationTrials, dependencyTrials] =
    subfactorAnswer.map(BigInt);
  const additional = 7;
  const target = Number(kc) + additional;
  const relationCapacity = 10 * target + 50;
  const relationState = buffer(6, 2);
  const relationBasis = buffer(Number(kc) * Number(kc), 2);
  const relationRecords = buffer(relationCapacity * Number(kc), 2);
  const relationHashes = buffer(relationCapacity, 2);
  const relationMetadata = buffer(relationCapacity * 3, 2);
  const relationScratch = buffer(Number(kc), 2);
  const relation = buffer(Number(kc), 2);
  const relationGenerators = buffer(relationCapacity * 3, 2);
  const initialCount = initializeRelations.gmp(
    BigInt(additional), buffer(compactOffsets.length, 2, selectedRational),
    buffer(compactOffsets.length, 2, compactOffsets),
    buffer(compactCounts.length, 2, compactCounts),
    buffer(compactComplete.length, 2, compactComplete), ramification,
    relationState, relationBasis, relationRecords, relationHashes,
    relationMetadata, relation, relationScratch, 3n, relationGenerators);
  const initialRelations = Array.from({ length: Number(initialCount) }, (_, column) => {
    const entries = [];
    for (let row = 0; row < Number(kc); row += 1) {
      const value = packedAt(relationRecords, column * Number(kc) + row);
      if (value !== 0n) entries.push([row, String(value)]);
    }
    return { entries, sourceNz: String(packedAt(relationHashes, column)),
      metadata: packedSlice(relationMetadata, 3 * column, 3 * column + 3),
      generator: packedSlice(relationGenerators, 3 * column, 3 * column + 3) };
  });
  const relationBasisEntries = [];
  for (let column = 0; column < Number(kc); column += 1)
    for (let row = 0; row < Number(kc); row += 1) {
      const value = packedAt(relationBasis, column * Number(kc) + row);
      if (value !== 0n) relationBasisEntries.push([column, row, String(value)]);
    }
  const owner = {
    schema: SCHEMA,
    authority: {
      preparedSha256: authority.sha256,
      degreeSourceSha256: sha(fs.readFileSync(SOURCES.degree)),
      discriminantSourceSha256: sha(fs.readFileSync(SOURCES.discriminant)),
      initialSourceSha256: sha(fs.readFileSync(SOURCES.initial)),
      degreeCoreSha256: sha(fs.readFileSync(degreeBuilt.coreSourcePath)),
      discriminantCoreSha256: sha(fs.readFileSync(discriminantBuilt.coreSourcePath)),
      initialCoreSha256: sha(fs.readFileSync(initialBuilt.coreSourcePath)),
      catalogSourceSha256: sha(fs.readFileSync(SOURCES.catalog)),
      packetsSourceSha256: sha(fs.readFileSync(SOURCES.packets)),
      metadataSourceSha256: sha(fs.readFileSync(SOURCES.metadata)),
      randomSourceSha256: sha(fs.readFileSync(SOURCES.random)),
      badSourceSha256: sha(fs.readFileSync(SOURCES.bad)),
      subfactorProductSourceSha256: sha(fs.readFileSync(SOURCES.subfactorProduct)),
      subfactorSourceSha256: sha(fs.readFileSync(SOURCES.subfactor)),
      relationsSourceSha256: sha(fs.readFileSync(SOURCES.relations)),
    },
    field: { id: FIELD_ID, polynomial: [...prepared.prep_polynomial],
      discriminant: prepared.analytic_discriminant, degree: "3",
      signature: ["3", "0"], equationIndex: prepared.prep_index,
      precision: prepared.precision },
    bounds: { C1: String(c1), C2: String(c2), KC: String(kc),
      KCZ: String(kcz), KCZ2: String(kcz2), KC2: String(kc2),
      prodZ: String(product) },
    degreeCatalog: { primeCount: String(primeCount),
      terminalPrime: String(primesRawPrefix.at(-1)),
      state: packedSlice(degreeState, 0, 4) },
    factorSelection: { rationalPrimes: selectedRational,
      selectedDescriptorIndices, descriptors,
      ideals: Array.from({ length: Number(kc) }, (_, index) =>
        packedSlice(packetIdeals, 9 * index, 9 * index + 9)),
      norms: packedSlice(packetNorms, 0, Number(kc)),
      relationPrimes: packedSlice(relationPrimes, 0, Number(kc)),
      ramification: packedSlice(ramification, 0, Number(kc)),
      residueDegrees: packedSlice(residueDegrees, 0, Number(kc)),
      inertFlags: packedSlice(inertFlags, 0, Number(kc)),
      selectedTau: packedSlice(selectedTau, 0, Number(kc) * 9),
      catalogState: packedSlice(catalogState, 0, 4),
      rngState: packedSlice(randomState, 0, 66),
      groupOffsets: compactOffsets, groupCounts: compactCounts,
      groupComplete: compactComplete,
      badFlags: packedSlice(bad, 0, Number(kc)),
      permutation: packedSlice(permutation, 0, Number(kc)),
      subfactor: packedSlice(chosen, 0, Number(subfactorCount)),
      subfactorPolicy: { count: String(subfactorCount),
        relationTrials: String(relationTrials),
        dependencyTrials: String(dependencyTrials),
        productLimit: String(productLimit) },
      initialRelations: { count: String(initialCount), target: String(target),
        additional: String(additional), capacity: String(relationCapacity),
        state: packedSlice(relationState, 0, 6), basisEntries: relationBasisEntries,
        records: initialRelations } },
    provenance: { inputPolicy: "authenticated-prepared-nf-only",
      frozenAnswerInputs: false,
      runtimeInputs: ["neutral exhaustive prime table through 10007"],
      unsupportedNextDependency:
        "small-norm relation collection from 116 through 675 relations" },
    publication: { initialBaseComplete: true, factorDescriptorsComplete: true,
      factorIdealsComplete: true, initialRelationsComplete: true,
      relationsComplete: false, hnfComplete: false,
      acceptanceComplete: false,
      correspondenceComplete: false, publicComplete: false },
  };
  verifyOwner(owner);
  return Object.freeze(owner);
}

module.exports = { FIELD_ID, PREPARED_SHA256, SCHEMA, run, verifyOwner };
