"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ARCHIVE = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 600000,
    maxBuffer: 128 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function oracle(pari, archive) {
  assert.equal(hash(fs.readFileSync(archive)), ARCHIVE);
  const sourcePath = path.join(pari, "src/basemath/buch2.c");
  assert.equal(hash(fs.readFileSync(sourcePath)), BUCH2);
  assert.equal(hash(run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"])), BUCH2);
  const lib = path.join(pari, "Olinux-x86_64");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-live-quintic-honesty-"));
  const cfile = path.join(directory, "oracle.c");
  const binary = path.join(directory, "oracle");
  const c = `#include "${sourcePath}"
static void I(GEN x){pari_printf("\\\"%Ps\\\"",x);}
static void V(GEN x,long n){printf("[");for(long i=1;i<=n;i++){if(i>1)printf(",");I(gel(x,i));}printf("]");}
static void M(GEN x,long n){printf("[");for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){if(i>1||j>1)printf(",");I(gcoeff(x,i,j));}printf("]");}
int main(void){
 pari_init(512000000,10000);DEBUGLEVEL=0;setrand(gen_1);
 GEN nf=nfinit(gp_read_str("36+930*x-305*x^2-90*x^3+x^5"),nbits2prec(192));long n=nf_get_degree(nf),r1=nf_get_r1(nf);
 GRHcheck_t S;init_GRHcheck(&S,n,r1,dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);FB_t F={0};FBgen(&F,nf,n,5,31,&S);
 GEN cyclic,auts=automorphism_matrices(nf,&cyclic);subFBgen(&F,auts,cyclic,5.,MINSFB);
 printf("{\\\"degree\\\":%ld,\\\"basis_table\\\":[",n);long first=1;for(long a=1;a<=n;a++)for(long b=1;b<=n;b++){GEN t=tablemul_ei_ej(nf,a,b);for(long k=1;k<=n;k++){if(!first)printf(",");first=0;I(gel(t,k));}}
 printf("],\\\"groups\\\":[");for(long iz=1;iz<=F.KCZ2;iz++){if(iz>1)printf(",");long p=F.FB[iz];GEN L=gel(F.LV,p);printf("{\\\"p\\\":%ld,\\\"ideals\\\":[",p);for(long j=1;j<lg(L);j++){if(j>1)printf(",");GEN P=gel(L,j),g=pr_get_gen(P);printf("{\\\"p\\\":%ld,\\\"e\\\":%ld,\\\"f\\\":%ld,\\\"inert\\\":%ld,\\\"generator\\\":",p,pr_get_e(P),pr_get_f(P),typ(pr_get_tau(P))==t_INT);V(g,n);printf("}");}printf("]}");}
 printf("],\\\"oracle_probes\\\":[");long ps[6]={11,11,11,13,29,29},js[6]={1,2,3,1,1,2};for(long q=0;q<6;q++){if(q)printf(",");GEN P=gel(gel(F.LV,ps[q]),js[q]);printf("{\\\"p\\\":%ld,\\\"j\\\":%ld,\\\"norm\\\":",ps[q],js[q]);I(pr_norm(P));printf(",\\\"ideal\\\":");M(pr_hnf(nf,P),n);printf("}");}
 printf("],\\\"KC\\\":%ld,\\\"KCZ\\\":%ld,\\\"KCZ2\\\":%ld,\\\"nonidentity_automorphisms\\\":%ld,\\\"subFB\\\":[",F.KC,F.KCZ,F.KCZ2,lg(auts)-1);for(long i=1;i<lg(F.subFB);i++){if(i>1)printf(",");printf("%ld",F.subFB[i]);}printf("],\\\"rng_before\\\":");I(getrand());
 FACT *fact=(FACT*)stack_malloc((F.KC+1)*sizeof(FACT));fact[0].pr=0;long ok=be_honest(&F,nf,auts,fact);printf(",\\\"success\\\":%ld,\\\"final_kcz\\\":%ld,\\\"rng_after\\\":",ok,F.KCZ);I(getrand());printf("}\\n");
 free_GRHcheck(&S);pari_close();return 0;}`;
  fs.writeFileSync(cfile, c);
  run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${lib}`, cfile,
    `-L${lib}`, `-Wl,-rpath,${lib}`, "-lpari", "-lm", "-o", binary]);
  return { raw: JSON.parse(run(binary, [])), directory, sourceHash: hash(c) };
}

const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
const archive = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz");
const observed = oracle(pari, archive);
const port = path.resolve(__dirname, "../pari-class-group-port");
const exported = JSON.parse(run("node", [path.join(port, "check_quintic_collector_fixture.cjs"), pari, archive, "--export-fixtures"]));
const payload = { raw: observed.raw, names: exported.names, inputs: exported.inputs };
const python = JSON.parse(run("python3", ["-c", `
import copy,decimal,importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:4]
d=json.load(sys.stdin)
root=importlib.import_module('bench.pari-class-group-e2e.live_quintic_honesty')
collector=importlib.import_module('bench.pari-class-group-port.unreduced_ideal_collector').pari_collect_unreduced_ideal
volume=importlib.import_module('bench.pari-class-group-port.ball_volume')
raw=d['raw']; names=d['names']; calls=[]
def invoke(ideal,norm,index,forced=False):
 v={}
 for name,kind in names:
  x=copy.deepcopy(d['inputs'][index][name]); conv=float if kind in ('float','Float64Buffer') else int
  v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 v['ideal']=list(ideal);v['admission_ideal']=list(ideal);v['admission_ideal_norm']=norm
 v['scale']=volume.pari_small_norm_scale(v['n'])
 status=collector(*(v[name] for name,kind in names));calls.append({'status':status,'attempts':v['counters'][0]})
 return 0 if forced else status
args=({'degree':raw['degree'],'basis_table':raw['basis_table']},{'groups':raw['groups']},raw['KCZ'],raw['KCZ2'],raw['subFB'],[raw['rng_before']])
good=root.live_quintic_honesty(*args,lambda ideal,norm,index:invoke(ideal,norm,index))
before=json.dumps(args,sort_keys=True,separators=(',',':'))
try:
 root.live_quintic_honesty(*args,lambda ideal,norm,index:invoke(ideal,norm,index,index==3))
 forced={'rejected':False}
except ValueError as error:
 forced={'rejected':True,'error':str(error),'owners_unchanged':before==json.dumps(args,sort_keys=True,separators=(',',':'))}
print(json.dumps({'good':good,'calls':calls,'forced':forced}))
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib"), __dirname], { input: JSON.stringify(payload) }));

assert.deepEqual([observed.raw.KC, observed.raw.KCZ, observed.raw.KCZ2], [6, 3, 10]);
assert.equal(observed.raw.nonidentity_automorphisms, 0);
assert.equal(observed.raw.success, 1);
assert.equal(observed.raw.final_kcz, 3);
assert.equal(observed.raw.rng_after, observed.raw.rng_before);
assert.deepEqual(python.good.probes.map(p => [p.p, p.j]), [[11,1],[11,2],[11,3],[13,1],[29,1],[29,2]]);
assert.deepEqual(python.good.probes.map(p => p.norm), observed.raw.oracle_probes.map(p => Number(p.norm)));
assert.deepEqual(python.good.probes.map(p => p.ideal.map(String)), observed.raw.oracle_probes.map(p => p.ideal));
assert.deepEqual(python.good.probes.map(p => p.status), Array(6).fill(1));
assert.deepEqual([python.good.initial_kcz, python.good.transient_kcz, python.good.final_kcz], [3,6,3]);
assert.equal(python.good.rng[0], observed.raw.rng_before);
assert.equal(python.forced.rejected, true);
assert.equal(python.forced.owners_unchanged, true);
assert.deepEqual(python.calls.slice(0,6).map(x => x.status), Array(6).fill(1));
assert.deepEqual(python.calls.slice(6).map(x => x.status), Array(4).fill(1));
console.log(JSON.stringify({ liveQuinticHonesty: true, pristineSuccess: observed.raw.success,
  probes: python.good.probes.length, schedule: python.good.probes.map(p => [p.iz,p.p,p.j]),
  candidateAttempts: python.calls.slice(0,6).map(x => x.attempts), derivedIdealsMatchPrHnf: true,
  collectorStatusesMatch: true, kcz: [3,6,3], rngUnchanged: true,
  forcedFailureRejected: true, forcedFailureOwnersUnchanged: python.forced.owners_unchanged,
  oracleSourceSha256: observed.sourceHash, oracleDirectory: observed.directory }));
