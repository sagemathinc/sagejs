"use strict";
// Untimed prepared-embedding comparison, not an independent class-group path.
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
(async () => {
  const pari = path.resolve(process.argv[2]);
  const compilerRoot = path.resolve(process.argv[3] || path.join(__dirname,"../.."));
  const { compileKernel } = require(path.join(compilerRoot,"tools/native-kernel/compiler.cjs"));
  const built = await compileKernel({sourcePath:path.join(__dirname,"embedding_norm.py")});
  const prefix = process.env.SAGEJS_FLINT_PREFIX;
  assert.ok(prefix,"set SAGEJS_FLINT_PREFIX");
  const tmp = mkdtempSync(path.join(tmpdir(),"sagejs-embedding-norm-"));
  const control = path.join(tmp,"control.c");
  writeFileSync(control, `#include <pari.h>
#include <assert.h>
#include "kernel_core.h"
static void load(mpfr_t out, GEN x) {
  long e=0;
  if(typ(x)==t_REAL && bit_prec(x)!=mpfr_get_prec(out)){fprintf(stderr,"nonuniform prepared precision: input=%ld target=%ld\\n",bit_prec(x),mpfr_get_prec(out));exit(3);}
  GEN m=typ(x)==t_INT ? x : mantissa_real(x,&e);
  char *s=GENtostr(m); mpz_t z; mpz_init(z); mpz_set_str(z,s,10); pari_free(s);
  if(mpfr_set_z(out,z,MPFR_RNDN)!=0){fprintf(stderr,"ingress mismatch: input bits=%ld target=%ld\\n",bit_prec(x),mpfr_get_prec(out));exit(3);}
  assert(mpfr_mul_2si(out,out,-e,MPFR_RNDN)==0); mpz_clear(z);
}
static GEN unload(mpfr_t x,long prec) {
  mpz_t z;mpz_init(z);long e=mpfr_get_z_2exp(z,x);
  char *s=mpz_get_str(NULL,10,z);GEN n=strtoi(s);free(s);mpz_clear(z);
  return gmul2n(itor(n,prec),e);
}
int main(void) {
  const char *fields[]={"x^3-20018*x+20034", "x^3-20010*x+20018",
    "x^4-20018*x-20034", "x^4-2000022*x-2000042"};
  pari_init(32000000,500000);long prec=nbits2prec(192), comparisons=0, differences=0;
  for (unsigned f=0;f<4;f++) {
    GEN nf=nfinit(gp_read_str(fields[f]),prec);long n=nf_get_degree(nf), r1=nf_get_r1(nf), r2=(n-r1)/2;
    mpfr_t re[4],cr[4],ci[4],out; mpfr_srcptr rp[4],cp[4],ip[4];
    mpfr_init2(out,192);
    for(long i=0;i<4;i++){mpfr_init2(re[i],192);mpfr_init2(cr[i],192);mpfr_init2(ci[i],192);rp[i]=re[i];cp[i]=cr[i];ip[i]=ci[i];}
    for(long k=1;k<=8;k++) {
      pari_sp av=avma;GEN a=cgetg(n+1,t_COL);
      for(long j=1;j<=n;j++)gel(a,j)=stoi(j%2 ? k*j : -k-j);
      GEN v=RgM_RgC_mul(nf_get_M(nf),a), expected=embed_norm(v,r1);
      assert(typ(gel(v,1))==t_REAL);long bits=bit_prec(gel(v,1));
      fprintf(stderr,"field=%u candidate=%ld first_bits=%ld\\n",f,k,bits);
      mpfr_set_prec(out,bits);
      for(long i=0;i<4;i++){mpfr_set_prec(re[i],bits);mpfr_set_prec(cr[i],bits);mpfr_set_prec(ci[i],bits);}
      for(long i=0;i<r1;i++)load(re[i],gel(v,i+1));
      for(long i=0;i<r2;i++){GEN x=gel(v,r1+i+1);assert(typ(x)==t_COMPLEX);load(cr[i],gel(x,1));load(ci[i],gel(x,2));}
      sagejs_native_status status;
      int ok=r2 ? sagejs_kernel_pari_mixed_embedding_norm(&status,out,bits,rp,r1,cp,r2,ip,r2,r1-1,r2-1)
        : sagejs_kernel_pari_real_embedding_norm(&status,out,bits,rp,r1,r1-1);
      assert(ok); GEN actual=unload(out,nbits2prec(bits));comparisons++;
      if(!gequal(actual,expected)){differences++;pari_printf("difference field=%s candidate=%ld bits=%ld\\n",fields[f],k,gexpo(gsub(actual,expected)));}
      avma=av;
    }
    for(long i=0;i<4;i++){mpfr_clear(re[i]);mpfr_clear(cr[i]);mpfr_clear(ci[i]);}mpfr_clear(out);
  }
  printf("comparisons=%ld differences=%ld\\n",comparisons,differences);pari_close();return differences ? 2 : 0;
}
`);
  const lib = path.join(pari,"Olinux-x86_64");
  const exe = path.join(tmp,"control");
  const cc = spawnSync("cc",["-O2","-I"+built.outputPath,"-I"+path.join(prefix,"include"),
    "-I"+path.join(pari,"src/headers"),"-I"+lib,control,built.coreSourcePath,
    "-L"+lib,"-Wl,-rpath,"+lib,"-lpari",path.join(prefix,"lib/libmpfr.a"),
    path.join(prefix,"lib/libgmp.a"),"-lm","-o",exe],{encoding:"utf8",timeout:30000});
  assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
  process.stdout.write(run.stdout);assert.equal(run.status,0,run.stderr||run.stdout);
})().catch(e=>{console.error(e);process.exitCode=1;});
