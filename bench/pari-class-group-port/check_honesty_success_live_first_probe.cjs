"use strict";

// This checker deliberately keeps the PARI observation outside the payload
// consumed by the Sage-side computation.  PARI exports only prepared number
// field/factor-base/ideal owners; the translated collector computes the probe
// bit, which is then consumed by the translated honesty scheduler.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const BUCH2_SHA =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const ARCHIVE_SHA =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function flatten(rows) {
  return rows.flatMap(row => row.map(String));
}

function schedulerInput(fixture) {
  // Only caller-owned schedule and ideal inputs cross this boundary.  In
  // particular, branches/result and every PARI collector status are omitted.
  return {
    n: 5,
    kcz: fixture.factorBase.KCZ,
    kcz2: fixture.factorBase.KCZ2,
    automorphisms: fixture.factorBase.nonidentityAutomorphisms,
    outerSchedule: flatten(fixture.outerSchedule),
    probeSchedule: flatten(fixture.probeSchedule),
    probeNorms: fixture.probeNorms.map(String),
    probeIdeals: flatten(fixture.probeIdeals),
  };
}

function sourceAudit(archive) {
  assert.equal(sha256(fs.readFileSync(archive)), ARCHIVE_SHA);
  const source = run("tar", [
    "-xOf",
    archive,
    "pari-2.17.4/src/basemath/buch2.c",
  ]);
  assert.equal(sha256(source), BUCH2_SHA);
  const begin = source.indexOf("be_honest(FB_t *F, GEN nf, GEN auts, FACT *fact)");
  const end = source.indexOf("F->KCZ = KCZ0; return gc_bool(av,1);", begin);
  assert(begin >= 0 && end > begin);
  const body = source.slice(begin, end);
  assert.match(body, /id = id0 = pr_hnf\(nf,gel\(P,j\)\)/);
  assert.match(body, /Nid = pr_norm\(gel\(P,j\)\)/);
  assert.match(body, /Fincke_Pohst_ideal\(NULL, F, nf, id, Nid, fact, 0/);
  assert.match(body, /if \(Fincke_Pohst_ideal[\s\S]*?\) break;/);
  assert.match(body, /F->KCZ\+\+; \/\* SUCCESS/);
  return sha256(body);
}

function main() {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(
    process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  const beHonestSourceSha256 = sourceAudit(archive);

  // The exporter authenticates and executes pristine PARI, but only its raw
  // prepared inputs are copied into sagePayload below.  Keep the reference
  // observation in this outer checker for the final differential assertion.
  const exported = JSON.parse(
    run(process.execPath, [
      path.join(__dirname, "check_quintic_collector_fixture.cjs"),
      pari,
      archive,
      "--export-fixtures",
    ]),
  );
  assert.equal(exported.schema, "pari-quintic-honesty-collector-v1");
  assert.equal(exported.identity.archiveSha256, ARCHIVE_SHA);
  assert.equal(exported.identity.buch2Sha256, BUCH2_SHA);
  assert.equal(exported.inputs.length, 6);
  assert.equal(exported.expectedStatuses.length, 6);

  const honestyFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "honesty_success_fixture.json")),
  );
  const sagePayload = {
    names: exported.names,
    inputs: exported.inputs,
    scheduler: schedulerInput(honestyFixture),
  };
  assert(!Object.hasOwn(sagePayload, "expectedStatuses"));
  assert(!Object.hasOwn(sagePayload.scheduler, "result"));
  assert(!Object.hasOwn(sagePayload.scheduler, "branches"));
  const serializedPayload = JSON.stringify(sagePayload);
  assert(!serializedPayload.includes("expectedStatuses"));

  const python = String.raw`
import copy, decimal, hashlib, importlib, json, sys
sys.set_int_max_str_digits(100000)
sys.path[:0] = sys.argv[1:3]
d = json.load(sys.stdin)
assert 'expectedStatuses' not in d

collector = importlib.import_module(
    'bench.pari-class-group-port.unreduced_ideal_collector'
).pari_collect_unreduced_ideal
volume = importlib.import_module('bench.pari-class-group-port.ball_volume')
scheduler = importlib.import_module('bench.pari-class-group-port.honesty_success')

def values(raw):
    answer = {}
    for name, kind in d['names']:
        item = raw[name]
        convert = float if kind in ('float', 'Float64Buffer') else int
        answer[name] = list(map(convert, item)) if isinstance(item, list) else convert(item)
    answer['scale'] = volume.pari_small_norm_scale(answer['n'])
    return answer

s = d['scheduler']
outer = list(map(int, s['outerSchedule']))
probe_schedule = list(map(int, s['probeSchedule']))
probe_norms = list(map(int, s['probeNorms']))
probe_ideals = list(map(int, s['probeIdeals']))
honesty_state = [0] * 21
published = [0] * 25
first_norm = scheduler.pari_honesty_success_begin(
    s['n'], s['kcz'], s['kcz2'], s['automorphisms'], outer,
    probe_schedule, probe_norms, probe_ideals, honesty_state, published,
)
assert first_norm == int(d['inputs'][0]['admission_ideal_norm'])
assert published == list(map(int, d['inputs'][0]['admission_ideal']))

# A failed live observation must not silently take the frozen-success path.
# It is rejected transactionally before any scheduler or RNG publication.
bad_state = honesty_state.copy()
bad_rng = list(range(1, 67))
bad_rng_before = bad_rng.copy()
bad_output = published.copy()
try:
    scheduler.pari_honesty_success_resume(
        0, outer, probe_schedule, probe_norms, probe_ideals, bad_rng,
        bad_state, [0] * 25, bad_output,
    )
except ValueError as error:
    bad_observation = str(error)
else:
    raise AssertionError('failed observation was accepted')
assert bad_state == honesty_state and bad_rng == bad_rng_before
assert bad_output == published

rng = list(range(1, 67))
rng_before = rng.copy()
rows = []
resumes = []
for probe_index, raw in enumerate(d['inputs']):
    v = values(raw)
    assert published == v['admission_ideal']
    assert honesty_state[19] == v['admission_ideal_norm']
    source_owners = {
        name: copy.deepcopy(v[name])
        for name in (
            'admission_ideal', 'preparation_rounded_embedding',
            'preparation_embedding', 'admission_matrix_m',
            'admission_matrix_p', 'admission_matrix_e',
            'admission_group_tau', 'admission_group_e',
            'admission_group_f', 'admission_group_inert',
        )
    }
    status = collector(*(v[name] for name, unused in d['names']))
    assert all(v[name] == before for name, before in source_owners.items())
    assert v['preparation_state'] == [1]
    assert v['preparation_rank_diagnostic'] == [1, 2147483659, 0]
    resume = scheduler.pari_honesty_success_resume(
        status, outer, probe_schedule, probe_norms, probe_ideals, rng,
        honesty_state, [0] * 25, published,
    )
    resumes.append(resume)
    rows.append({
        'status': status,
        'scale': v['scale'],
        'candidateAttempts': v['counters'][0],
        'factorCount': v['counters'][2],
        'factorIndices': v['admission_indices'][:v['counters'][2]],
        'factorExponents': v['admission_exponents'][:v['counters'][2]],
        'element': v['element'],
        'rankDiagnostic': v['preparation_rank_diagnostic'],
        'rankSelection': v['preparation_selection'],
        'preparationStages': v['preparation_stages'],
        'boundRootDegree': v['state'][4],
        'sourceOwnersUnchanged': True,
    })
    if probe_index < len(d['inputs']) - 1:
        assert resume == 1
    else:
        assert resume == 0
assert rng == rng_before

# Mutate the degree contract on an otherwise fresh prepared call.  The
# ranked-preparation boundary must reject it before touching any owner.
invalid = values(d['inputs'][0])
invalid['n'] = 6
before = json.dumps(invalid, sort_keys=True, separators=(',', ':'))
try:
    collector(*(invalid[name] for name, unused in d['names']))
except ValueError as error:
    degree_rejection = str(error)
else:
    raise AssertionError('invalid degree was accepted')
after = json.dumps(invalid, sort_keys=True, separators=(',', ':'))
assert before == after

# A short G0 owner is a distinct malformed-preparation mutation and is also
# rejected transactionally before rank/LLL scratch publication.
short = values(d['inputs'][0])
short['preparation_rounded_embedding'] = []
before = json.dumps(short, sort_keys=True, separators=(',', ':'))
try:
    collector(*(short[name] for name, unused in d['names']))
except ValueError as error:
    shape_rejection = str(error)
else:
    raise AssertionError('short rounded embedding was accepted')
after = json.dumps(short, sort_keys=True, separators=(',', ':'))
assert before == after

transcript = {
    'rows': rows,
    'schedulerResumes': resumes,
    'schedulerState': honesty_state,
    'terminalPublishedIdeal': published,
    'badObservationRejection': bad_observation,
    'degreeRejection': degree_rejection,
    'shapeRejection': shape_rejection,
    'sourceOwnersUnchanged': all(row['sourceOwnersUnchanged'] for row in rows),
    'rngUnchanged': rng == rng_before,
}
encoded = json.dumps(transcript, sort_keys=True, separators=(',', ':'))
transcript['sha256'] = hashlib.sha256(encoded.encode()).hexdigest()
print(json.dumps(transcript, separators=(',', ':')))
`;
  const observed = JSON.parse(
    run(
      "python3",
      ["-c", python, ROOT, path.join(ROOT, "src/lib")],
      { input: serializedPayload },
    ),
  );

  // Differential comparison happens only after the Sage-side computation.
  // The value was not an argument to collector or scheduler.
  assert.deepEqual(
    observed.rows.map(row => row.status),
    exported.expectedStatuses,
  );
  assert.deepEqual(observed.rows.map(row => row.status), Array(6).fill(1));
  assert.deepEqual(observed.schedulerResumes, [1, 1, 1, 1, 1, 0]);
  assert.equal(observed.schedulerState[0], honestyFixture.factorBase.KCZ);
  assert.equal(observed.schedulerState[3], 5);
  assert.equal(observed.schedulerState[4], 6);
  assert.equal(observed.schedulerState[5], 6);
  assert.equal(observed.schedulerState[6], 3);
  assert.equal(observed.schedulerState[8], 1);
  assert.equal(observed.schedulerState[9], 1);
  assert.equal(observed.schedulerState[17], 0);
  assert.equal(observed.schedulerState[20], 6);
  assert.equal(observed.sourceOwnersUnchanged, true);
  assert.equal(observed.rngUnchanged, true);
  assert.equal(
    observed.badObservationRejection,
    "probe result diverges from successful honesty oracle",
  );
  assert.equal(observed.degreeRejection, "invalid ranked ideal preparation input");
  assert.equal(observed.shapeRejection, "invalid ranked ideal preparation input");

  console.log(
    JSON.stringify({
      liveSuccessfulHonesty: true,
      field: honestyFixture.input.polynomial,
      degree: 5,
      bounds: [honestyFixture.input.C1, honestyFixture.input.C2],
      initialKCZ: honestyFixture.factorBase.KCZ,
      checkingKCZ: honestyFixture.factorBase.KCZ2,
      pariReferenceStatuses: exported.expectedStatuses,
      sageComputedStatuses: observed.rows.map(row => row.status),
      sageRuntimeAcceptedPariStatus: false,
      preparedOwnersOnly: true,
      rankedPreparations: observed.rows.map(row => ({
        diagnostic: row.rankDiagnostic,
        selection: row.rankSelection,
        stages: row.preparationStages,
        boundRootDegree: row.boundRootDegree,
      })),
      collectors: observed.rows.map(row => ({
        attempts: row.candidateAttempts,
        element: row.element,
        factorCount: row.factorCount,
        factorIndices: row.factorIndices,
        factorExponents: row.factorExponents,
      })),
      scheduler: {
        consumedLiveObservations: observed.schedulerState[5],
        probesPublished: observed.schedulerState[4],
        probesConsumed: observed.schedulerState[5],
        finalProbeIndex: observed.schedulerState[3],
        kczIncrements: observed.schedulerState[6],
        terminal: observed.schedulerState[8],
        restorations: observed.schedulerState[9],
        finalKCZ: observed.schedulerState[0],
        rngUnchanged: observed.rngUnchanged,
      },
      mutationsRejected: 3,
      transcriptSha256: observed.sha256,
      beHonestSourceSha256,
      buch2Sha256: BUCH2_SHA,
      archiveSha256: ARCHIVE_SHA,
    }),
  );
}

main();
