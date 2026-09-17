"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PIN = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const ARCHIVE = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
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

function signature(sourcePath, name) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const match = source.match(new RegExp(`def ${name}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function buildOracle(pari, archive) {
  assert.equal(sha256(fs.readFileSync(archive)), ARCHIVE);
  const pristine = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(sha256(pristine), PIN);
  const sourcePath = path.join(pari, "src/basemath/buch2.c");
  assert.equal(sha256(fs.readFileSync(sourcePath)), PIN);
  const lib = path.join(pari, "Olinux-x86_64");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-quintic-collector-"));
  const cfile = path.join(directory, "oracle.c");
  const binary = path.join(directory, "oracle");
  const source = `#include "${sourcePath}"
static void integer(GEN x){pari_printf("\\\"%Ps\\\"",x);}
static void triple(GEN x){long e;if(typ(x)==t_INT){integer(x);printf(",\\\"-1\\\",\\\"0\\\"");}else{integer(signe(x)?mantissa_real(x,&e):gen_0);printf(",\\\"%ld\\\",\\\"%ld\\\"",signe(x)?bit_prec(x):0,expo(x));}}
static void matrix(const char *name,GEN x,int triples){long n=lg(x)-1;printf("\\\"%s\\\":[",name);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){if(i!=1||j!=1)printf(",");if(triples)triple(gcoeff(x,i,j));else integer(gcoeff(x,i,j));}printf("],");}
static GEN component(GEN column,long row,long r1){if(row<r1)return gel(column,row+1);GEN v=gel(column,r1+1+(row-r1)/2);if(typ(v)==t_COMPLEX)return gel(v,1+(row-r1)%2);return (row-r1)%2?gen_0:v;}
int main(void){
 pari_init(512000000,10000);DEBUGLEVEL=0;setrand(gen_1);
 GEN nf=nfinit(gp_read_str("36+930*x-305*x^2-90*x^3+x^5"),nbits2prec(192));
 long n=nf_get_degree(nf),r1=nf_get_r1(nf);double ld=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2;
 GRHcheck_t S;init_GRHcheck(&S,n,r1,ld);FB_t F={0};FBgen(&F,nf,n,5,31,&S);GEN cyclic,auts=automorphism_matrices(nf,&cyclic);subFBgen(&F,auts,cyclic,5.,MINSFB);
 printf("{\\\"n\\\":%ld,\\\"real\\\":%ld,\\\"precision\\\":192,\\\"support\\\":",n,r1);integer(F.prodZ);
 printf(",\\\"factorlimit\\\":%lu,\\\"primeLimit\\\":%lu,",GP_DATA->factorlimit,maxprimelim());
 matrix("G0",nf_get_roundG(nf),0);matrix("embedding",nf_get_G(nf),1);
 printf("\\\"M\\\":[");GEN M=nf_get_M(nf);for(long i=0;i<n;i++)for(long j=1;j<=n;j++){if(i||j!=1)printf(",");triple(component(gel(M,j),i,r1));}
 printf("],\\\"groups\\\":[");long first=1;for(long iz=1;iz<=F.KCZ;iz++){long p=F.FB[iz];if(!first)printf(",");first=0;GEN group=gel(F.LV,p);printf("[%ld,%ld,%ld",p,F.iLP[p],lg(group)-1);for(long j=1;j<lg(group);j++){GEN P=gel(group,j),tau=pr_get_tau(P);long inert=typ(tau)==t_INT;printf(",%ld,%ld,%ld",pr_get_e(P),pr_get_f(P),inert);for(long row=1;row<=n;row++)for(long col=1;col<=n;col++){printf(",");integer(inert?gen_0:gcoeff(tau,row,col));}}printf("]");}
 printf("],\\\"primes\\\":[");for(long i=1;i<=pari_PRIMES[0];i++){if(i>1)printf(",");printf("%lu",pari_PRIMES[i]);}
 printf("],\\\"products\\\":[");GEN products=prodprimes();for(long i=1;i<lg(products);i++){if(i>1)printf(",");integer(gel(products,i));}
 printf("],\\\"probes\\\":[");long ps[6]={11,11,11,13,29,29},js[6]={1,2,3,1,1,2};
 for(long q=0;q<6;q++){GEN P=gel(gel(F.LV,ps[q]),js[q]),I=pr_hnf(nf,P),NI=pr_norm(P);FP_t fp;minim_alloc(n+1,&fp.q,&fp.x,&fp.y,&fp.z,&fp.v);FACT *fact=(FACT*)stack_malloc((F.KC+1)*sizeof(FACT));fact[0].pr=0;long ok=Fincke_Pohst_ideal(NULL,&F,nf,I,NI,fact,0,&fp,NULL,0,0,0,NULL,NULL);if(q)printf(",");printf("{\\\"p\\\":%ld,\\\"j\\\":%ld,\\\"status\\\":%ld,\\\"norm\\\":",ps[q],js[q],ok);integer(NI);printf(",");matrix("ideal",I,0);printf("\\\"factCount\\\":%ld}",fact[0].pr);}
 printf("],\\\"KC\\\":%ld,\\\"KCZ\\\":%ld,\\\"KCZ2\\\":%ld,\\\"rng\\\":",F.KC,F.KCZ,F.KCZ2);integer(getrand());puts("}");
 free_GRHcheck(&S);pari_close();return 0;
}`;
  fs.writeFileSync(cfile, source);
  run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${lib}`,
    cfile, `-L${lib}`, `-Wl,-rpath,${lib}`, "-lpari", "-lm", "-o", binary]);
  return { directory, binary, sourceSha256: sha256(source) };
}

function makeInput(raw, probe, names) {
  const n = raw.n;
  const z = length => Array(length).fill("0");
  const offsets = Array(32).fill("-1");
  const counts = z(32);
  const tau = [], es = [], fs_ = [], inert = [], relationPrimes = [];
  for (const group of raw.groups) {
    const [prime, offset, count] = group;
    offsets[prime] = String(offset);
    counts[prime] = String(count);
    let position = 3;
    for (let index = 0; index < count; index += 1) {
      es.push(String(group[position++]));
      fs_.push(String(group[position++]));
      inert.push(String(group[position++]));
      tau.push(...group.slice(position, position + n * n).map(String));
      relationPrimes.push(String(prime));
      position += n * n;
    }
  }
  const size = es.length;
  assert.equal(size, raw.KC);
  const capacity = 10 * (size + 2) + 50;
  const values = {
    matrix: z(3 * n * n), ideal: z(n * n), n: String(n), precision: "192", scale: 4,
    track_small: "0", reduction: z(3 * n * n), vectors: z(3 * n * n),
    betas: z(3 * n), norms: z(3 * n), column: z(3 * n),
    float_q: Array((n + 1) ** 2).fill(0), float_v: Array(n + 1).fill(0),
    bound: [0], cache: z(3), a: z(64), b: z(64), p: z(64), q: z(64),
    stack: z(128), x: z(n + 1), y: Array(n + 1).fill(0),
    z: Array(n + 1).fill(0), inc: z(n + 1), state: z(5),
    cursor_output: z(n + 1), element: z(n), counters: z(4),
    admission_matrix_m: raw.M.filter((unused, i) => i % 3 === 0),
    admission_matrix_p: raw.M.filter((unused, i) => i % 3 === 1),
    admission_matrix_e: raw.M.filter((unused, i) => i % 3 === 2),
    admission_embedding_m: z(n), admission_embedding_p: z(n),
    admission_embedding_e: z(n), admission_real_count: String(raw.real),
    admission_ideal_norm: probe.norm, admission_ideal: probe.ideal,
    admission_mode: "2", admission_factor_product: raw.support,
    admission_primes: raw.primes.map(String), admission_products: raw.products,
    admission_factorlimit: String(raw.factorlimit), admission_prime_limit: String(raw.primeLimit),
    admission_rational_factors: z(16), admission_rational_exponents: z(16),
    admission_prime_offsets: offsets, admission_prime_counts: counts,
    admission_group_tau: tau, admission_group_e: es, admission_group_f: fs_,
    admission_group_inert: inert, admission_tau: z(n * n), admission_x: z(n),
    admission_y: z(n), admission_spare: z(n), admission_stack: z(32),
    admission_primitive: z(n * n), admission_columns: z(n * n),
    admission_values: z(n), admission_temporary: z(n), admission_indices: z(128),
    admission_exponents: z(128), diagnostic: z(3), nrelid: "0", track_fact: "0",
    jid: "0", jid0: "0", e0: "0", subfactor: [], extra: [], extra_count: "0",
    relation_primes: relationPrimes, ramification: es.slice(), relation: z(size),
    relation_state: ["0", String(capacity), String(size), "0", "0", "4"],
    relation_basis: z(size * size), relation_records: z(capacity * size),
    relation_hashes: z(capacity), relation_metadata: z(capacity * 3),
    relation_scratch: z(size), generators: z(capacity * n), progress: z(4),
    preparation_rounded_embedding: raw.G0, preparation_embedding: raw.embedding,
  };
  for (const [name, type] of names) {
    if (name in values) continue;
    const short = name.replace(/^preparation_/, "");
    let length = n * n;
    if (["y", "s", "exponents", "s_exponents", "alpha", "column_exponents", "float_scratch"].includes(short)) length = n;
    else if (short === "diagnostic") length = 7;
    else if (short === "rank_diagnostic") length = 3;
    else if (short === "flags") length = 2;
    else if (short === "selection") length = 5;
    else if (short === "stages") length = 4;
    else if (["temporary", "state"].includes(short)) length = 1;
    else if (["r1", "r2", "r3", "inverse", "first", "second", "final"].includes(short)) length = 12;
    else if (["t1", "t2", "t3", "integers", "rounded"].includes(short)) length = 4;
    values[name] = Array(length).fill(type === "Float64Buffer" ? 0 : "0");
  }
  assert.deepEqual(Object.keys(values).sort(), names.map(([name]) => name).sort());
  return values;
}

async function main() {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz");
  const oracle = buildOracle(pari, archive);
  const rawText = run(oracle.binary, []);
  const raw = JSON.parse(rawText);
  assert.deepEqual([raw.n, raw.KC, raw.KCZ, raw.KCZ2], [5, 6, 3, 10]);
  assert.deepEqual(raw.probes.map(row => [row.p, row.j, row.status]), [
    [11, 1, 1], [11, 2, 1], [11, 3, 1], [13, 1, 1], [29, 1, 1], [29, 2, 1],
  ]);
  const sourcePath = path.join(__dirname, "unreduced_ideal_collector.py");
  const names = signature(sourcePath, "pari_collect_unreduced_ideal");
  const inputs = raw.probes.map(probe => makeInput(raw, probe, names));
  const payload = { names, inputs };
  if (process.argv.includes("--export-fixtures")) {
    console.log(JSON.stringify({
      schema: "pari-quintic-honesty-collector-v1",
      identity: { archiveSha256: ARCHIVE, buch2Sha256: PIN,
        oracleSourceSha256: oracle.sourceSha256, rawSha256: sha256(rawText) },
      names, inputs, expectedStatuses: raw.probes.map(probe => probe.status),
    }));
    return;
  }
  const python = JSON.parse(run("python3", ["-c", `
import decimal,importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
f=importlib.import_module('bench.pari-class-group-port.unreduced_ideal_collector').pari_collect_unreduced_ideal
out=[]
for raw in d['inputs']:
 v={}
 for name,kind in d['names']:
  x=raw[name];conv=float if kind in ('float','Float64Buffer') else int
  v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 before=json.dumps(v,sort_keys=True,separators=(',',':'))
 try:
  status=f(*(v[name] for name,kind in d['names']))
  out.append({'status':status,'blocked':False})
 except ValueError as error:
  after=json.dumps(v,sort_keys=True,separators=(',',':'))
  out.append({'blocked':True,'error':str(error),'transactional':before==after})
print(json.dumps(out))`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")],
    { input: JSON.stringify(payload) }));
  assert.deepEqual(python.map(row => row.blocked), Array(6).fill(false));
  const sageStatuses = python.map(row => row.status);
  assert.deepEqual(sageStatuses, [1, 0, 0, 1, 1, 1]);
  const pariStatuses = raw.probes.map(row => row.status);
  const mismatches = sageStatuses.flatMap((status, index) =>
    status === pariStatuses[index]
      ? []
      : [{ index, pari: pariStatuses[index], sage: status }]);
  assert.deepEqual(mismatches, [
    { index: 1, pari: 1, sage: 0 },
    { index: 2, pari: 1, sage: 0 },
  ]);
  console.log(JSON.stringify({
    quinticExporterComplete: true,
    pariOracleStatuses: pariStatuses,
    sageCollectorStatuses: sageStatuses,
    sageCollectorProbesExecuted: python.length,
    matchingProbes: python.length - mismatches.length,
    mismatches,
    blockedInputs: 0,
    blocker: "two downstream collector decisions remain after exact degree-five ranked preparation",
    rankedPreparationClosed: true,
    transcriptSha256: sha256(JSON.stringify(python)),
    backendsAttempted: ["cpython"],
    nativeAttempted: false,
    nativeReason: "two same-source CPython collector decisions still diverge downstream",
    oracleDirectory: oracle.directory,
  }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
