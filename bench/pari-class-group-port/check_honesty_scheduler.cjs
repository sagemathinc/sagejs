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
    timeout: 300000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function signature(file, name) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  const match = source.match(new RegExp(`def ${name}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `${name} signature`);
  return match[1]
    .trim()
    .split("\n")
    .map((line) => line.trim().replace(/,$/, "").split(": "));
}

function exactFactorBase(pari, archive) {
  const lib = path.join(pari, "Olinux-x86_64");
  const pristine = run("tar", [
    "-xOf",
    archive,
    "pari-2.17.4/src/basemath/buch2.c",
  ]);
  assert.equal(
    hash(pristine),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  );
  const source = `${pristine}
int main(void) {
  pari_init(256000000,10000); DEBUGLEVEL=0;
  GEN nf=nfinit(gp_read_str("x^3-20018*x+20034"),nbits2prec(192));
  GRHcheck_t S; init_GRHcheck(&S,3,nf_get_r1(nf),dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);
  FB_t F={0}; FBgen(&F,nf,3,5,31,&S);
  GEN cyclic,auts=automorphism_matrices(nf,&cyclic); subFBgen(&F,auts,cyclic,5.,MINSFB);
  printf("F %ld %ld %ld ",F.KC,F.KCZ,F.KCZ2); pari_printf("%Ps",F.prodZ);
  for(long iz=1;iz<=F.KCZ2;iz++) printf(" %ld",F.FB[iz]); putchar('\\n');
  for(long iz=1;iz<=F.KCZ2;iz++) {
    long p=F.FB[iz]; GEN P=gel(F.LV,p); long raw=lg(P),J=raw,last=pr_get_e(gel(P,J-1)); if(last==1)J--;
    printf("O %ld %ld %ld %ld %ld\\n",iz,p,raw,last,J);
  }
  for(long iz=1;iz<=F.KCZ;iz++) {
    long p=F.FB[iz],off=F.iLP[p]; GEN P=gel(F.LV,p); printf("G %ld %ld %ld",p,off,lg(P)-1);
    for(long j=1;j<lg(P);j++) { GEN pr=gel(P,j),tau=pr_get_tau(pr); long inert=typ(tau)==t_INT;
      printf(" %ld %ld %ld",pr_get_e(pr),pr_get_f(pr),inert);
      for(long a=1;a<=3;a++) for(long b=1;b<=3;b++) { putchar(' '); pari_printf("%Ps",inert?gen_0:gcoeff(tau,a,b)); }
    } putchar('\\n');
  }
  printf("A %ld\\n",lg(auts)-1); free_GRHcheck(&S); pari_close(); return 0;
}`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-honesty-scheduler-"));
  const cfile = path.join(directory, "factor-base.c");
  const binary = path.join(directory, "factor-base");
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
  const lines = run(binary, []).trim().split("\n");
  const header = lines.shift().split(" ");
  assert.equal(header.shift(), "F");
  const [KC, KCZ, KCZ2] = header.splice(0, 3).map(Number);
  const product = header.shift();
  const backing = header.map(Number);
  const outer = [];
  const groups = [];
  let automorphisms = -1;
  for (const line of lines) {
    const values = line.split(" ");
    const kind = values.shift();
    if (kind === "O") {
      outer.push(values.map(Number));
    } else if (kind === "G") {
      const prime = Number(values.shift());
      const offset = Number(values.shift());
      const count = Number(values.shift());
      const ideals = [];
      for (let i = 0; i < count; i += 1) {
        ideals.push({
          e: Number(values.shift()),
          f: Number(values.shift()),
          inert: Number(values.shift()),
          tau: values.splice(0, 9),
        });
      }
      assert.equal(values.length, 0);
      groups.push({ prime, offset, ideals });
    } else if (kind === "A") {
      automorphisms = Number(values[0]);
    } else {
      assert.fail(`unknown factor-base record ${kind}`);
    }
  }
  return {
    KC,
    KCZ,
    KCZ2,
    product,
    backing,
    outer,
    groups,
    automorphisms,
    sourceSha256: hash(source),
    directory,
  };
}

function exactInput(template, factorBase, ideal, norm) {
  const input = structuredClone(template);
  const count = factorBase.KC;
  const square = 9;
  input.ideal = Array(square).fill("0");
  input.admission_ideal = ideal.map(String);
  input.admission_factor_product = factorBase.product;
  input.admission_prime_offsets = input.admission_prime_offsets.map(() => "-1");
  input.admission_prime_counts = input.admission_prime_counts.map(() => "0");
  input.admission_group_tau = [];
  input.admission_group_e = [];
  input.admission_group_f = [];
  input.admission_group_inert = [];
  input.relation_primes = [];
  input.ramification = [];
  for (const group of factorBase.groups) {
    input.admission_prime_offsets[group.prime] = String(group.offset);
    input.admission_prime_counts[group.prime] = String(group.ideals.length);
    for (const primeIdeal of group.ideals) {
      input.admission_group_tau.push(...primeIdeal.tau);
      input.admission_group_e.push(String(primeIdeal.e));
      input.admission_group_f.push(String(primeIdeal.f));
      input.admission_group_inert.push(String(primeIdeal.inert));
      input.relation_primes.push(String(group.prime));
      input.ramification.push(String(primeIdeal.e));
    }
  }
  assert.equal(input.admission_group_e.length, count);
  input.nrelid = "0";
  input.track_small = "0";
  input.track_fact = "0";
  input.subfactor = [];
  input.extra = [];
  input.extra_count = "0";
  input.relation = Array(count).fill("0");
  input.relation_scratch = Array(count).fill("0");
  input.relation_basis = Array(count * count).fill("0");
  input.relation_state = ["0", "4", String(count), "0", "0", "4"];
  input.relation_records = Array(4 * count).fill("0");
  input.relation_hashes = Array(4).fill("0");
  input.relation_metadata = Array(12).fill("0");
  input.generators = Array(12).fill("0");
  input.progress = ["0", "0", "0", "0"];
  input.preparation_state = ["0"];
  input.state = input.state.map(() => "0");
  input.counters = input.counters.map(() => "0");
  input.cursor_output = input.cursor_output.map(() => "0");
  input.x = input.x.map(() => "0");
  input.y = input.y.map(() => 0);
  input.z = input.z.map(() => 0);
  input.inc = input.inc.map(() => "0");
  return { input, norm: String(norm), jid: "0" };
}

async function main() {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(
    process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  assert.equal(
    hash(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  // Rebuild and run the existing pristine be_honest trace before consuming
  // any compact fixture data.
  const leafCheck = JSON.parse(
    run(process.execPath, [
      path.join(__dirname, "check_honesty_branch.cjs"),
      pari,
      archive,
    ]),
  );
  assert.equal(leafCheck.probes, 51);
  const leaf = JSON.parse(
    fs.readFileSync(path.join(__dirname, "honesty_branch_fixture.json")),
  );
  const factorBase = exactFactorBase(pari, archive);
  assert.deepEqual(factorBase.backing, [2, 3, 7, 11, 13, 17, 23, 29, 31]);
  assert.deepEqual(factorBase.outer.slice(2, 4), [
    [3, 7, 2, 1, 1],
    [4, 11, 3, 2, 3],
  ]);
  assert.equal(factorBase.automorphisms, 0);

  const prepared = JSON.parse(
    run(process.execPath, [
      path.join(__dirname, "check_prepared_small_norm.cjs"),
      pari,
      archive,
      "--export-fixtures",
      "--unreduced",
      "--distinct",
    ]),
  );
  const template = prepared.cases[0].input;
  assert.equal(Number(template.n), 3);
  const collectorNames = signature(
    "unreduced_ideal_collector.py",
    "pari_collect_unreduced_ideal",
  );
  const schedulerNames = {
    begin: signature("honesty_scheduler.py", "pari_honesty_begin_frozen"),
    resume: signature("honesty_scheduler.py", "pari_honesty_resume_frozen"),
  };
  const payload = { leaf, factorBase, template, collectorNames, schedulerNames };
  const python = run(
    "python3",
    [
      "-c",
      `import copy,decimal,importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:3]; d=json.load(sys.stdin)
s=importlib.import_module('bench.pari-class-group-port.honesty_scheduler')
c=importlib.import_module('bench.pari-class-group-port.unreduced_ideal_collector')
leaf=d['leaf']; data=leaf['arithmetic']; n=3; zero=lambda k:[0]*k
state=[0]*21; ideal=[0]*9
s.pari_honesty_begin_frozen(list(map(int,data['initialIdeal'])),3,2,9,0,[3,7,2,1,1,4,11,3,2,3],state,ideal)
rng=list(map(int,data['randomState'])); staged_rng=zero(66); statuses=[]; counters=[]; states=[state.copy()]
def retry():
 return [0,list(map(int,data['basisTable'])),list(map(int,data['initialIdeal'])),list(map(int,data['subfactor']['generator'])),3,int(data['subfactor']['prime']),1,1,rng,staged_rng,state,zero(3),zero(3),zero(3),zero(3),zero(3),zero(9),zero(9),zero(18),zero(30),zero(12),zero(3),zero(9),ideal]
for attempt,norm in enumerate(leaf['probeNorms']):
 v={}
 raw=copy.deepcopy(d['template'])
 raw.update(ideal=list(map(str,[0]*9)),admission_ideal=list(map(str,ideal)),admission_factor_product=d['factorBase']['product'],nrelid='0',track_small='0',track_fact='0',subfactor=[],extra=[],extra_count='0',relation=['0']*3,relation_scratch=['0']*3,relation_basis=['0']*9,relation_state=['0','4','3','0','0','4'],relation_records=['0']*12,relation_hashes=['0']*4,relation_metadata=['0']*12,generators=['0']*12,progress=['0']*4,preparation_state=['0'])
 raw['admission_prime_offsets']=['-1']*len(raw['admission_prime_offsets']);raw['admission_prime_counts']=['0']*len(raw['admission_prime_counts'])
 for key in ('admission_group_tau','admission_group_e','admission_group_f','admission_group_inert','relation_primes','ramification'):raw[key]=[]
 for g in d['factorBase']['groups']:
  raw['admission_prime_offsets'][g['prime']]=str(g['offset']);raw['admission_prime_counts'][g['prime']]=str(len(g['ideals']))
  for P in g['ideals']:
   raw['admission_group_tau']+=P['tau'];raw['admission_group_e'].append(str(P['e']));raw['admission_group_f'].append(str(P['f']));raw['admission_group_inert'].append(str(P['inert']));raw['relation_primes'].append(str(g['prime']));raw['ramification'].append(str(P['e']))
 for key in ('state','counters','cursor_output','x','inc'):raw[key]=['0']*len(raw[key])
 for key in ('y','z'):raw[key]=[0.0]*len(raw[key])
 for name,kind in d['collectorNames']:
  x = int(norm) if name=='admission_ideal_norm' else 0 if name=='jid' else raw[name]
  conv=float if kind in ('float','Float64Buffer') else int
  v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 status=c.pari_collect_unreduced_ideal(**v);statuses.append(status);counters.append(v['counters'][:4]+v['preparation_flags'][:2]+v['progress'][:4])
 if status!=0:raise AssertionError(('probe',attempt,status,counters[-1]))
 if attempt<50:
  if s.pari_honesty_resume_frozen(*retry())!=1:raise AssertionError('early scheduler stop')
  states.append(state.copy())
 else:
  if s.pari_honesty_resume_frozen(*retry())!=0:raise AssertionError('missing scheduler stop')
print(json.dumps({'statuses':statuses,'counters':counters,'states':states,'finalState':state,'finalRng':list(map(str,rng)),'finalIdeal':list(map(str,ideal))}))`,
      path.resolve(__dirname, "../.."),
      path.resolve(__dirname, "../../src/lib"),
    ],
    { input: JSON.stringify(payload) },
  );
  const cp = JSON.parse(python);
  const fixture = {
    identity: {
      pariVersion: "2.17.4",
      archiveSha256: hash(fs.readFileSync(archive)),
      leafFixtureSha256: hash(
        fs.readFileSync(path.join(__dirname, "honesty_branch_fixture.json")),
      ),
      exactFactorBaseSourceSha256: factorBase.sourceSha256,
    },
    outerSchedule: factorBase.outer,
    backingFactorBase: factorBase.backing,
    factorProduct: factorBase.product,
    collectorStatusSha256: hash(JSON.stringify(cp.statuses)),
    collectorCounterSha256: hash(JSON.stringify(cp.counters)),
    schedulerStateSha256: hash(JSON.stringify(cp.states)),
    finalState: cp.finalState,
    finalRngSha256: hash(JSON.stringify(cp.finalRng)),
    finalIdeal: cp.finalIdeal,
    result: { success: 0, finalKCZ: cp.finalState[0], probes: 51, draws: 50 },
    genericGaps: [
      "nontrivial automorphism orbits",
      "outer Q_primpart",
      "idealred threshold",
      "successful KCZ increment and all-success restoration",
    ],
  };
  if (process.argv.includes("--emit")) {
    process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
    return;
  }
  const frozen = JSON.parse(
    fs.readFileSync(path.join(__dirname, "honesty_scheduler_fixture.json")),
  );
  assert.deepEqual(fixture, frozen);

  const schedulerBuilt = await compileKernel({
    sourcePath: path.join(__dirname, "honesty_scheduler.py"),
  });
  const scheduler = require(schedulerBuilt.modulePath);
  const collectorBuilt = await compileKernel({
    sourcePath: path.join(__dirname, "unreduced_ideal_collector.py"),
  });
  const collector = require(collectorBuilt.modulePath).pari_collect_unreduced_ideal;
  const integer = (values) => values.map(BigInt);
  const zero = (length) => Array(length).fill(0n);
  const native = [];
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const state = zero(21);
    const ideal = zero(9);
    assert.equal(
      scheduler.pari_honesty_begin_frozen[backend](
        integer(leaf.arithmetic.initialIdeal),
        3n,
        2n,
        9n,
        0n,
        integer([3, 7, 2, 1, 1, 4, 11, 3, 2, 3]),
        state,
        ideal,
      ),
      11n,
    );
    const rng = integer(leaf.arithmetic.randomState);
    const stagedRng = zero(66);
    const states = [state.map(Number)];
    const statuses = [];
    const counters = [];
    for (let attempt = 0; attempt < 51; attempt += 1) {
      const preparedInput = exactInput(
        template,
        factorBase,
        ideal.map(String),
        leaf.probeNorms[attempt],
      );
      const arguments_ = collectorNames.map(([name, kind]) => {
        const value =
          name === "admission_ideal_norm"
            ? preparedInput.norm
            : name === "jid"
              ? preparedInput.jid
              : preparedInput.input[name];
        if (kind === "float" || kind === "Float64Buffer") {
          return Array.isArray(value) ? value.map(Number) : Number(value);
        }
        return Array.isArray(value) ? value.map(BigInt) : BigInt(value);
      });
      const status = collector[backend](...arguments_);
      statuses.push(Number(status));
      const nativeInput = Object.fromEntries(
        collectorNames.map(([name], index) => [name, arguments_[index]]),
      );
      counters.push([
        ...nativeInput.counters.slice(0, 4),
        ...nativeInput.preparation_flags.slice(0, 2),
        ...nativeInput.progress.slice(0, 4),
      ].map(Number));
      assert.equal(status, 0n, `${backend} no-cache probe ${attempt}`);
      if (attempt === 50) break;
      assert.equal(
        scheduler.pari_honesty_resume_frozen[backend](
          0n,
          integer(leaf.arithmetic.basisTable),
          integer(leaf.arithmetic.initialIdeal),
          integer(leaf.arithmetic.subfactor.generator),
          3n,
          3n,
          1n,
          1n,
          rng,
          stagedRng,
          state,
          zero(3),
          zero(3),
          zero(3),
          zero(3),
          zero(3),
          zero(9),
          zero(9),
          zero(18),
          zero(30),
          zero(12),
          zero(3),
          zero(9),
          ideal,
        ),
        1n,
      );
      states.push(state.map(Number));
    }
    assert.equal(
      scheduler.pari_honesty_resume_frozen[backend](
        0n,
        integer(leaf.arithmetic.basisTable),
        integer(leaf.arithmetic.initialIdeal),
        integer(leaf.arithmetic.subfactor.generator),
        3n,
        3n,
        1n,
        1n,
        rng,
        stagedRng,
        state,
        zero(3),
        zero(3),
        zero(3),
        zero(3),
        zero(3),
        zero(9),
        zero(9),
        zero(18),
        zero(30),
        zero(12),
        zero(3),
        zero(9),
        ideal,
      ),
      0n,
    );
    assert.deepEqual(state.map(Number), cp.finalState);
    assert.deepEqual(ideal.map(String), cp.finalIdeal);
    assert.equal(hash(JSON.stringify(statuses)), frozen.collectorStatusSha256);
    assert.equal(hash(JSON.stringify(counters)), frozen.collectorCounterSha256);
    assert.equal(hash(JSON.stringify(states)), frozen.schedulerStateSha256);
    assert.equal(hash(JSON.stringify(rng.map(String))), frozen.finalRngSha256);
    native.push(backend);
  }
  console.log(
    JSON.stringify({
      frozenCaseComplete: true,
      unequalBounds: true,
      noCacheCollectorProbes: cp.statuses.length,
      schedulerBackends: ["cpython", ...native],
      collectorBackends: ["cpython", ...native],
      finalState: cp.finalState,
      genericGaps: fixture.genericGaps,
      nativeCoreSha256: hash(fs.readFileSync(schedulerBuilt.coreSourcePath)),
      collectorCoreSha256: hash(fs.readFileSync(collectorBuilt.coreSourcePath)),
      oracleDirectory: factorBase.directory,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
