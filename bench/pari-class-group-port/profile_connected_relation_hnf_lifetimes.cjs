"use strict";

// Static compiler/lifetime ledger for one already-generated, same-work kernel.
// This does not alter or instrument compiler output.  The optional input export
// is used only to size the owners passed to the resident root.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const [coreArgument, manifestArgument, inputArgument] = process.argv.slice(2);
assert(coreArgument && manifestArgument, "usage: node profile_connected_relation_hnf_lifetimes.cjs CORE MANIFEST [INPUTS]");
const corePath = path.resolve(coreArgument);
const manifestPath = path.resolve(manifestArgument);
const core = fs.readFileSync(corePath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sourcePath = path.join(__dirname, "connected_relation_hnf.py");
const source = fs.readFileSync(sourcePath, "utf8");
const sha256 = value => createHash("sha256").update(value).digest("hex");
assert.equal(manifest.sourceHash, sha256(source), "generated kernel does not match connected_relation_hnf.py");

function count(text, expression) {
  return [...text.matchAll(expression)].length;
}

// Extract definitions, excluding the prototype block.  Generated functions use
// a deliberately simple C shape; brace matching is still used so code size is
// not inferred from source-map line spans.
const definitions = new Map();
const header = /^static int (native_[A-Za-z0-9_]+)\([^;]*?\)\s*\{/gm;
for (const match of core.matchAll(header)) {
  const open = match.index + match[0].lastIndexOf("{");
  let depth = 1, cursor = open + 1;
  while (depth && cursor < core.length) {
    if (core[cursor] === "{") depth++;
    else if (core[cursor] === "}") depth--;
    cursor++;
  }
  assert.equal(depth, 0, `unterminated generated function ${match[1]}`);
  definitions.set(match[1], core.slice(match.index, cursor));
}
const root = "native_pari_connected_relation_hnf";
assert(definitions.has(root), "missing resident relation/HNF root");
const calls = new Map();
for (const [name, body] of definitions) {
  calls.set(name, [...body.matchAll(/\b(native_[A-Za-z0-9_]+)\s*\(/g)]
    .map(match => match[1]).filter(callee => callee !== name && definitions.has(callee)));
}
const reachable = new Set([root]), pending = [root];
while (pending.length) {
  for (const callee of calls.get(pending.pop()) || []) if (!reachable.has(callee)) {
    reachable.add(callee); pending.push(callee);
  }
}
const bodies = [...reachable].map(name => definitions.get(name));
const graph = bodies.join("\n");
const callSites = [...reachable].reduce((total, name) => total + (calls.get(name) || []).length, 0);
const edges = new Set();
for (const caller of reachable) for (const callee of calls.get(caller) || [])
  if (reachable.has(callee)) edges.add(`${caller}->${callee}`);

const lifecycle = {
  fmpzInitSites: count(graph, /\bfmpz_init\s*\(/g),
  fmpzClearSites: count(graph, /\bfmpz_clear\s*\(/g),
  mpzInitSites: count(graph, /\bmpz_init(?:2|_set)?\s*\(/g),
  mpzClearSites: count(graph, /\bmpz_clear\s*\(/g),
};
const conversions = {
  integerBufferGetMpzSites: count(graph, /\bsagejs_integer_buffer_get_mpz\s*\(/g),
  integerBufferSetMpzSites: count(graph, /\bsagejs_integer_buffer_set_mpz\s*\(/g),
  mpzSetMachineSites: count(graph, /\bmpz_set_(?:si|ui|d)\s*\(/g),
  mpzGetMachineSites: count(graph, /\bmpz_get_(?:si|ui|d)\s*\(/g),
  mpzSetCopySites: count(graph, /\bmpz_set\s*\(/g),
};

let owners = null;
if (inputArgument) {
  const inputPath = path.resolve(inputArgument);
  const fixtureBytes = fs.readFileSync(inputPath);
  const fixture = JSON.parse(fixtureBytes);
  assert(fixture.inputs.length > 0, "profile expects frozen same-work inputs");
  const kinds = new Map(fixture.names);
  const signature = source.match(/def pari_connected_relation_hnf\(([\s\S]*?)\n\)/)[1]
    .trim().split("\n").map(line => line.trim().replace(/,$/, "").split(": "));
  const cases = fixture.inputs.map(original => {
    const raw = structuredClone(original), n = Number(raw.n);
    const ru = (n + Number(raw.admission_real_count)) / 2, kc = raw.relation.length;
    const cacheCapacity = Number(raw.relation_state[1]), hnfColumnCapacity = 128;
    const cap = Math.max(64, (kc + hnfColumnCapacity) ** 2, 7 * ru * (kc + hnfColumnCapacity));
    const primes = raw.admission_prime_counts.flatMap((count, prime) => Number(count) ? [String(prime)] : []);
    Object.assign(raw, { initial_additional: "2", initial_target: "400", initial_primes: primes,
      initial_offsets: primes.map(prime => raw.admission_prime_offsets[Number(prime)]),
      initial_counts: primes.map(prime => raw.admission_prime_counts[Number(prime)]), initial_complete: primes.map(() => "1"),
      hnf_k0: "0", hnf_original: Array(kc * cacheCapacity).fill("77"), chain_state: ["0", "77", "77", "77"],
      log_precision: "128", log_completed: ["0"], log_embeddings: Array(cacheCapacity * 7 * ru).fill("0"),
      log_coordinates: Array(n).fill("0"), log_column: Array(7 * ru).fill("0"), log_cache: Array(3).fill("0"),
      log_pi_cache: Array(3).fill("0"), log_a: Array(64).fill("0"), log_b: Array(64).fill("0"),
      log_p: Array(64).fill("0"), log_q: Array(64).fill("0"), log_stack: Array(128).fill("0") });
    for (const [name, kind] of signature) if (!(name in raw)) {
      assert(name.startsWith("hnf_") && kind !== "int", `input export lacks ${name}`);
      raw[name] = Array(cap).fill("77");
    }
    Object.assign(raw, { hnf_cup_arena: Array(160000).fill("77"), hnf_cup_frames: Array(32).fill("77"),
      hnf_cup_solve_state: Array(8).fill("77"), hnf_cup_state: Array(8).fill("77") });
    raw.hnf_perm = Array.from({ length: kc }, (_, index) => String(index + 1));
    let logicalLiveBytes = 0, fixedCapacityLiveBytes = 0, slots = 0;
    const byKind = {};
    for (const [name, kind] of signature) {
      assert(kinds.has(name) || name.startsWith("hnf_") || name.startsWith("log_") || name.startsWith("initial_") || name === "chain_state", name);
      if (!kind.endsWith("Buffer")) continue;
      const length = raw[name].length;
      slots += length;
      let logicalBytes, fixedBytes;
      if (kind === "IntegerBuffer") {
        logicalBytes = raw[name].reduce((sum, text) => {
          const value = BigInt(text), magnitude = value < 0n ? -value : value;
          const words = Math.max(1, Math.ceil(magnitude.toString(2).length / 64));
          return sum + 4 + 8 * words;
        }, 0);
        const words = name.startsWith("hnf_cup_") ? 4 : 64;
        fixedBytes = length * (4 + 8 * words);
      } else logicalBytes = fixedBytes = length * 8;
      logicalLiveBytes += logicalBytes;
      fixedCapacityLiveBytes += fixedBytes;
      const row = byKind[kind] || { owners: 0, slots: 0, logicalLiveBytes: 0, fixedCapacityLiveBytes: 0 };
      row.owners++; row.slots += length; row.logicalLiveBytes += logicalBytes;
      row.fixedCapacityLiveBytes += fixedBytes; byKind[kind] = row;
    }
    return { degree: n, bufferOwners: signature.filter(([, kind]) => kind.endsWith("Buffer")).length,
      slots, logicalLiveBytes, fixedCapacityLiveBytes, byKind };
  });
  owners = { inputSha256: sha256(fixtureBytes), cases,
    fixedCapacityPolicy: "64 limbs per IntegerBuffer slot; 4 for hnf_cup_*; 8 bytes per machine slot" };
}

const largestFunctions = [...reachable].map(name => ({ name, bytes: Buffer.byteLength(definitions.get(name)),
  mpzInitSites: count(definitions.get(name), /\bmpz_init(?:2|_set)?\s*\(/g),
  mpzClearSites: count(definitions.get(name), /\bmpz_clear\s*\(/g),
  internalCallSites: (calls.get(name) || []).length }))
  .sort((a, b) => b.bytes - a.bytes).slice(0, 20);
const report = {
  diagnosticOnly: true,
  integrationCommit: "944a1291113a51b366d293e00c7979c754eeee03",
  boundary: "Static sites in the generated arbitrary-precision native call graph reachable from pari_connected_relation_hnf; counts are sites, not dynamic executions.",
  sourceSha256: sha256(source), coreSha256: sha256(core), cacheKey: manifest.cacheKey,
  generatedCode: { wholeCoreBytes: Buffer.byteLength(core), reachableFunctionBytes: Buffer.byteLength(graph),
    totalNativeDefinitions: definitions.size, reachableFunctions: reachable.size, internalCallSites: callSites,
    uniqueInternalEdges: edges.size, hostNativeEntriesPerAttempt: 1, largestFunctions },
  lifecycle, conversions, owners,
  decision: {
    campaignJustified: lifecycle.mpzInitSites > 100 && lifecycle.mpzClearSites >= lifecycle.mpzInitSites && callSites > 100,
    qualification: "The requested fmpz counts are zero because this graph is emitted through the mpz_t native backend. The same lifetime concern exists as repeated mpz local initialization/clear and owner conversion sites.",
    proposal: "Authenticate one root-owned mpz scratch frame and replace per-callee exact temporaries only inside this reachable graph.",
    falsification: "Reject the campaign unless a generated-C A/B on the frozen input removes at least 75% of reachable mpz init/clear dynamic executions and improves relation-to-HNF kernel CPU time by at least 3x, with identical owner state and output after every frozen prefix.",
  },
};
console.log(JSON.stringify(report, null, 2));
