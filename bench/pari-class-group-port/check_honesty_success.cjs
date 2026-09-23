"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function polynomial(row) {
  return row.coefficients
    .map((coefficient, degree) => {
      const c = BigInt(coefficient);
      if (c === 0n) return "";
      const variable = degree === 0 ? "" : degree === 1 ? "*x" : `*x^${degree}`;
      return `${c >= 0n && degree > 0 ? "+" : ""}${c}${variable}`;
    })
    .join("");
}

function buildSelectionOracle(pari, archive) {
  const lib = path.join(pari, "Olinux-x86_64");
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(
    sha256(source),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  );
  function replace(from, to) {
    assert.equal(source.split(from).length, 2, `unique source anchor: ${from}`);
    source = source.replace(from, to);
  }
  replace(
    "static int\nbe_honest(FB_t *F, GEN nf, GEN auts, FACT *fact)",
    `static long hs_probes, hs_failed, hs_random, hs_primitive, hs_idealred,
                 hs_orbit_entries, hs_orbit_skips, hs_kcz_increments;
static int hs_detail;
static int
be_honest(FB_t *F, GEN nf, GEN auts, FACT *fact)`,
  );
  replace(
    "    long j, J = lg(P); /* > 1 */",
    "    long j, J = lg(P), rawJ = J; /* > 1 */",
  );
  replace(
    "    if (pr_get_e(gel(P,J-1)) == 1) J--;\n    if (J == 1) continue;",
    `    { long last_e = pr_get_e(gel(P,J-1));
      if (last_e == 1) J--;
      if (hs_detail) printf("O %ld %ld %ld %ld %ld\\n",iz,p,rawJ,last_e,J);
    }
    if (J == 1) continue;`,
  );
  replace(
    "        if (pr_orbit[j]) continue;\n        /* discard all primes in automorphism orbit simultaneously */\n        pr_orbit_fill(pr_orbit, auts, P, j);",
    `        if (pr_orbit[j]) { hs_orbit_skips++; continue; }
        /* discard all primes in automorphism orbit simultaneously */
        hs_orbit_entries++; pr_orbit_fill(pr_orbit, auts, P, j);`,
  );
  replace(
    "        if (Fincke_Pohst_ideal(NULL, F, nf, id, Nid, fact, 0, &fp,\n                               NULL, 0, 0, 0, NULL, NULL)) break;",
    `        { long ok;
          hs_probes++;
          if (hs_detail) {
            printf("P %ld %ld %ld %ld ",iz,p,j,nbtest); pari_printf("%Ps",Nid);
            for(long a=1;a<=N;a++) for(long b=1;b<=N;b++) pari_printf(" %Ps",gcoeff(id,a,b));
            putchar('\\n');
          }
          ok = Fincke_Pohst_ideal(NULL, F, nf, id, Nid, fact, 0, &fp,
                                  NULL, 0, 0, 0, NULL, NULL);
          if (ok) break;
          hs_failed++;
        }`,
  );
  replace(
    "          long ex = random_bits(RANDOM_BITS);",
    "          long ex = random_bits(RANDOM_BITS); hs_random++;",
  );
  replace(
    "        if (!equali1(gcoeff(id,N,N))) id = Q_primpart(id);\n        if (expi(gcoeff(id,1,1)) > 100) id = idealred(nf, id);",
    `        if (!equali1(gcoeff(id,N,N))) { hs_primitive++; id = Q_primpart(id); }
        if (expi(gcoeff(id,1,1)) > 100) { hs_idealred++; id = idealred(nf, id); }`,
  );
  replace(
    "    F->KCZ++; /* SUCCESS, \"enlarge\" factorbase */",
    "    F->KCZ++; hs_kcz_increments++; if (hs_detail) printf(\"K %ld\\n\",F->KCZ); /* SUCCESS, \"enlarge\" factorbase */",
  );
  replace(
    "  F->KCZ = KCZ0; return gc_bool(av,1);",
    "  if (hs_detail) printf(\"T %ld %ld\\n\",F->KCZ,KCZ0); F->KCZ = KCZ0; return gc_bool(av,1);",
  );
  source += `
int main(int argc, char **argv) {
  if (argc != 4 && argc != 5) return 64;
  hs_detail = argc == 5;
  pari_init(512000000, 10000); DEBUGLEVEL = 0; setrand(gen_1);
  ulong C1 = strtoul(argv[2], NULL, 10), C2 = strtoul(argv[3], NULL, 10);
  GEN nf = nfinit(gp_read_str(argv[1]), nbits2prec(192));
  long n = nf_get_degree(nf), r1 = nf_get_r1(nf);
  double ld = dbllog2(absi_shallow(nf_get_disc(nf))) * M_LN2;
  GRHcheck_t S; init_GRHcheck(&S, n, r1, ld);
  FB_t F = {0}; FBgen(&F, nf, n, C1, C2, &S);
  GEN cyclic, auts = automorphism_matrices(nf, &cyclic);
  subFBgen(&F, auts, cyclic, (double)C1, MINSFB);
  FACT *fact = (FACT*)stack_malloc((F.KC + 1) * sizeof(FACT)); fact[0].pr = 0;
  long initial = F.KCZ, kcz2 = F.KCZ2, autn = lg(auts)-1;
  if (hs_detail) {
    printf("H %ld %ld %ld %ld %ld",n,initial,kcz2,F.KC,autn);
    for(long z=1;z<=F.KCZ2;z++) printf(" %ld",F.FB[z]);
    printf(" R "); pari_printf("%Ps\\n",getrand());
  }
  int ok = be_honest(&F, nf, auts, fact);
  printf("E %d %ld %ld %ld %ld %ld %ld %ld %ld %ld %ld %ld %ld\\n",
         ok, initial, kcz2, F.KCZ, hs_kcz_increments, hs_probes, hs_failed,
         hs_random, hs_primitive, hs_idealred, autn, hs_orbit_entries,
         hs_orbit_skips);
  if (hs_detail) { printf("Z "); pari_printf("%Ps\\n",getrand()); }
  free_GRHcheck(&S); pari_close(); return 0;
}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-honesty-success-select-"));
  const cfile = path.join(directory, "select.c");
  const binary = path.join(directory, "select");
  fs.writeFileSync(cfile, source);
  run("cc", [
    "-O2",
    `-I${path.join(pari, "src/headers")}`,
    `-I${lib}`,
    cfile,
    `-L${lib}`,
    `-Wl,-rpath,${lib}`,
    "-lpari",
    "-lm",
    "-o",
    binary,
  ]);
  return { binary, directory, sourceSha256: sha256(source) };
}

function selectSuccessfulIdentity(pari, archive) {
  const panel = JSON.parse(
    fs.readFileSync(path.join(root, "bench/pari-class-group-port/panel.json")),
  );
  const order = [0, 8, 1, 14, 3, 4, 6, 10, 11, 13, 16, 18, 19, 20, 21, 23];
  const oracle = buildSelectionOracle(pari, archive);
  const attempts = [];
  for (const panelIndex of order) {
    const row = panel.rows[panelIndex];
    const output = run(oracle.binary, [polynomial(row), "5", "31"])
      .trim()
      .split(" ")
      .slice(1)
      .map(Number);
    const [success, initialKCZ, KCZ2, finalKCZ, increments, probes, failures,
      randomDraws, primitiveParts, idealReductions, automorphisms, orbitEntries,
      orbitSkips] = output;
    const attempt = { panelIndex, id: row.id, polynomial: polynomial(row), C1: 5,
      C2: 31, success, initialKCZ, KCZ2, finalKCZ, increments, probes, failures,
      randomDraws, primitiveParts, idealReductions, automorphisms, orbitEntries,
      orbitSkips };
    attempts.push(attempt);
    if (
      success === 1 &&
      initialKCZ !== KCZ2 &&
      increments > 0 &&
      probes > 0
    ) return { selected: attempt, attempts, oracle };
  }
  return { selected: null, attempts, oracle };
}

function detailedTrace(oracle, selected) {
  const text = run(oracle.binary, [
    selected.polynomial,
    String(selected.C1),
    String(selected.C2),
    "detail",
  ]);
  const outerSchedule = [];
  const probes = [];
  const increments = [];
  let header;
  let restore;
  let result;
  let endRng;
  for (const line of text.trim().split("\n")) {
    const values = line.split(" ");
    const kind = values.shift();
    if (kind === "H") {
      const marker = values.indexOf("R");
      assert(marker > 4);
      header = {
        degree: Number(values[0]),
        KCZ: Number(values[1]),
        KCZ2: Number(values[2]),
        KC: Number(values[3]),
        automorphisms: Number(values[4]),
        backingFactorBase: values.slice(5, marker).map(Number),
        rng: values[marker + 1],
      };
    } else if (kind === "O") {
      outerSchedule.push(values.map(Number));
    } else if (kind === "P") {
      probes.push({
        iz: Number(values[0]),
        prime: Number(values[1]),
        slot: Number(values[2]),
        attempt: Number(values[3]),
        norm: values[4],
        ideal: values.slice(5),
      });
    } else if (kind === "K") {
      increments.push(Number(values[0]));
    } else if (kind === "T") {
      restore = values.map(Number);
    } else if (kind === "E") {
      result = values.map(Number);
    } else if (kind === "Z") {
      endRng = values[0];
    } else {
      assert.fail(`unknown honesty trace row ${kind}`);
    }
  }
  assert(header && restore && result && endRng);
  return { text, header, outerSchedule, probes, increments, restore, result, endRng };
}

function compactFixture(selection, trace, archive) {
  const selected = selection.selected;
  return {
    identity: {
      pariVersion: "2.17.4",
      archiveSha256: sha256(fs.readFileSync(archive)),
      buch2Sha256:
        "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
      instrumentedSourceSha256: selection.oracle.sourceSha256,
      rawTraceSha256: sha256(trace.text),
    },
    selection: {
      kind: "deterministic-pari-only-v1",
      frozenPanelOrder: [0, 8, 1, 14, 3, 4, 6, 10, 11, 13, 16, 18, 19, 20, 21, 23],
      acceptedPanelIndex: selected.panelIndex,
      columns: ["panelIndex", "success", "initialKCZ", "KCZ2", "finalKCZ",
        "increments", "probes", "failures", "randomDraws", "primitiveParts",
        "idealReductions", "automorphisms", "orbitEntries", "orbitSkips"],
      attempts: selection.attempts.map(attempt => [attempt.panelIndex,
        attempt.success, attempt.initialKCZ, attempt.KCZ2, attempt.finalKCZ,
        attempt.increments, attempt.probes, attempt.failures, attempt.randomDraws,
        attempt.primitiveParts, attempt.idealReductions, attempt.automorphisms,
        attempt.orbitEntries, attempt.orbitSkips]),
    },
    input: {
      panelIndex: selected.panelIndex,
      id: selected.id,
      polynomial: selected.polynomial,
      polynomialSha256: JSON.parse(
        fs.readFileSync(path.join(root, "bench/pari-class-group-port/panel.json")),
      ).rows[selected.panelIndex].polynomial_sha256,
      C1: selected.C1,
      C2: selected.C2,
      setrand: "1",
    },
    factorBase: {
      KC: trace.header.KC,
      KCZ: trace.header.KCZ,
      KCZ2: trace.header.KCZ2,
      backing: trace.header.backingFactorBase,
      nonidentityAutomorphisms: trace.header.automorphisms,
    },
    outerSchedule: trace.outerSchedule,
    probeSchedule: trace.probes.map(({ iz, prime, slot }) => [iz, prime, slot]),
    probeNorms: trace.probes.map(probe => probe.norm),
    probeIdeals: trace.probes.map(probe => probe.ideal),
    transientKCZ: trace.increments,
    restoration: trace.restore,
    rng: {
      startSha256: sha256(trace.header.rng),
      endSha256: sha256(trace.endRng),
      unchanged: trace.header.rng === trace.endRng,
      draws: selected.randomDraws,
    },
    branches: {
      probes: selected.probes,
      failures: selected.failures,
      increments: selected.increments,
      primitiveParts: selected.primitiveParts,
      idealReductions: selected.idealReductions,
      automorphismEntries: selected.orbitEntries,
      automorphismSkips: selected.orbitSkips,
    },
    result: { success: trace.result[0], finalKCZ: trace.result[3] },
  };
}

async function main() {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz");
  assert.equal(
    sha256(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  const selection = selectSuccessfulIdentity(pari, archive);
  assert(selection.selected, "frozen correctness pool has no successful honesty identity");
  assert.equal(selection.selected.panelIndex, 21);
  const trace = detailedTrace(selection.oracle, selection.selected);
  const fixture = compactFixture(selection, trace, archive);
  assert.deepEqual(fixture.outerSchedule, [
    [4, 11, 4, 2, 4],
    [5, 13, 3, 1, 2],
    [6, 17, 2, 1, 1],
    [7, 19, 2, 1, 1],
    [8, 23, 2, 1, 1],
    [9, 29, 4, 1, 3],
    [10, 31, 2, 1, 1],
  ]);
  assert.deepEqual(fixture.probeSchedule, [
    [4, 11, 1], [4, 11, 2], [4, 11, 3],
    [5, 13, 1], [9, 29, 1], [9, 29, 2],
  ]);
  assert.deepEqual(fixture.transientKCZ, [4, 5, 6]);
  assert.deepEqual(fixture.restoration, [6, 3]);
  assert.equal(fixture.rng.unchanged, true);
  assert.deepEqual(fixture.branches, {
    probes: 6, failures: 0, increments: 3, primitiveParts: 0,
    idealReductions: 0, automorphismEntries: 0, automorphismSkips: 0,
  });
  if (process.argv.includes("--emit")) {
    process.stdout.write(`${JSON.stringify(fixture)}\n`);
    return;
  }
  const frozen = JSON.parse(
    fs.readFileSync(path.join(__dirname, "honesty_success_fixture.json")),
  );
  assert.deepEqual(fixture, frozen);

  const flatOuter = fixture.outerSchedule.flat();
  const flatProbes = fixture.probeSchedule.flat();
  const flatIdeals = fixture.probeIdeals.flat();
  const payload = { fixture, flatOuter, flatProbes, flatIdeals };
  const python = JSON.parse(run("python3", ["-c", `
import importlib,json,sys
sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
m=importlib.import_module('bench.pari-class-group-port.honesty_success')
f=d['fixture'];state=[0]*21;ideal=[0]*25;rng=[i+1 for i in range(66)]
states=[];ideals=[]
m.pari_honesty_success_begin(5,3,10,0,d['flatOuter'],d['flatProbes'],list(map(int,f['probeNorms'])),list(map(int,d['flatIdeals'])),state,ideal)
states.append(state.copy());ideals.append(ideal.copy());before=rng.copy()
for index in range(6):
 status=m.pari_honesty_success_resume(1,d['flatOuter'],d['flatProbes'],list(map(int,f['probeNorms'])),list(map(int,d['flatIdeals'])),rng,state,[0]*25,ideal)
 if status!=(1 if index<5 else 0):raise AssertionError((index,status))
 states.append(state.copy());ideals.append(ideal.copy())
assert rng==before
print(json.dumps({'states':states,'ideals':ideals,'rng':rng}))`,
    root, path.join(root, "src/lib")], { input: JSON.stringify(payload) }));
  assert.deepEqual(python.states.at(-1), [3, 3, 10, 5, 6, 6, 3, 4, 1, 1, 0, 0, 0, 0, 9, 29, 2, 0, 6, 29, 6]);

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "honesty_success.py"),
  });
  const scheduler = require(built.modulePath);
  const integer = values => values.map(BigInt);
  const native = [];
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const state = Array(21).fill(0n);
    const ideal = Array(25).fill(0n);
    const rng = Array.from({ length: 66 }, (_, index) => BigInt(index + 1));
    const before = rng.slice();
    assert.equal(scheduler.pari_honesty_success_begin[backend](
      5n, 3n, 10n, 0n, integer(flatOuter), integer(flatProbes),
      integer(fixture.probeNorms), integer(flatIdeals), state, ideal,
    ), 11n);
    const states = [state.map(Number)];
    const ideals = [ideal.map(String)];
    for (let index = 0; index < 6; index += 1) {
      const status = scheduler.pari_honesty_success_resume[backend](
        1n, integer(flatOuter), integer(flatProbes), integer(fixture.probeNorms),
        integer(flatIdeals), rng, state, Array(25).fill(0n), ideal,
      );
      assert.equal(status, index < 5 ? 1n : 0n);
      states.push(state.map(Number));
      ideals.push(ideal.map(String));
    }
    assert.deepEqual(rng, before, `${backend} RNG preservation`);
    assert.deepEqual(states, python.states, `${backend} scheduler transcript`);
    assert.deepEqual(ideals, python.ideals.map(row => row.map(String)), `${backend} ideal transcript`);
    native.push({ backend, finalState: states.at(-1) });
  }
  console.log(JSON.stringify({
    successfulFrozenCaseComplete: true,
    unequalBounds: true,
    panelIndex: fixture.input.panelIndex,
    probes: 6,
    transientKCZ: fixture.transientKCZ,
    restoredKCZ: fixture.result.finalKCZ,
    rngUnchanged: fixture.rng.unchanged,
    exercised: ["successful KCZ increment", "all-success restoration"],
    inactive: ["retry random products", "Q_primpart", "idealred", "automorphism orbit"],
    backends: ["cpython", ...native.map(row => row.backend)],
    nativeCoreSha256: sha256(fs.readFileSync(built.coreSourcePath)),
    oracleDirectory: selection.oracle.directory,
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
