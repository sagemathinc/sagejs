"use strict";

// Independent, source-backed replay for the immutable row-14 output evidence.
// This module intentionally consumes the actual retained owners.  A digest of
// those owners, or a digest copied from the output-evidence envelope, is never
// accepted as a substitute for the equations below.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const flint = require("../../packages/flint");
const outputAdapter = require("./row14_class_unit_output_evidence_v2.cjs");
const proofApi = require("./row14_full_raw_smith_ancestry.cjs");

const FIXTURE = path.join(__dirname, "evidence", "row14-strict-v2");
const RESULT_PATH = path.join(FIXTURE, "correspondence.json.gz");
const ANCESTRY_PATH = path.join(FIXTURE, "full-ancestry.json.gz");
const METADATA_PATH = path.join(FIXTURE, "factor-metadata.json.gz");
const AUTHORITY_SHA256 = Object.freeze({
  result: Object.freeze({ compressed:
    "56eaa8390b3674597bbbfb4245edf3a40e9e119846bd7dc0d0a690e07a852d5e",
  plain: "edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2" }),
  ancestry: Object.freeze({ compressed:
    "cb4cca419fc99d9cf69468039d4833828ebeba652c7d635d080347780a2e6cd3",
  plain: "edcf30d39bef8b4be30f668f5245227ebeb74932c2756779a7013bccbdba0ef9" }),
  metadata: Object.freeze({ compressed:
    "56352e8cf74cfbd83b2035f8a9cee141d5833538eb81cf289de87afb83644ca1",
  plain: "7826088b03a22a7d902831da2add844d01dc8cceda1519ab4aed9702f6f3f568" }),
});
const ROWS = 806, COLUMNS = 799;

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = value => sha256(canonical(value));
function readAuthority(filename, expected, label) {
  const compressed = fs.readFileSync(filename);
  assert.equal(sha256(compressed), expected.compressed,
    `${label} compressed authority changed`);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha256(plain), expected.plain, `${label} authority changed`);
  return plain;
}
function owners(payload) {
  return new Map(payload.storage.map(value => [value.name, value.entries]));
}
function integers(values, length, label) {
  assert(Array.isArray(values) && values.length === length,
    `${label} changed shape`);
  return values.map((value, index) => {
    assert.equal(typeof value, "string", `${label}[${index}] is not a string`);
    const parsed = BigInt(value);
    assert.equal(String(parsed), value, `${label}[${index}] is not canonical`);
    return parsed;
  });
}
function sparseRows(values, rows, columns) {
  return Array.from({ length: rows }, (_, row) => {
    const result = [];
    for (let column = 0; column < columns; column++) {
      const value = values[row * columns + column];
      if (value !== 0n) result.push([column, value]);
    }
    return result;
  });
}
function replaySmith(U, R, V, D) {
  const sparseR = sparseRows(R, ROWS, COLUMNS);
  const sparseV = sparseRows(V, COLUMNS, COLUMNS);
  let checked = 0;
  for (let row = 0; row < ROWS; row++) {
    const ur = Array(COLUMNS).fill(0n);
    for (let relation = 0; relation < ROWS; relation++) {
      const coefficient = U[row * ROWS + relation];
      if (coefficient === 0n) continue;
      for (const [column, value] of sparseR[relation])
        ur[column] += coefficient * value;
    }
    const product = Array(COLUMNS).fill(0n);
    for (let inner = 0; inner < COLUMNS; inner++) {
      const coefficient = ur[inner];
      if (coefficient === 0n) continue;
      for (const [column, value] of sparseV[inner])
        product[column] += coefficient * value;
    }
    assert.deepEqual(product, D.slice(row * COLUMNS, (row + 1) * COLUMNS),
      `U R V = D row ${row}`);
    checked += COLUMNS;
  }
  return checked;
}
function presentationCoordinates(presentation, target) {
  const x2 = target[2] / presentation[8];
  if (x2 * presentation[8] !== target[2]) return null;
  const remainder1 = target[1] - presentation[7] * x2;
  const x1 = remainder1 / presentation[4];
  if (x1 * presentation[4] !== remainder1) return null;
  const remainder0 = target[0] - presentation[3] * x1 - presentation[6] * x2;
  const x0 = remainder0 / presentation[0];
  if (x0 * presentation[0] !== remainder0) return null;
  return [x0, x1, x2];
}
function replayClassWitnesses(map, relation) {
  const presentation = integers(map.get("class-presentation"), 9,
    "class presentation");
  const transform = integers(map.get("raw-to-presentation-transform"),
    3 * ROWS, "raw-to-presentation transform");
  const factorMap = integers(map.get("factor-map"), 3 * COLUMNS, "factor map");
  const witnesses = integers(map.get("class-order-principal-coefficients"),
    2 * ROWS, "class witnesses");
  const orders = [24n, 8n];
  const quotient = [[1n, 0n, 0n], [-2n, -1n, -1n]];
  let membershipChecks = 0, equationCells = 0;
  for (let generator = 0; generator < 2; generator++) {
    let coordinates = null;
    for (let multiple = 1n; multiple <= orders[generator]; multiple++) {
      const candidate = presentationCoordinates(presentation,
        quotient[generator].map(value => value * multiple));
      assert.equal(candidate !== null, multiple === orders[generator],
        `generator ${generator} has the wrong minimal order`);
      membershipChecks++;
      if (candidate) coordinates = candidate;
    }
    assert(coordinates);
    for (let raw = 0; raw < ROWS; raw++) {
      let expected = 0n;
      for (let column = 0; column < 3; column++)
        expected += transform[column * ROWS + raw] * coordinates[column];
      assert.equal(witnesses[generator * ROWS + raw], expected,
        `class witness ${generator} coefficient ${raw}`);
    }
    for (let factor = 0; factor < COLUMNS; factor++) {
      let actual = 0n, target = 0n;
      for (let raw = 0; raw < ROWS; raw++)
        actual += witnesses[generator * ROWS + raw] *
          relation[raw * COLUMNS + factor];
      for (let coordinate = 0; coordinate < 3; coordinate++)
        target += orders[generator] * quotient[generator][coordinate] *
          factorMap[coordinate * COLUMNS + factor];
      assert.equal(actual, target,
        `class witness ${generator} relation equation ${factor}`);
      equationCells++;
    }
  }
  return { equationCells, membershipChecks };
}
function replayCompactUnits(map, relation) {
  const kernel = integers(map.get("raw-to-unit-kernel-transform"), 7 * ROWS,
    "unit kernel");
  const compact = integers(map.get("compact-unit-transform"), 14,
    "compact unit transform");
  const factored = integers(map.get("factored-unit-transform"), 2 * ROWS,
    "factored unit transform");
  let compositionCells = 0, kernelCells = 0;
  for (let unit = 0; unit < 2; unit++) {
    for (let raw = 0; raw < ROWS; raw++) {
      let expected = 0n;
      for (let column = 0; column < 7; column++)
        expected += kernel[column * ROWS + raw] * compact[unit * 7 + column];
      assert.equal(factored[unit * ROWS + raw], expected,
        `compact unit ${unit} composition ${raw}`);
      compositionCells++;
    }
    for (let factor = 0; factor < COLUMNS; factor++) {
      let value = 0n;
      for (let raw = 0; raw < ROWS; raw++)
        value += factored[unit * ROWS + raw] * relation[raw * COLUMNS + factor];
      assert.equal(value, 0n, `compact unit ${unit} ideal equation ${factor}`);
      kernelCells++;
    }
  }
  return { compositionCells, kernelCells };
}

function replayTorsion(payload, map) {
  // f=x^4-A*x-A with A>0 has exactly two real roots.  Its derivative has the
  // unique real zero r=(A/4)^(1/3), and f(r)=-3*A*r/4-A<0, while f tends to
  // +infinity at both ends.  Thus K has a real embedding.  Every root of
  // unity maps to a real root of unity, hence is +/-1; the retained generator
  // is -1 and squares to 1 under the exact power-basis multiplication table.
  assert.deepEqual(payload.field.definingPolynomialAscending,
    ["-200000002", "-200000002", "0", "0", "1"]);
  const A = 200000002n;
  assert(A > 0n);
  const table = integers(map.get("field-multiplication-table"), 64,
    "field multiplication table");
  const multiply = (left, right) => Array.from({ length: 4 }, (_, output) => {
    let value = 0n;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      value += left[i] * right[j] * table[(i * 4 + j) * 4 + output];
    return value;
  });
  const minusOne = [-1n, 0n, 0n, 0n];
  assert.deepEqual(multiply(minusOne, minusOne), [1n, 0n, 0n, 0n]);
  return { exactRealRootCount: 2, realEmbedding: true,
    completenessArgument: "real-root-of-unity-is-plus-or-minus-one",
    generatorPowerBasis: minusOne.map(String), order: "2" };
}

function pythonReplay(resultPath, metadataPath) {
  const program = String.raw`import copy,gzip,hashlib,importlib,json,sys
correspondence=json.load(gzip.open(sys.argv[1],'rt'));metadata_receipt=json.load(gzip.open(sys.argv[2],'rt'))
p=correspondence['payload'];m={x['name']:x['entries'] for x in p['storage']}
metadata=metadata_receipt['metadata']
klass=importlib.import_module('bench.pari-class-group-port.row14_terminal_class_owner')
units=importlib.import_module('bench.pari-class-group-port.row14_rank2_c5_c6')
independent=importlib.import_module('bench.pari-class-group-port.independent_rich_quartic_class_replay')
signed=importlib.import_module('bench.pari-class-group-port.row14_signed_generator_witness')
records=tuple(map(int,m['raw-relation-records']));generators=tuple(map(int,m['principal-generators']))
principal=klass._authenticate_principals(records,generators,metadata)
bad=list(generators);bad[0]+=1
try: klass._authenticate_principals(records,tuple(bad),metadata)
except klass.Row14TerminalClassOwnerFailure: principal_mutation=True
else: principal_mutation=False
class_replay=independent.replay_rich_quartic_class(p)
bad=copy.deepcopy(p);next(x for x in bad['storage'] if x['name']=='class-generator-ideals')['entries'][0]=str(int(m['class-generator-ideals'][0])+1)
try: independent.replay_rich_quartic_class(bad)
except independent.RichQuarticClassReplayFailure: class_ideal_mutation=True
else: class_ideal_mutation=False
bad=copy.deepcopy(p);coeff=next(x for x in bad['storage'] if x['name']=='class-order-principal-coefficients')['entries'];coeff[0]=str(int(coeff[0])+1)
try: independent.replay_rich_quartic_class(bad)
except independent.RichQuarticClassReplayFailure: class_witness_mutation=True
else: class_witness_mutation=False
packed=list(map(int,m['terminal-C'][:147]));lattice=list(map(int,m['compact-unit-lattice']));regulator=list(map(int,m['regulator-enclosure']))
c5=units._c5(packed,lattice,regulator)
expected={'u':list(map(int,m['compact-unit-transform'])),'a':list(map(int,m['compact-archimedean-units'])),'factor':list(map(int,m['compact-getfu-factor'])),'candidateA':list(map(int,m['compact-getfu-candidate']))}
if any(c5[k]!=v for k,v in expected.items()): raise RuntimeError('compact C5 replay changed')
bad_packed=list(packed);bad_packed[0]+=1
try: bad_c5=units._c5(bad_packed,lattice,regulator); compact_mutation=any(bad_c5[k]!=v for k,v in expected.items())
except Exception: compact_mutation=True
signed_replay=signed.replay_row14_signed_generator_witness(correspondence,metadata_receipt)
bad_signed=copy.deepcopy(correspondence);signed_ideal=next(x for x in bad_signed['payload']['storage'] if x['name']=='class-generator-ideals')['entries'];signed_ideal[0]=str(int(signed_ideal[0])+1)
bad_signed['payloadSha256']=hashlib.sha256(json.dumps(bad_signed['payload'],separators=(',',':'),sort_keys=True).encode()).hexdigest()
try: signed.replay_row14_signed_generator_witness(bad_signed,metadata_receipt)
except signed.Row14SignedGeneratorWitnessFailure: signed_mutation=True
else: signed_mutation=False
print(json.dumps({'principal':principal,'classReplay':class_replay,'signedGeneratorReplay':signed_replay,'signedGeneratorMutationRejected':signed_mutation,'principalMutationRejected':principal_mutation,'classIdealMutationRejected':class_ideal_mutation,'classWitnessMutationRejected':class_witness_mutation,'compactMutationRejected':compact_mutation,'compactState':c5['state']},sort_keys=True))`;
  const run = spawnSync("python3", ["-c", program, resultPath, metadataPath], {
    cwd: path.resolve(__dirname, "../.."), encoding: "utf8", timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert.equal(result.principal.principalEquations, ROWS);
  assert.equal(result.principalMutationRejected, true);
  assert.equal(result.classIdealMutationRejected, true);
  assert.equal(result.classWitnessMutationRejected, true);
  assert.equal(result.compactMutationRejected, true);
  assert.equal(result.signedGeneratorReplay.signedGeneratorIdealReductionsReplayed, 2);
  assert.equal(result.signedGeneratorReplay.principalOrderWitnessesReplayed, 2);
  assert.equal(result.signedGeneratorReplay.oppositePrincipalCorrectionsRejected, 1);
  assert.deepEqual(result.signedGeneratorReplay.publishedInvariantFactors, [8, 24]);
  assert.deepEqual(result.signedGeneratorReplay.generatorWitnesses.map(value =>
    value.sourceIndex), [1, 0]);
  assert.deepEqual(result.signedGeneratorReplay.missingOwners, []);
  assert.equal(result.signedGeneratorMutationRejected, true);
  return result;
}

function replayGeneralMaps(resultRaw, ancestryRaw, metadataRaw) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "row14-map-replay-"));
  const resultPath = path.join(directory, "result.json");
  const ancestryPath = path.join(directory, "ancestry.json");
  const metadataPath = path.join(directory, "metadata.json");
  try {
    fs.writeFileSync(resultPath, resultRaw, { flag: "wx" });
    fs.writeFileSync(ancestryPath, ancestryRaw, { flag: "wx" });
    fs.writeFileSync(metadataPath, metadataRaw, { flag: "wx" });
    const run = spawnSync(process.execPath,
      [path.join(__dirname, "check_row14_general_ideal_maps.cjs"),
        resultPath, ancestryPath, metadataPath], {
        cwd: path.resolve(__dirname, "../.."), encoding: "utf8",
        timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
      });
    assert.equal(run.status, 0, run.stderr || String(run.error));
    const receipt = JSON.parse(run.stdout);
    assert.equal(receipt.factorBasePrimeRoundTrips, COLUMNS);
    assert.deepEqual(receipt.sourceMutationsRejected,
      ["factor-metadata-tau", "raw-smith-v"]);
    return receipt;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

let cached;
function replayStaticAuthority() {
  // Cache the expensive exact arithmetic, never the authority check.  Every
  // verifier invocation re-reads, decompresses, and authenticates all three
  // retained fixtures before it may reuse the prior arithmetic result.
  const resultRaw = readAuthority(RESULT_PATH, AUTHORITY_SHA256.result, "result");
  const ancestryRaw = readAuthority(ANCESTRY_PATH, AUTHORITY_SHA256.ancestry,
    "ancestry");
  const metadataRaw = readAuthority(METADATA_PATH, AUTHORITY_SHA256.metadata,
    "metadata");
  if (cached) return structuredClone(cached);
  const metadata = JSON.parse(metadataRaw);
  const output = outputAdapter.buildRow14OutputEvidence(
    resultRaw, ancestryRaw, metadata);
  const proof = proofApi.buildRow14FullRawSmithAncestry(resultRaw, ancestryRaw);
  const payload = JSON.parse(resultRaw).payload;
  const map = owners(payload);
  const relation = integers(map.get("raw-relation-records"), ROWS * COLUMNS,
    "relation matrix");
  const U = proof.material.u.map(BigInt), V = proof.material.v.map(BigInt);
  const D = proof.material.d.map(BigInt);
  const identityCells = replaySmith(U, relation, V, D);
  const determinantU = flint.matrixDet(flint.zzMatrix(ROWS, ROWS, U));
  const determinantV = flint.matrixDet(flint.zzMatrix(COLUMNS, COLUMNS, V));
  assert([1n, -1n].includes(determinantU), "U is not unimodular");
  assert([1n, -1n].includes(determinantV), "V is not unimodular");
  const classReplay = replayClassWitnesses(map, relation);
  const unitReplay = replayCompactUnits(map, relation);
  const torsionReplay = replayTorsion(payload, map);
  const python = pythonReplay(RESULT_PATH, METADATA_PATH);
  const generalMaps = replayGeneralMaps(resultRaw, ancestryRaw, metadataRaw);

  const oldRelation = relation[0];
  relation[0] = oldRelation + 1n;
  assert.throws(() => replaySmith(U, relation, V, D), undefined,
    "Smith relation mathematical mutation survived");
  relation[0] = oldRelation;
  const witnesses = map.get("class-order-principal-coefficients");
  const oldWitness = witnesses[0];
  witnesses[0] = String(BigInt(oldWitness) + 1n);
  assert.throws(() => replayClassWitnesses(map, relation), undefined,
    "class-witness mathematical mutation survived");
  witnesses[0] = oldWitness;
  const factored = map.get("factored-unit-transform");
  const oldFactored = factored[0];
  factored[0] = String(BigInt(oldFactored) + 1n);
  assert.throws(() => replayCompactUnits(map, relation), undefined,
    "compact-unit mathematical mutation survived");
  factored[0] = oldFactored;

  cached = {
    schema: "sagejs.pari-class-group/row14-independent-static-math-replay-v1",
    authoritySha256: AUTHORITY_SHA256,
    output, identityCells: String(identityCells),
    determinantU: String(determinantU), determinantV: String(determinantV),
    classReplay, unitReplay, torsionReplay, python, generalMaps,
    mathematicalMutations: {
      smithRelation: true, classPrincipalWitness: true,
      compactUnitEquation: true, rawPrincipalEquation: true,
      regulatorLogLattice: true, generalIdealMaps: true,
      signedGeneratorEquation: python.signedGeneratorMutationRejected,
    },
  };
  return structuredClone(cached);
}


function replaySummary(replay) {
  const summary = {
    schema: replay.schema,
    authoritySha256: replay.authoritySha256,
    outputSha256: digest(replay.output),
    identityCells: replay.identityCells,
    determinantU: replay.determinantU,
    determinantV: replay.determinantV,
    classReplay: replay.classReplay,
    unitReplay: replay.unitReplay,
    torsionReplay: replay.torsionReplay,
    python: replay.python,
    generalMaps: replay.generalMaps,
    mathematicalMutations: replay.mathematicalMutations,
  };
  return { ...summary, replaySha256: digest(summary) };
}

module.exports = Object.freeze({ ANCESTRY_PATH, AUTHORITY_SHA256, METADATA_PATH,
  RESULT_PATH, replayClassWitnesses, replayCompactUnits, replaySmith,
  replayStaticAuthority, replaySummary, replayTorsion });
