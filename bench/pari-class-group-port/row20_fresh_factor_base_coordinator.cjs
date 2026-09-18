"use strict";

// Authenticated prepared-field -> fresh row-20 factor-base transaction.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const HERE = __dirname;
const SOURCE = path.join(HERE, "row21_factor_base.py");
const INDEX_SOURCE = path.join(HERE, "prepared_index_prime.py");
const SCHEMA = "sagejs.pari-class-group/row20-fresh-prepared-factor-base-v1";
const PREPARED_SHA256 = "15ecf1209df2e48bd8a9e5ad75bc6dac0598d513bc6a06b7712ccfc255febbc6";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value);

function packedAt(buffer, index) {
  const signedWords = buffer.sizes[index], words = Math.abs(signedWords);
  let value = 0n;
  for (let word = words - 1; word >= 0; word -= 1)
    value = (value << 64n) + buffer.limbs[index * buffer.wordCapacity + word];
  return signedWords < 0 ? -value : value;
}
function packedSlice(buffer, start, end) {
  return Array.from({ length: end - start }, (_, i) => String(packedAt(buffer, start + i)));
}
function publish(directory, owner) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`), ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const destination = path.join(directory, `row20-fresh-prepared-factor-base-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256: sha(compressed),
    bytes: plain.length, compressedBytes: compressed.length };
}

async function runResident(payload) {
  if (!payload || ![
    ["prepared", "preparedAuthoritySha256"],
    ["prepared", "preparedAuthoritySha256", "sourceAuthority"],
    ["prepared", "preparedAuthoritySha256", "residentKernels", "sourceAuthority"],
  ].some(keys => JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(keys)))
    throw new Error("unreviewed row20 factor-base payload");
  const auth = require("./prepared_nf_authentication.cjs");
  const authority = auth.authenticatePreparedNf(payload.prepared);
  if (authority.sha256 !== PREPARED_SHA256 ||
      payload.preparedAuthoritySha256 !== PREPARED_SHA256)
    throw new Error("row20 prepared authority changed");
  const p = payload.prepared;
  if (p.n !== "5" || p.prep_index !== "8" || p.admission_real_count !== "1")
    throw new Error("row20 prepared identity changed");

  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const [built, indexBuilt] = payload.residentKernels ?
    [payload.residentKernels.factorBuilt, payload.residentKernels.indexBuilt] :
    await Promise.all([
      compileKernel({ sourcePath: SOURCE }),
      compileKernel({ sourcePath: INDEX_SOURCE }),
    ]);
  if (!built?.modulePath || !indexBuilt?.modulePath)
    throw new Error("invalid row20 resident factor kernels");
  const module = require(built.modulePath);
  const factor = module.pari_row21_quintic_factor_degrees;
  const descriptorsFn = module.pari_row21_prime_descriptors;
  const initial = module.pari_row21_initial_base;
  const hnf = module.pari_row21_prime_ideal_hnf;
  const subfactor = module.pari_row21_subfactor_base;
  const indexDescriptorsFn = require(indexBuilt.modulePath)
    .pari_prepared_index_prime_descriptors;
  for (const fn of [factor, descriptorsFn, indexDescriptorsFn, initial, hnf, subfactor])
    if (!fn.nativeAvailable) throw new Error("row20 native function unavailable");
  const buffer = (length, words = 8, values) =>
    factor.createIntegerBuffer(length, words, values?.map(BigInt));
  const polynomial = buffer(6, 8, p.prep_polynomial);
  const table = buffer(125, 16, p.basis_table);
  const matrixM = buffer(25, 16, p.admission_matrix_m);
  const matrixP = buffer(25, 4, p.admission_matrix_p);
  const matrixE = buffer(25, 16, p.admission_matrix_e);
  const runtime = p.admission_primes.map(Number);
  let primeCount = runtime.findIndex(value => value > 257);
  if (primeCount < 0) throw new Error("row20 neutral prime catalog has no 257 sentinel");
  primeCount += 1;
  const primes = runtime.slice(0, primeCount);
  const patternOffsets = [], patternCounts = [], patternDegrees = [], multiplicities = [];
  const fullOffsets = [], fullCounts = [], fullDegrees = [];
  const decomposition = new Map();
  const descriptorWorkspace = buffer(12000, 32);
  for (const prime of primes) {
    fullOffsets.push(fullDegrees.length);
    patternOffsets.push(patternDegrees.length);
    let degrees, exponents;
    if (8 % prime === 0) {
      const packed = buffer(5 * 33, 32), ranks = buffer(5, 4), state = buffer(4, 4);
      const count = Number(indexDescriptorsFn.gmp(table, 5n, BigInt(prime), 1n,
        matrixM, matrixP, matrixE, descriptorWorkspace, packed, ranks, state));
      const values = packedSlice(packed, 0, count * 33);
      decomposition.set(prime, { count, packed: values });
      degrees = Array.from({ length: count }, (_, i) => Number(values[i * 33 + 2]));
      exponents = Array.from({ length: count }, (_, i) => Number(values[i * 33 + 1]));
    } else {
      const degreeOut = buffer(5, 2), exponentOut = buffer(5, 2), state = buffer(3, 2);
      const count = Number(factor.gmp(polynomial, BigInt(prime), degreeOut, exponentOut,
        buffer(32, 8), state));
      degrees = packedSlice(degreeOut, 0, count).map(Number);
      exponents = packedSlice(exponentOut, 0, count).map(Number);
    }
    fullCounts.push(degrees.length); fullDegrees.push(...degrees);
    for (let i = 0; i < degrees.length; i += 1) {
      const previous = patternDegrees.at(-1);
      if (i === 0 || previous !== degrees[i]) {
        patternDegrees.push(degrees[i]); multiplicities.push(1);
      } else multiplicities[multiplicities.length - 1] += 1;
    }
    patternCounts.push(patternDegrees.length - patternOffsets.at(-1));
  }
  const b = (values, words = 4) => buffer(values.length, words, values);
  const primesB = b(primes), po = b(patternOffsets), pc = b(patternCounts);
  const pd = b(patternDegrees), pm = b(multiplicities), fo = b(fullOffsets);
  const fc = b(fullCounts), fd = b(fullDegrees);
  const selectedPrimes = buffer(primeCount, 4), offsets = buffer(258, 4);
  const counts = buffer(258, 4), complete = buffer(258, 4);
  const selectedIndices = buffer(fullDegrees.length, 4), baseState = buffer(8, 16);
  const configuration = [0, 0, 0];
  initial.gmp(BigInt(p.analytic_discriminant), 3n, primesB, po, pc, pd, pm, fo, fc, fd,
    configuration, buffer(6, 4), Array(primeCount + 2).fill(0), [0, 0],
    Array(primeCount + 1).fill(0), selectedPrimes, offsets, counts, complete,
    selectedIndices, baseState);
  const state = packedSlice(baseState, 0, 8).map(BigInt);
  const [c1, c2, kc, kcz, kcz2, kc2] = state.slice(0, 6).map(Number);
  if (state[7] !== 1n || kcz !== kcz2 || kc !== kc2 || c2 >= primes.at(-1))
    throw new Error("row20 initial-base publication failed");

  const selectedRational = packedSlice(selectedPrimes, 0, kcz2).map(Number);
  const selected = [];
  for (const prime of selectedRational) {
    let value = decomposition.get(prime);
    if (!value) {
      const packed = buffer(5 * 33, 32), ranks = buffer(5, 4), descriptorState = buffer(4, 4);
      const limit = Math.min(3, Math.floor(Math.log(c2 + 0.5) / Math.log(prime)));
      const fullCount = Number(indexDescriptorsFn.gmp(table, 5n, BigInt(prime), 1n,
        matrixM, matrixP, matrixE, descriptorWorkspace, packed, ranks,
        descriptorState));
      const eligible = Array.from({ length: fullCount }, (_, index) =>
        packedSlice(packed, index * 33, (index + 1) * 33))
        .filter(record => Number(record[2]) <= limit);
      value = { count: eligible.length, packed: eligible.flat() };
      decomposition.set(prime, value);
    }
    const needed = Number(packedAt(counts, prime));
    if (needed < 1 || needed > value.count) throw new Error("row20 descriptor prefix mismatch");
    for (let j = 0; j < needed; j += 1) {
      const record = value.packed.slice(j * 33, (j + 1) * 33);
      if (Number(record[0]) !== prime) throw new Error("row20 descriptor prime mismatch");
      selected.push(record);
    }
  }
  if (selected.length !== kc) throw new Error("row20 selected descriptor count mismatch");
  const ideals = [], norms = [];
  const hnfForGenerator = (prime, values) => {
    const output = buffer(25, 16);
    hnf.gmp(table, b(values, 16), BigInt(prime), buffer(25, 16), buffer(25, 16),
      buffer(5, 4), output);
    return packedSlice(output, 0, 25);
  };
  for (const record of selected) {
    ideals.push(hnfForGenerator(Number(record[0]), record.slice(3, 8)));
    norms.push((BigInt(record[0]) ** BigInt(record[2])).toString());
  }
  const groupOffsets = [], groupSizes = [], groupComplete = [];
  for (const prime of selectedRational) {
    groupOffsets.push(Number(packedAt(offsets, prime)));
    groupSizes.push(Number(packedAt(counts, prime)));
    groupComplete.push(Number(packedAt(complete, prime)));
  }
  const permutation = buffer(kc, 4), subState = buffer(4, 4);
  const subcount = Number(subfactor.gmp(b(norms, 8), b(groupOffsets), b(groupSizes),
    b(groupComplete), BigInt(kcz), 1n, configuration[0], BigInt(c2), buffer(kc, 4),
    [0], buffer(kc, 4), buffer(kc, 4), buffer(3 * kc + 3, 4), buffer(kc, 4),
    buffer(kc, 4), permutation, subState));
  const perm = packedSlice(permutation, 0, kc);
  const sourceAuthority = payload.sourceAuthority || {
    sourceSha256: sha(fs.readFileSync(SOURCE)),
    indexSourceSha256: sha(fs.readFileSync(INDEX_SOURCE)),
    coreSha256: sha(fs.readFileSync(built.coreSourcePath)),
    indexCoreSha256: sha(fs.readFileSync(indexBuilt.coreSourcePath)),
  };
  if (Object.keys(sourceAuthority).sort().join(",") !==
      "coreSha256,indexCoreSha256,indexSourceSha256,sourceSha256" ||
      Object.values(sourceAuthority).some(value => !/^[0-9a-f]{64}$/.test(value)))
    throw new Error("invalid row20 resident source authority");
  const owner = {
    schema: SCHEMA,
    authority: { preparedSha256: authority.sha256, ...sourceAuthority },
    field: { polynomial: p.prep_polynomial, discriminant: p.analytic_discriminant,
      degree: "5", signature: ["1", "2"], precision: p.precision },
    bounds: { C1: String(c1), C2: String(c2), KC: String(kc), KCZ: String(kcz),
      KCZ2: String(kcz2), KC2: String(kc2), prodZ: String(state[6]) },
    factorBase: { rationalPrimes: selectedRational.map(String), descriptors: selected,
      ideals, norms, permutation: perm, subfactor: perm.slice(0, subcount),
      subfactorState: packedSlice(subState, 0, 4) },
    provenance: { inputPolicy: "authenticated-prepared-nf-only",
      frozenAnswerInputs: false, catalogCeiling: "257", terminalPrime: String(primes.at(-1)) },
  };
  return { owner, ownerSha256: sha(Buffer.from(`${canonical(owner)}\n`)) };
}

async function run(payload) {
  if (!payload || JSON.stringify(Object.keys(payload).sort()) !==
      JSON.stringify(["outputDirectory", "prepared", "preparedAuthoritySha256"]))
    throw new Error("unreviewed row20 factor-base payload");
  const resident = await runResident({ prepared: payload.prepared,
    preparedAuthoritySha256: payload.preparedAuthoritySha256 });
  return { ...publish(payload.outputDirectory, resident.owner), owner: resident.owner };
}

module.exports = { PREPARED_SHA256, SCHEMA, run, runResident };

if (require.main === module) {
  let text = ""; process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { text += chunk; });
  process.stdin.on("end", () => run(JSON.parse(text)).then(result => {
    process.stdout.write(`${JSON.stringify({ ...result, owner: undefined })}\n`);
  }).catch(error => { console.error(error); process.exitCode = 1; }));
}
