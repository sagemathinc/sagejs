"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
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

function oracle(pari, archive) {
  const lib = path.join(pari, "Olinux-x86_64");
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(
    sha256(source),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  );
  source += String.raw`
static void outv(const char *s, GEN v) { printf("%s %ld",s,lg(v)-1); for(long i=1;i<lg(v);i++) printf(" %ld",v[i]); putchar('\n'); }
static void outm(const char *s, GEN M) { long n=lg(M)-1,m=n?lg(gel(M,1))-1:0; printf("%s %ld %ld",s,m,n); for(long i=1;i<=m;i++)for(long j=1;j<=n;j++) pari_printf(" %Ps",gcoeff(M,i,j)); putchar('\n'); }
static void outr(const char *s) { GEN r=getrand(); printf("%s",s); for(long i=0;i<66;i++){ulong v=*int_W(r,i);if(i==65)v&=63;printf(" %lu",v);} putchar('\n'); }
int main(void) {
  pari_init(256000000,10000); setrand(gen_1);
  GEN nf=nfinit(gp_read_str("x^4-2000022*x-2000042"),nbits2prec(192)); long n=nf_get_degree(nf);
  GRHcheck_t S; init_GRHcheck(&S,n,nf_get_r1(nf),dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);
  FB_t F={0}; FBgen(&F,nf,n,37,37,&S); subFBgen(&F,cgetg(1,t_VEC),cgetg(1,t_VEC),10.,2); F.L_jid=F.perm;
  printf("H %ld %ld %ld %ld %ld\n",n,F.KC,lg(F.subFB)-1,F.MAXDEPSIZESFB,F.MAXDEPSFB); outv("D",F.subFB); outv("P",F.perm);
  printf("A %ld",F.KC); for(long i=1;i<=F.KC;i++)printf(" %d",bad_subFB(&F,i)); putchar('\n');
  printf("Q %ld",F.KC); for(long i=1;i<=F.KC;i++){GEN q=gel(F.LP,i),g=pr_get_gen(q);pari_printf(" %Ps %ld %ld",pr_get_p(q),pr_get_e(q),pr_get_f(q));for(long j=1;j<=n;j++)pari_printf(" %Ps",gel(g,j));} putchar('\n');
  printf("B %ld",n); for(long a=1;a<=n;a++)for(long b=1;b<=n;b++){GEN t=tablemul_ei_ej(nf,a,b);for(long k=1;k<=n;k++)pari_printf(" %Ps",gel(t,k));} putchar('\n'); outr("X");
  long nreldep=F.MAXDEPSIZESFB,sfb_trials=0,LIMC=37,LIMCMAX=1000,restart=0;
  if (++nreldep > F.MAXDEPSIZESFB) { if (++sfb_trials>SFB_MAX && LIMC<LIMCMAX/2) restart=1; F.sfb_chg=sfb_INCREASE; nreldep=0; }
  else if (!(nreldep % F.MAXDEPSFB)) F.sfb_chg=sfb_CHANGE;
  if (!restart && F.sfb_chg && !subFB_change(&F)) restart=1;
  printf("T %ld %ld %ld %d %ld %ld %ld\n",restart,nreldep,sfb_trials,F.sfb_chg,lg(F.subFB)-1,F.MAXDEPSIZESFB,F.MAXDEPSFB); outv("C",F.subFB);
  GEN ex=cgetg(lg(F.subFB),t_VECSMALL),R=get_random_ideal(&F,nf,ex); outv("E",ex); outm("I",R); outr("Y"); F.L_jid=F.perm; outv("L",F.L_jid);
  delete_FB(&F); free_GRHcheck(&S); pari_close(); return 0;
}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-rnd-scheduler-"));
  const cfile = path.join(directory, "oracle.c");
  const binary = path.join(directory, "oracle");
  fs.writeFileSync(cfile, source);
  run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${lib}`, cfile, `-L${lib}`, `-Wl,-rpath,${lib}`, "-lpari", "-lm", "-o", binary]);
  const lines = run(binary, []).trim().split("\n").map((line) => line.split(" "));
  const take = (kind) => { const row=lines.shift(); assert.equal(row.shift(),kind); return row; };
  const h=take("H").map(Number), initial=take("D").slice(1).map(Number), permutation=take("P").slice(1).map(Number), bad=take("A").slice(1).map(Number);
  const q=take("Q"), descriptorCount=Number(q.shift()), primes=[],ramification=[],residueDegree=[],generators=[];
  for(let i=0;i<descriptorCount;i++){primes.push(q.shift());ramification.push(Number(q.shift()));residueDegree.push(Number(q.shift()));for(let j=0;j<h[0];j++)generators.push(q.shift());}
  assert.equal(q.length,0);
  const b=take("B"); assert.equal(Number(b.shift()),h[0]);
  const rngBefore=take("X"), transition=take("T").map(Number), current=take("C").slice(1).map(Number), exponents=take("E").slice(1).map(Number);
  const idealRow=take("I"), rows=Number(idealRow.shift()),columns=Number(idealRow.shift()); assert.equal(rows,h[0]);assert.equal(columns,h[0]);
  const ideal=idealRow, rngAfter=take("Y"), search=take("L").slice(1).map(Number);assert.equal(lines.length,0);
  return {
    fixture: {
      identity:{pariVersion:"2.17.4",archiveSha256:"02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",buch2Sha256:"904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac"},
      input:{polynomial:"x^4-2000022*x-2000042",precision:192,C1:37,C2:37,setrand:"1",schedulerState:[2,h[3],0,0,h[2],h[3],h[4],37,1000,0,0,0]},
      factorBase:{degree:h[0],count:h[1],bad,permutation,initialSubfactor:initial,primes,ramification,residueDegree,generators},
      arithmetic:{basisTable:b,rngBefore,rngAfter,exponents,randomIdeal:ideal},
      result:{transition,current,search,schedulerState:[2,transition[1],transition[2],transition[3],transition[4],transition[5],transition[6],37,1000,1,1,h[2]]},
      semantics:{sourceLines:"buch2.c:301-344,2635-2677,3946-3970",branch:"Predeclared field-3 resident increase: nreldep starts at MAXDEPSIZESFB, grows subFB, then executes get_random_ideal."},
    }, directory,
  };
}

function scratch(n) {
  const zero=(count)=>Array(count).fill(0n);
  return [zero(n),zero(n),zero(n),zero(n),zero(3),zero(3),zero(n*n),zero(n*n),zero(n*n),zero(2*n*n),zero(n*(3*n+1)),zero(n*(n+1)),zero(n),zero(n*n),zero(n*n)];
}

async function main(){
  const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]);
  const got=oracle(pari,archive),fixturePath=path.join(__dirname,"rnd_relation_scheduler_fixture.json");
  if(process.argv.includes("--emit")){process.stdout.write(JSON.stringify(got.fixture,null,2)+"\n");return;}
  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const fixture=JSON.parse(fs.readFileSync(fixturePath));assert.deepEqual(got.fixture,fixture);
  const root=path.resolve(__dirname,"../.."),lib=path.resolve(__dirname,"../../src/lib");
  const cp=run("python3",["-c",String.raw`
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]; f=json.load(sys.stdin);m=importlib.import_module('bench.pari-class-group-port.rnd_relation_scheduler')
fb=f['factorBase'];s=f['input']['schedulerState'][:];current=fb['initialSubfactor']+[0]*(fb['count']-len(fb['initialSubfactor']));chosen=[0]*fb['count'];present=[0]*fb['count']
assert m.pari_begin_random_relation_schedule(fb['bad'],fb['permutation'],fb['permutation'],len(fb['permutation']),current,s,chosen,present)==1
assert s==f['result']['schedulerState'] and current[:s[4]]==f['result']['current']
n=fb['degree'];z=lambda k:[0]*k;w=[z(n),z(n),z(n),z(n),z(3),z(3),z(n*n),z(n*n),z(n*n),z(2*n*n),z(n*(3*n+1)),z(n*(n+1)),z(n),z(n*n),z(n*n)]
r=list(map(int,f['arithmetic']['rngBefore']));ex=z(s[4]);attempts=m.pari_random_subfactor_ideal(list(map(int,f['arithmetic']['basisTable'])),r,current,s[4],list(map(int,fb['primes'])),fb['ramification'],fb['residueDegree'],list(map(int,fb['generators'])),n,ex,*w)
assert attempts==1 and ex==f['arithmetic']['exponents'] and w[-1]==list(map(int,f['arithmetic']['randomIdeal'])) and r==list(map(int,f['arithmetic']['rngAfter']))
search=z(fb['count']);assert m.pari_finish_random_relation_schedule(fb['permutation'],s,search)==fb['count'];assert search==f['result']['search']
print('cpython-ok')
`,root,lib],{input:JSON.stringify(fixture)});assert.match(cp,/cpython-ok/);
  const built=await compileKernel({sourcePath:path.join(__dirname,"rnd_relation_scheduler.py")}),m=require(built.modulePath),integer=(a)=>a.map(BigInt);
  assert(m.pari_begin_random_relation_schedule.nativeAvailable&&m.pari_random_subfactor_ideal.nativeAvailable);
  for(const backend of ["javascript","gmp"]){
    const fb=fixture.factorBase,n=fb.degree,s=integer(fixture.input.schedulerState),current=integer([...fb.initialSubfactor,...Array(fb.count-fb.initialSubfactor.length).fill(0)]),chosen=integer(Array(fb.count).fill(0)),present=integer(Array(fb.count).fill(0));
    const relationOwner=integer([91,92,93,94]),hnfOwner=integer([5,0,0,7]),owners=[...relationOwner,...hnfOwner];
    assert.equal(m.pari_begin_random_relation_schedule[backend](integer(fb.bad),integer(fb.permutation),integer(fb.permutation),BigInt(fb.permutation.length),current,s,chosen,present),1n);
    assert.deepEqual(s,integer(fixture.result.schedulerState));assert.deepEqual(current.slice(0,Number(s[4])),integer(fixture.result.current));assert.deepEqual([...relationOwner,...hnfOwner],owners);
    const work=scratch(n),rng=integer(fixture.arithmetic.rngBefore),exponents=integer(Array(Number(s[4])).fill(0));
    assert.equal(m.pari_random_subfactor_ideal[backend](integer(fixture.arithmetic.basisTable),rng,current,s[4],integer(fb.primes),integer(fb.ramification),integer(fb.residueDegree),integer(fb.generators),BigInt(n),exponents,...work),1n);
    assert.deepEqual(exponents,integer(fixture.arithmetic.exponents));assert.deepEqual(work.at(-1),integer(fixture.arithmetic.randomIdeal));assert.deepEqual(rng,integer(fixture.arithmetic.rngAfter));assert.deepEqual([...relationOwner,...hnfOwner],owners);
    const search=integer(Array(fb.count).fill(0));assert.equal(m.pari_finish_random_relation_schedule[backend](integer(fb.permutation),s,search),BigInt(fb.count));assert.deepEqual(search,integer(fixture.result.search));
    const malformed=integer(fixture.input.schedulerState),badPermutation=integer(fb.permutation);badPermutation[0]=0n;const before=[...malformed];assert.throws(()=>m.pari_begin_random_relation_schedule[backend](integer(fb.bad),badPermutation,integer(fb.permutation),BigInt(fb.count),integer(Array(fb.count).fill(0)),malformed,integer(Array(fb.count).fill(0)),integer(Array(fb.count).fill(0))),/permutation/);assert.deepEqual(malformed,before);
    const shortRng=integer(fixture.arithmetic.rngBefore),beforeRng=[...shortRng];assert.throws(()=>m.pari_random_subfactor_ideal[backend](integer(fixture.arithmetic.basisTable),shortRng,current,3n,integer(fb.primes),integer(fb.ramification),integer(fb.residueDegree),integer(fb.generators),BigInt(n),integer([0,0,0]),...scratch(n).slice(0,-1),integer(Array(n*n-1).fill(0))),/storage/);assert.deepEqual(shortRng,beforeRng);
  }
  console.log(JSON.stringify({pari:"2.17.4",fixture:sha256(JSON.stringify(fixture)),cpython:true,native:["javascript","gmp"],coreBytes:fs.statSync(built.coreSourcePath).size,branch:"increase+rnd_rel preparation",collectorBoundary:"explicit",oracleDirectory:got.directory}));
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
