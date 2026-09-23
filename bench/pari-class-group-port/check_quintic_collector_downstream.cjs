"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PIN = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, before);
  return source.replace(before, after);
}

function pariTrace(pari, archive) {
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(crypto.createHash("sha256").update(source).digest("hex"), PIN);
  source = replaceOnce(source, '#include "paripriv.h"', '#include "paripriv.h"\nstatic long sagejs_probe;');
  source = replaceOnce(source,
    "    if (++try_factor > maxtry_FACT) break;\n\n    if (DEBUGLEVEL && Nsmall) (*Nsmall)++;\n    if (!factorgen(F,nf,I,NI,gx,fact)) continue;",
    `    if (++try_factor > maxtry_FACT) break;
    if (DEBUGLEVEL && Nsmall) (*Nsmall)++;
    { long sagejs_fact=factorgen(F,nf,I,NI,gx,fact);
      if (sagejs_fact) { printf("SUCCESS %ld %ld",sagejs_probe,try_factor);
        for(long sagejs_i=1;sagejs_i<=N;sagejs_i++) printf(" %ld",fp->x[sagejs_i]);
        for(long sagejs_i=1;sagejs_i<=N;sagejs_i++) pari_printf(" %Ps",gx[sagejs_i]);
        printf(" %ld",fact[0].pr);
        for(long sagejs_i=1;sagejs_i<=fact[0].pr;sagejs_i++) printf(" %ld %ld",fact[sagejs_i].pr,fact[sagejs_i].ex);
        puts(""); } if (!sagejs_fact) continue; }`);
  source += String.raw`
int main(void){pari_init(512000000,10000);DEBUGLEVEL=0;setrand(gen_1);
 GEN nf=nfinit(gp_read_str("36+930*x-305*x^2-90*x^3+x^5"),nbits2prec(192));
 long n=nf_get_degree(nf),r1=nf_get_r1(nf);double ld=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2;
 GRHcheck_t S;init_GRHcheck(&S,n,r1,ld);FB_t F={0};FBgen(&F,nf,n,5,31,&S);GEN cyclic,auts=automorphism_matrices(nf,&cyclic);subFBgen(&F,auts,cyclic,5.,MINSFB);
 printf("SCALE %.17g\n",4.*maxtry_FACT/F.ballvol);
 long ps[6]={11,11,11,13,29,29},js[6]={1,2,3,1,1,2};for(long q=0;q<6;q++){GEN P=gel(gel(F.LV,ps[q]),js[q]),I=pr_hnf(nf,P),NI=pr_norm(P);FP_t fp;minim_alloc(n+1,&fp.q,&fp.x,&fp.y,&fp.z,&fp.v);FACT *fact=(FACT*)stack_malloc((F.KC+1)*sizeof(FACT));fact[0].pr=0;sagejs_probe=q;long ok=Fincke_Pohst_ideal(NULL,&F,nf,I,NI,fact,0,&fp,NULL,0,0,0,NULL,NULL);printf("END %ld %ld\n",sagejs_probe,ok);}
 free_GRHcheck(&S);pari_close();return 0;}
`;
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-quintic-downstream-"));
  const cfile=path.join(directory,"oracle.c"),binary=path.join(directory,"oracle"),lib=path.join(pari,"Olinux-x86_64");fs.writeFileSync(cfile,source);
  run("cc",["-O2",`-I${path.join(pari,"src/headers")}`,`-I${lib}`,cfile,`-L${lib}`,`-Wl,-rpath,${lib}`,"-lpari","-lm","-o",binary]);
  return run(binary,[]);
}

const pari=path.resolve(process.argv[2]||"/home/user/upstream/pari-2.17.4");
const archive=path.resolve(process.argv[3]||"/home/user/upstream/pari-2.17.4.tar.gz");
const trace=pariTrace(pari,archive).trim().split("\n");
const scale=Number(trace.find(line=>line.startsWith("SCALE ")).split(" ")[1]);
const successes=trace.filter(line=>line.startsWith("SUCCESS ")).map(line=>{
  const x=line.split(" ").slice(1).map(Number), probe=x.shift(),attempt=x.shift();
  const cursor=x.slice(0,5),element=x.slice(5,10),factorCount=x[10],pairs=x.slice(11);
  assert.equal(pairs.length,2*factorCount);
  return {probe,attempt,cursor,element,factorCount,
    indices:pairs.filter((unused,index)=>index%2===0),
    exponents:pairs.filter((unused,index)=>index%2===1)};
});
assert.deepEqual(trace.filter(line=>line.startsWith("END ")).map(line=>line.split(" ").map(Number).slice(1)),
  Array.from({length:6},(unused,index)=>[index,1]));
assert.deepEqual(successes.map(row=>row.probe),[0,1,2,3,4,5]);
const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,"check_quintic_collector_fixture.cjs"),pari,archive]));
assert.deepEqual(fixture.pariOracleStatuses,Array(6).fill(1));
assert.deepEqual(fixture.sageCollectorStatuses,Array(6).fill(1));
assert.deepEqual(fixture.candidateAttempts,successes.map(row=>row.attempt));
assert.ok(Math.abs(fixture.pariSearchScale-scale)<1e-12);
assert.ok(Math.abs(fixture.sageSearchScale-scale)<1e-12);
console.log(JSON.stringify({
  exactQuinticCollectorClosure:true,
  pariSearchScale:scale,
  sageSearchScale:fixture.sageSearchScale,
  statuses:fixture.sageCollectorStatuses,
  attempts:successes.map(row=>row.attempt),
  successfulElements:successes.map(row=>row.element),
  successfulFactors:successes.map(row=>({indices:row.indices,exponents:row.exponents})),
  firstFormerMismatch:{probe:1,attempt:successes[1].attempt},
  secondFormerMismatch:{probe:2,attempt:successes[2].attempt},
}));
