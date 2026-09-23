"use strict";

// Authenticated prepared field -> immutable row-23 factor-base transaction.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const HERE = __dirname;
const SOURCE = path.join(HERE, "row23_factor_base.py");
const SHARED_SOURCE = path.join(HERE, "row21_factor_base.py");
const INDEX_SOURCE = path.join(HERE, "row23_index_prime_packet.py");
const SCHEMA = "sagejs.pari-class-group/row23-prepared-factor-base-v1";
const PREPARED_SHA256 = "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299";
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
  const destination = path.join(directory, `row23-prepared-factor-base-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256: sha(compressed),
    bytes: plain.length, compressedBytes: compressed.length };
}

async function run(payload) {
  if (!payload || canonical(Object.keys(payload).sort()) !==
      canonical(["outputDirectory", "prepared", "preparedAuthoritySha256"]))
    throw new Error("unreviewed row23 factor-base payload");
  const auth = require("./prepared_nf_authentication.cjs");
  const authority = auth.authenticatePreparedNf(payload.prepared);
  if (authority.sha256 !== PREPARED_SHA256 ||
      payload.preparedAuthoritySha256 !== PREPARED_SHA256)
    throw new Error("row23 prepared authority changed");
  const p = payload.prepared;
  if (p.n !== "5" || p.prep_index !== "131" || p.admission_real_count !== "5")
    throw new Error("row23 prepared identity changed");

  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const [built, sharedBuilt, indexBuilt] = await Promise.all([
    compileKernel({ sourcePath: SOURCE }),
    compileKernel({ sourcePath: SHARED_SOURCE }),
    compileKernel({ sourcePath: INDEX_SOURCE }),
  ]);
  const row23 = require(built.modulePath);
  const shared = require(sharedBuilt.modulePath);
  const indexModule = require(indexBuilt.modulePath);
  const factor = shared.pari_row21_quintic_factor_degrees;
  const initial = shared.pari_row21_initial_base;
  const hnf = shared.pari_row21_prime_ideal_hnf;
  const subfactor = shared.pari_row21_subfactor_base;
  const descriptorsFn = row23.pari_row23_prime_descriptors;
  const indexPacket = indexModule.pari_row23_index_prime_packet;
  for (const fn of [factor, initial, hnf, subfactor, descriptorsFn, indexPacket])
    if (!fn.nativeAvailable) throw new Error("row23 native function unavailable");
  const buffer = (length, words = 8, values) =>
    factor.createIntegerBuffer(length, words, values?.map(BigInt));
  const polynomial = buffer(6, 8, p.prep_polynomial);
  const invzk = buffer(25, 16, p.prep_invzk);
  const table = buffer(125, 16, p.basis_table);
  const matrixM = buffer(25, 16, p.admission_matrix_m);
  const matrixP = buffer(25, 4, p.admission_matrix_p);
  const matrixE = buffer(25, 16, p.admission_matrix_e);
  const runtime = p.admission_primes.map(Number);
  let primeCount = runtime.findIndex(value => value > 257);
  if (primeCount < 0) throw new Error("row23 neutral prime catalog has no 257 sentinel");
  primeCount += 1;
  const primes = runtime.slice(0, primeCount);
  const patternOffsets = [], patternCounts = [], patternDegrees = [], multiplicities = [];
  const fullOffsets = [], fullCounts = [], fullDegrees = [];
  const decomposition = new Map();
  const descriptorWorkspace = buffer(12000, 32);

  const indexDescriptors = buffer(5 * 33, 32), indexRanks = buffer(5, 4);
  const indexIdeals = buffer(125, 16), indexNorms = buffer(5, 16);
  const indexState = buffer(5, 4);
  const indexCount = Number(indexPacket.gmp(table, matrixM, matrixP, matrixE,
    buffer(12600, 32), indexDescriptors, indexRanks, indexIdeals, indexNorms, indexState));
  const indexPacked = packedSlice(indexDescriptors, 0, indexCount * 33);
  decomposition.set(131, { count: indexCount, packed: indexPacked,
    ideals: Array.from({ length: indexCount }, (_, i) =>
      packedSlice(indexIdeals, i * 25, (i + 1) * 25)) });

  for (const prime of primes) {
    fullOffsets.push(fullDegrees.length);
    patternOffsets.push(patternDegrees.length);
    let degrees, exponents;
    if (prime === 131) {
      degrees = Array.from({ length: indexCount }, (_, i) => Number(indexPacked[i * 33 + 2]));
      exponents = Array.from({ length: indexCount }, (_, i) => Number(indexPacked[i * 33 + 1]));
    } else {
      const degreeOut = buffer(5, 2), exponentOut = buffer(5, 2), state = buffer(3, 2);
      const count = Number(factor.gmp(polynomial, BigInt(prime), degreeOut, exponentOut,
        buffer(32, 8), state));
      degrees = packedSlice(degreeOut, 0, count).map(Number);
      exponents = packedSlice(exponentOut, 0, count).map(Number);
    }
    fullCounts.push(degrees.length); fullDegrees.push(...degrees);
    for (let i = 0; i < degrees.length; i += 1) {
      if (i === 0 || patternDegrees.at(-1) !== degrees[i]) {
        patternDegrees.push(degrees[i]); multiplicities.push(1);
      } else multiplicities[multiplicities.length - 1] += 1;
    }
    patternCounts.push(patternDegrees.length - patternOffsets.at(-1));
  }
  const b = (values, words = 4) => buffer(values.length, words, values);
  const selectedPrimes = buffer(primeCount, 4), offsets = buffer(258, 4);
  const counts = buffer(258, 4), complete = buffer(258, 4);
  const baseState = buffer(8, 16), configuration = [0, 0, 0];
  initial.gmp(BigInt(p.analytic_discriminant), 5n, b(primes), b(patternOffsets),
    b(patternCounts), b(patternDegrees), b(multiplicities), b(fullOffsets),
    b(fullCounts), b(fullDegrees), configuration, buffer(6, 4),
    Array(primeCount + 2).fill(0), [0, 0], Array(primeCount + 1).fill(0),
    selectedPrimes, offsets, counts, complete, buffer(fullDegrees.length, 4), baseState);
  const state = packedSlice(baseState, 0, 8).map(BigInt);
  const [c1, c2, kc, kcz, kcz2, kc2] = state.slice(0, 6).map(Number);
  if (state[7] !== 1n || kcz !== kcz2 || kc !== kc2 || c2 >= 131 || c2 >= primes.at(-1))
    throw new Error("row23 initial-base publication failed");

  const selectedRational = packedSlice(selectedPrimes, 0, kcz2).map(Number);
  const selected = [];
  for (const prime of selectedRational) {
    let value = decomposition.get(prime);
    if (!value) {
      const packed = buffer(5 * 33, 32), ranks = buffer(5, 4), descriptorState = buffer(4, 4);
      const limit = Math.min(2, Math.floor(Math.log(c2 + 0.5) / Math.log(prime)));
      const count = Number(descriptorsFn.gmp(polynomial, invzk, table, BigInt(prime),
        BigInt(limit), descriptorWorkspace, packed, ranks, descriptorState));
      value = { count, packed: packedSlice(packed, 0, count * 33) };
      decomposition.set(prime, value);
    }
    const needed = Number(packedAt(counts, prime));
    if (needed < 1 || needed > value.count) throw new Error("row23 descriptor prefix mismatch");
    for (let j = 0; j < needed; j += 1) selected.push(value.packed.slice(j * 33, (j + 1) * 33));
  }
  if (selected.length !== kc) throw new Error("row23 selected descriptor count mismatch");
  const ideals = [], norms = [];
  for (const record of selected) {
    const prime = Number(record[0]), cached = decomposition.get(prime);
    let ideal;
    if (prime === 131 && cached.ideals) ideal = cached.ideals[selected.filter(
      earlier => Number(earlier[0]) === 131).length - 1];
    else {
      const output = buffer(25, 16);
      hnf.gmp(table, b(record.slice(3, 8), 16), BigInt(prime), buffer(25, 16),
        buffer(25, 16), buffer(5, 4), output);
      ideal = packedSlice(output, 0, 25);
    }
    ideals.push(ideal);
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
    b(groupComplete), BigInt(kcz), 0n, configuration[0], BigInt(c2), buffer(kc, 4),
    [0], buffer(kc, 4), buffer(kc, 4), buffer(3 * kc + 3, 4), buffer(kc, 4),
    buffer(kc, 4), permutation, subState));
  const perm = packedSlice(permutation, 0, kc);
  const owner = {
    schema: SCHEMA,
    authority: { preparedSha256: authority.sha256, sourceSha256: sha(fs.readFileSync(SOURCE)),
      sharedSourceSha256: sha(fs.readFileSync(SHARED_SOURCE)),
      indexPacketSourceSha256: sha(fs.readFileSync(INDEX_SOURCE)),
      coreSha256: sha(fs.readFileSync(built.coreSourcePath)),
      sharedCoreSha256: sha(fs.readFileSync(sharedBuilt.coreSourcePath)),
      indexPacketCoreSha256: sha(fs.readFileSync(indexBuilt.coreSourcePath)) },
    field: { polynomial: p.prep_polynomial, discriminant: p.analytic_discriminant,
      degree: "5", signature: ["5", "0"], precision: p.precision },
    bounds: { C1: String(c1), C2: String(c2), KC: String(kc), KCZ: String(kcz),
      KCZ2: String(kcz2), KC2: String(kc2), prodZ: String(state[6]) },
    factorBase: { rationalPrimes: selectedRational.map(String), descriptors: selected,
      ideals, norms, permutation: perm, subfactor: perm.slice(0, subcount),
      subfactorState: packedSlice(subState, 0, 4) },
    indexPrimePacket: { prime: "131", descriptorCount: String(indexCount),
      descriptorSha256: sha(Buffer.from(canonical(indexPacked))),
      idealSha256: sha(Buffer.from(canonical(decomposition.get(131).ideals))) },
    provenance: { inputPolicy: "authenticated-prepared-nf-only", frozenAnswerInputs: false,
      catalogCeiling: "257", terminalPrime: String(primes.at(-1)),
      orderingPolicy: "computed-kummer-order; compare oracle ideals as per-prime sets" },
  };
  return { ...publish(payload.outputDirectory, owner), owner };
}

module.exports = { PREPARED_SHA256, SCHEMA, run };

if (require.main === module) {
  let text = ""; process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { text += chunk; });
  process.stdin.on("end", () => run(JSON.parse(text)).then(result => {
    process.stdout.write(`${JSON.stringify({ ...result, owner: undefined })}\n`);
  }).catch(error => { console.error(error); process.exitCode = 1; }));
}
