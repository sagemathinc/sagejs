"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const hash = (value) => createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function buildOracle(pari, archive) {
  const lib = path.join(pari, "Olinux-x86_64");
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(
    hash(source),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  );
  function replace(from, to) {
    assert.equal(source.split(from).length, 2, `unique source anchor: ${from}`);
    source = source.replace(from, to);
  }
  replace(
    "        if (Fincke_Pohst_ideal(NULL, F, nf, id, Nid, fact, 0, &fp,\n                               NULL, 0, 0, 0, NULL, NULL)) break;",
    `        { long ok = Fincke_Pohst_ideal(NULL, F, nf, id, Nid, fact, 0, &fp,
                               NULL, 0, 0, 0, NULL, NULL);
          printf("P %ld %ld %ld %ld ", iz, p, j, nbtest); pari_printf("%Ps", Nid);
          for(long a=1;a<=N;a++) for(long b=1;b<=N;b++) pari_printf(" %Ps",gcoeff(id,a,b)); putchar(' ');
          pari_printf("%Ps\\n", getrand());
          if (ok) break;
        }`,
  );
  replace(
    "          long ex = random_bits(RANDOM_BITS);",
    `          long ex = random_bits(RANDOM_BITS);
          printf("R %ld %ld %ld %ld %ld\\n", iz, p, j, i, ex);`,
  );
  source += `
int main(int argc, char **argv) {
  if (argc != 4) return 64;
  pari_init(256000000, 10000); DEBUGLEVEL = 0; setrand(gen_1);
  long field = atol(argv[1]); ulong C1 = strtoul(argv[2], NULL, 10), C2 = strtoul(argv[3], NULL, 10);
  const char *polys[] = {"x^3-20018*x+20034", "x^3-20010*x+20018", "x^4-20018*x-20034", "x^4-2000022*x-2000042"};
  if (field < 0 || field > 3 || C1 < 2 || C2 < C1) return 65;
  GEN nf = nfinit(gp_read_str(polys[field]), nbits2prec(192));
  long n = nf_get_degree(nf), r1 = nf_get_r1(nf);
  double ld = dbllog2(absi_shallow(nf_get_disc(nf))) * M_LN2;
  GRHcheck_t S; init_GRHcheck(&S, n, r1, ld);
  FB_t F = {0}; FBgen(&F, nf, n, C1, C2, &S);
  GEN cyclic, auts = automorphism_matrices(nf, &cyclic);
  subFBgen(&F, auts, cyclic, (double)C1, MINSFB);
  FACT *fact = (FACT*)stack_malloc((F.KC + 1) * sizeof(FACT)); fact[0].pr = 0;
  printf("H %ld %lu %lu %ld %ld %ld %ld %ld\\n", field, C1, C2, F.KC, F.KCZ, F.KCZ2, lg(F.subFB)-1, lg(auts)-1);
  printf("B %ld", n); for (long a=1; a<=n; a++) for (long b=1; b<=n; b++) { GEN t=tablemul_ei_ej(nf,a,b); for(long k=1;k<=n;k++) pari_printf(" %Ps",gel(t,k)); } putchar('\\n');
  GEN checkpr=gel(gel(F.LV,11),1), checkid=pr_hnf(nf,checkpr); printf("I"); for(long a=1;a<=n;a++) for(long b=1;b<=n;b++) pari_printf(" %Ps",gcoeff(checkid,a,b)); putchar('\\n');
  GEN subpr=gel(F.LP,F.subFB[1]), subgen=pr_get_gen(subpr); printf("Q "); pari_printf("%Ps",pr_get_p(subpr)); printf(" %ld %ld",pr_get_e(subpr),pr_get_f(subpr)); for(long k=1;k<=n;k++) pari_printf(" %Ps",gel(subgen,k)); putchar('\\n');
  GEN rs=getrand(); printf("X"); for(long k=0;k<66;k++){ulong v=*int_W(rs,k);if(k==65)v&=63;printf(" %lu",v);} putchar('\\n');
  pari_printf("S %Ps\\n", getrand());
  int ok = be_honest(&F, nf, auts, fact);
  printf("E %d %ld ", ok, F.KCZ); pari_printf("%Ps\\n", getrand());
  free_GRHcheck(&S); pari_close(); return 0;
}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-honesty-oracle-"));
  const cfile = path.join(directory, "oracle.c");
  const binary = path.join(directory, "oracle");
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
  return { binary, directory, sourceHash: hash(source) };
}

function parseTrace(text, oracle) {
  const lines = text.trim().split("\n");
  const header = lines.shift().split(" ");
  assert.equal(header.shift(), "H");
  const basis = lines.shift().split(" ");
  assert.equal(basis.shift(), "B");
  const degree = Number(basis.shift());
  const initialIdeal = lines.shift().split(" ");
  assert.equal(initialIdeal.shift(), "I");
  const subfactor = lines.shift().split(" ");
  assert.equal(subfactor.shift(), "Q");
  const randomState = lines.shift().split(" ");
  assert.equal(randomState.shift(), "X");
  const start = lines.shift().split(" ");
  assert.equal(start.shift(), "S");
  const probes = [];
  const randomPowers = [];
  let end;
  for (const line of lines) {
    const values = line.split(" ");
    const kind = values.shift();
    if (kind === "P") {
      const [iz, prime, ideal, attempt, norm] = values;
      const idealHnf = values.slice(5, 5 + degree * degree);
      const rng = values[5 + degree * degree];
      probes.push([
        Number(iz),
        Number(prime),
        Number(ideal),
        Number(attempt),
        norm,
        hash(rng),
        idealHnf,
      ]);
    } else if (kind === "R") {
      const [iz, prime, ideal, subfactorSlot, exponent] = values.map(Number);
      randomPowers.push([iz, prime, ideal, subfactorSlot, exponent]);
    } else if (kind === "E") {
      const [success, finalKCZ, rng] = values;
      end = {
        success: Number(success),
        finalKCZ: Number(finalKCZ),
        rngSha256: hash(rng),
      };
    } else {
      assert.fail(`unknown trace record ${kind}`);
    }
  }
  assert(end, "missing terminal honesty record");
  return {
    identity: {
      pariVersion: "2.17.4",
      archiveSha256:
        "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
      buch2Sha256:
        "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
      instrumentedSourceSha256: oracle.sourceHash,
    },
    input: {
      field: Number(header[0]),
      polynomial: "x^3-20018*x+20034",
      C1: Number(header[1]),
      C2: Number(header[2]),
      setrand: "1",
    },
    factorBase: {
      KC: Number(header[3]),
      KCZ: Number(header[4]),
      KCZ2: Number(header[5]),
      subfactorCount: Number(header[6]),
      nonidentityAutomorphisms: Number(header[7]),
    },
    arithmetic: {
      degree,
      basisTable: basis,
      initialIdeal,
      subfactor: {
        prime: subfactor[0],
        ramification: Number(subfactor[1]),
        residueDegree: Number(subfactor[2]),
        generator: subfactor.slice(3),
      },
      randomState,
    },
    startRngSha256: hash(start[0]),
    probes,
    randomPowers,
    result: end,
    semantics: {
      sourceLines: "buch2.c:2800-2865",
      maxtryHONEST: 50,
      randomBits: 4,
      boundary:
        "Pristine PARI execution of unequal-bound be_honest, including actual Fincke-Pohst probes and failed-probe random ideal products.",
    },
    rawTraceSha256: hash(text),
  };
}

function compactTrace(trace) {
  return {
    identity: trace.identity,
    input: trace.input,
    factorBase: trace.factorBase,
    arithmetic: trace.arithmetic,
    startRngSha256: trace.startRngSha256,
    probeCount: trace.probes.length,
    probeScheduleSha256: hash(
      JSON.stringify(trace.probes.map((probe) => probe.slice(0, 4))),
    ),
    probeNorms: trace.probes.map((probe) => probe[4]),
    probeIdealTranscriptSha256: hash(
      JSON.stringify(trace.probes.map((probe) => probe[6])),
    ),
    probeRngTranscriptSha256: hash(trace.probes.map((probe) => probe[5]).join("\n")),
    randomExponents: trace.randomPowers.map((power) => power[4]),
    result: trace.result,
    semantics: trace.semantics,
    rawTraceSha256: trace.rawTraceSha256,
  };
}

async function check(pari, archive) {
  const oracle = buildOracle(pari, archive);
  const trace = parseTrace(run(oracle.binary, ["0", "5", "31"]), oracle);
  assert.equal(trace.factorBase.KCZ, 2);
  assert.equal(trace.factorBase.KCZ2, 9);
  assert.equal(trace.probes.length, 51);
  assert.equal(trace.randomPowers.length, 50);
  assert.deepEqual(
    trace.probes.map((probe) => probe.slice(0, 4)),
    Array.from({ length: 51 }, (_, attempt) => [4, 11, 1, attempt]),
  );
  assert.deepEqual(
    trace.randomPowers.map((power) => power.slice(0, 4)),
    Array.from({ length: 50 }, () => [4, 11, 1, 1]),
  );
  assert.deepEqual(trace.result, {
    success: 0,
    finalKCZ: 2,
    rngSha256: trace.probes.at(-1)[5],
  });
  const compact = compactTrace(trace);
  if (process.argv.includes("--emit")) {
    process.stdout.write(`${JSON.stringify(compact, null, 2)}\n`);
  } else {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, "honesty_branch_fixture.json")),
    );
    assert.deepEqual(compact, fixture);
    const built = await compileKernel({
      sourcePath: path.join(__dirname, "honesty_branch.py"),
    });
    const module = require(built.modulePath);
    const integer = (values) => values.map(BigInt);
    const zero = (length) => Array(length).fill(0n);
    const n = fixture.arithmetic.degree;
    for (const backend of ["javascript", "gmp", "tagged"]) {
      const randomState = integer(fixture.arithmetic.randomState);
      const exponents = zero(50);
      assert.equal(
        module.pari_honesty_random_powers[backend](randomState, 50n, exponents),
        50n,
      );
      assert.deepEqual(exponents, integer(fixture.randomExponents));
      const ideals = [fixture.arithmetic.initialIdeal];
      for (let index = 0; index < exponents.length; index += 1) {
        const output = zero(n * n);
        const norm = module.pari_honesty_retry_ideal[backend](
          integer(fixture.arithmetic.basisTable),
          integer(fixture.arithmetic.initialIdeal),
          integer(fixture.arithmetic.subfactor.generator),
          BigInt(n),
          BigInt(fixture.arithmetic.subfactor.prime),
          BigInt(fixture.arithmetic.subfactor.ramification),
          BigInt(fixture.arithmetic.subfactor.residueDegree),
          exponents[index],
          zero(n),
          zero(n),
          zero(n),
          zero(3),
          zero(3),
          zero(n * n),
          zero(n * n),
          zero(2 * n * n),
          zero(n * (3 * n + 1)),
          zero(n * (n + 1)),
          zero(n),
          output,
        );
        assert.equal(norm, BigInt(fixture.probeNorms[index + 1]));
        ideals.push(output.map(String));
      }
      assert.equal(
        hash(JSON.stringify(ideals)),
        fixture.probeIdealTranscriptSha256,
      );
      const short = zero(51);
      assert.throws(
        () =>
          module.pari_honesty_random_powers[backend](
            integer(fixture.arithmetic.randomState),
            52n,
            short,
          ),
        /invalid honesty random-power/,
      );
      assert.deepEqual(short, zero(51));
    }
    console.log(
      JSON.stringify({
        unequalBounds: true,
        probes: trace.probes.length,
        randomProducts: trace.randomPowers.length,
        result: trace.result,
        fixtureSha256: hash(
          fs.readFileSync(path.join(__dirname, "honesty_branch_fixture.json")),
        ),
        backends: ["cpython", "javascript", "gmp", "tagged"],
        nativeCoreSha256: hash(fs.readFileSync(built.coreSourcePath)),
        oracleDirectory: oracle.directory,
      }),
    );
  }
}

const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
const archive = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz");
assert.equal(
  hash(fs.readFileSync(archive)),
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
);
check(pari, archive).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
