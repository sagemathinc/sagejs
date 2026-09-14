"use strict";
// PARI 2.17.4 comparison scaffolding, not a Sage.js mathematical backend.
// The extracted routine retains PARI's GPL copyright/license in pinnedSource.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const PIN = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";

function source(pinnedSource) {
  assert.equal(createHash("sha256").update(pinnedSource).digest("hex"), PIN,
    "C control requires pristine PARI 2.17.4 buch2.c");
  const first = pinnedSource.indexOf("static long\nFincke_Pohst_ideal(");
  const last = pinnedSource.indexOf("\nstatic void\nsmall_norm(", first);
  assert(first >= 0 && last > first);
  let body = pinnedSource.slice(first, last);
  const replace = (before, after) => {
    assert.equal(body.split(before).length, 2, `expected one boundary: ${before}`);
    body = body.replace(before, after);
  };
  replace("Fincke_Pohst_ideal(", "prepared_collector(");
  replace("long *Nsmall, long *Nfact)",
    "long *Nsmall, long *Nfact, GEN prepared_ideal, GEN prepared_matrix, long *stats)");
  replace("  u = ZM_lll(ZM_mul(G0, I), 0.99, LLL_IM);\n  ideal = ZM_mul(I,u); /* approximate T2-LLL reduction */\n  r = gaussred_from_QR(RgM_mul(G, ideal), prec); /* Cholesky for T2 | ideal */",
    "  ideal = prepared_ideal;\n  r = gaussred_from_QR(prepared_matrix, prec);");
  // Count the same work as the port without enabling PARI's debug printing.
  replace("if (DEBUGLEVEL && Nsmall)", "if (Nsmall)");
  replace("if (DEBUGLEVEL && Nfact)", "if (Nfact)");
  // Publish counters outside the algorithmic decision logic at every exit.
  body = body.replace(/return ([01]);/g, (_, result) =>
    `do { stats[0]=try_elt; stats[1]=try_factor; stats[2]=relid; return ${result}; } while (0);`);
  return pinnedSource + "\n#include <time.h>\n" + body + `
static void emit_integer(GEN x) { char *s=GENtostr(x);printf("\\\"%s\\\"",s);pari_free(s); }
static double seconds(struct timespec a,struct timespec b) {
 return (b.tv_sec-a.tv_sec)+(b.tv_nsec-a.tv_nsec)*1e-9;
}
int main(int argc,char **argv) {
 long repetitions=argc>1?atol(argv[1]):1;
 if(repetitions<1 || repetitions>100000)return 2;
 pari_init(128000000,10000); DEBUGLEVEL=0;
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
 long quotas[]={0,1,8,8},targets[]={100,100,2,100};
 for(long f=0;f<4;f++) {
  pari_sp outer=avma;
  GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));
  long n=nf_get_degree(nf),total=0;
  GEN groups=cgetg(102,t_VEC),offsets=cgetg(102,t_VECSMALL),support=gen_1;
  for(long p=1;p<=101;p++) {
   gel(groups,p)=cgetg(1,t_VEC);offsets[p]=-1;
   if(uisprime(p)) {gel(groups,p)=idealprimedec(nf,stoi(p));offsets[p]=total;
    total+=lg(gel(groups,p))-1;support=mului(p,support);}
  }
  FB_t F={0};F.LV=groups;F.iLP=offsets;F.prodZ=support;F.KC=total;
  F.LP=cgetg(total+1,t_VEC);F.idealperm=cgetg(1,t_VEC);F.ballvol=500.;
  long next=1;
  for(long p=2;p<=101;p++)for(long j=1;j<lg(gel(groups,p));j++)gel(F.LP,next++)=gel(gel(groups,p),j);
  GEN I=idealhnf(nf,gel(gel(groups,2),1)),NI=idealnorm(nf,I);
  GEN u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),.99,LLL_IM),ideal=ZM_mul(I,u);
  GEN matrix=RgM_mul(nf_get_G(nf),ideal);
  for(long scenario=0;scenario<4;scenario++) {
   double elapsed=0;
   for(long rep=0;rep<repetitions;rep++) {
    pari_sp keep=avma;
    RELCACHE_t C={0};C.basis=zero_Flm_copy(total,total);C.missing=total;C.relsup=2;
    reallocate(&C,10*(total+2)+50);C.last=C.base;C.end=C.base+targets[scenario];
    double qq[11][11]={{0}},*qp[11],v[11]={0},y[11]={0},z[11]={0};
    for(long i=0;i<=n;i++)qp[i]=qq[i];
    FP_t fp={0};fp.x=const_vecsmall(n,0);fp.q=qp;fp.v=v;fp.y=y;fp.z=z;
    FACT fact[128];fact[0].pr=0;long ns=0,nfactors=0,stats[3]={0};
    struct timespec begin,end;
    clock_gettime(CLOCK_MONOTONIC,&begin);
    long status=prepared_collector(&C,&F,nf,I,NI,fact,quotas[scenario],&fp,NULL,
      offsets[2]+1,0,0,&ns,&nfactors,ideal,matrix,stats);
    clock_gettime(CLOCK_MONOTONIC,&end);elapsed+=seconds(begin,end);
    if(rep==repetitions-1) {
     long count=C.last-C.base;
     printf("{\\\"index\\\":%ld,\\\"repetitions\\\":%ld,\\\"seconds\\\":%.17g,\\\"status\\\":%ld,\\\"trials\\\":%ld,\\\"attempts\\\":%ld,\\\"relid\\\":%ld,\\\"nfact\\\":%ld,\\\"fact_count\\\":%ld,\\\"last\\\":%ld,\\\"missing\\\":%lu,\\\"sup\\\":%ld,\\\"basis\\\":[",
      4*f+scenario,repetitions,elapsed,status,stats[0],stats[1],stats[2],nfactors,fact[0].pr,count,C.missing,C.relsup);
     for(long j=1;j<=total;j++)for(long i=1;i<=total;i++)printf("%s%lu",j==1&&i==1?"":",",uel(gel(C.basis,j),i));
     printf("],\\\"hashes\\\":[");for(long j=1;j<=count;j++)printf("%s%ld",j==1?"":",",C.base[j].nz);
     printf("],\\\"records\\\":[");for(long j=1;j<=count;j++)for(long i=1;i<=total;i++)printf("%s%ld",j==1&&i==1?"":",",C.base[j].R[i]);
     printf("],\\\"generators\\\":[");for(long j=1;j<=count;j++)for(long i=1;i<=n;i++){if(j!=1||i!=1)printf(",");emit_integer(gel(C.base[j].m,i));}
     puts("]}");
    }
    delete_cache(&C);avma=keep;
   }
  }
  avma=outer;
 }
 pari_close();return 0;
}
`;
}
module.exports = { source, PIN };
