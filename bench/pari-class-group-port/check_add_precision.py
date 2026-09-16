"""Untimed PARI/MPFR addition control for nonnegative squared embeddings.

PARI supplies the output precision in this diagnostic, not in a translated
path. Agreement here alone does not implement that precision decision.
"""

import pathlib
import json
import os
import subprocess
import sys
import tempfile

pari = pathlib.Path(sys.argv[1]).resolve()
prefix = pathlib.Path(sys.argv[2]).resolve()
driver = r"""
#include <pari.h>
#include <mpfr.h>
#include <assert.h>
static void load(mpfr_t out, GEN x) {
  long e;GEN m=mantissa_real(x,&e);char *s=GENtostr(m);
  mpz_t z;mpz_init(z);assert(mpz_set_str(z,s,10)==0);pari_free(s);
  assert(mpfr_set_z(out,z,MPFR_RNDN)==0);
  assert(mpfr_mul_2si(out,out,-e,MPFR_RNDN)==0);mpz_clear(z);
}
static GEN unload(mpfr_t x) {
  mpz_t z;mpz_init(z);long e=mpfr_get_z_2exp(z,x);
  char *s=mpz_get_str(NULL,10,z);GEN n=s[0]=='-'?negi(strtoi(s+1)):strtoi(s);
  free(s);mpz_clear(z);
  return gmul2n(itor(n,nbits2prec(mpfr_get_prec(x))),e);
}
static void record(GEN x,GEN y,GEN z) {
  long de;char *sx=GENtostr(mantissa_real(x,&de));
  char *sy=GENtostr(mantissa_real(y,&de));
  char *sz=GENtostr(mantissa_real(z,&de));
  printf("record %s %ld %ld %s %ld %ld %s %ld %ld\n",
    sx,bit_prec(x),expo(x),sy,bit_prec(y),expo(y),sz,bit_prec(z),expo(z));
  pari_free(sx);pari_free(sy);pari_free(sz);
}
static void compare(GEN x,GEN y,const char *label,long id) {
  assert(signe(x)>0 && signe(y)>0);
  GEN expected=addrr(x,y);
  long px=bit_prec(x),py=bit_prec(y),p=bit_prec(expected);
  mpfr_t a,b,c;mpfr_init2(a,px);mpfr_init2(b,py);mpfr_init2(c,p);
  load(a,x);load(b,y);
  mpfr_add(c,a,b,MPFR_RNDN);int nearest=gequal(expected,unload(c));
  mpfr_add(c,a,b,MPFR_RNDZ);int zero=gequal(expected,unload(c));
  mpfr_round_nearest_away(mpfr_add,c,a,b);int away=gequal(expected,unload(c));
  printf("%s %ld %ld %ld %ld %ld %ld %ld %d %d %d\n",label,id,
    px,py,expo(x),expo(y),p,expo(expected),nearest,zero,away);
  if (getenv("SAGEJS_ADD_RECORDS")) {
    record(x,y,expected);
  }
  mpfr_clear(a);mpfr_clear(b);mpfr_clear(c);
}
int main(void) {
  pari_init(32000000,500000);
  const char *polys[]={"x^4-20018*x-20034","x^4-2000022*x-2000042"};
  for(long f=0;f<2;f++) {
    GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));long n=nf_get_degree(nf);
    for(long k=1;k<=8;k++) {
      pari_sp av=avma;GEN a=cgetg(n+1,t_COL);
      for(long j=1;j<=n;j++)gel(a,j)=stoi(j%2?k*j:-k-j);
      GEN v=RgM_RgC_mul(nf_get_M(nf),a),z=gel(v,nf_get_r1(nf)+1);
      assert(typ(z)==t_COMPLEX);
      compare(sqrr(gel(z,1)),sqrr(gel(z,2)),"prepared",8*f+k);avma=av;
    }
  }
  long id=0;
  for(long px=64;px<=192;px+=64)for(long py=64;py<=192;py+=64)
    for(long shift=0;shift<=132;shift++) {
      pari_sp av=avma;
      GEN x=gmul2n(itor(addiu(int2n(px-1),3),nbits2prec(px)),-px+1);
      GEN y=gmul2n(itor(subiu(int2n(py),1),nbits2prec(py)),-py+1-shift);
      compare(x,y,"boundary",++id);avma=av;
    }
  if (getenv("SAGEJS_ADD_RECORDS")) {
    const long exponents[]={-129,-128,-65,-64,-1,0,1};
    GEN one=real_1(nbits2prec(128));
    for(long i=0;i<7;i++) {
      GEN z=real_0_bit(exponents[i]);
      record(z,one,addrr(z,one));record(one,z,addrr(one,z));
    }
    GEN a=real_0_bit(-64),b=real_0_bit(-128);
    record(a,b,addrr(a,b));record(b,a,addrr(b,a));
  }
  pari_close();return 0;
}
"""
with tempfile.TemporaryDirectory(prefix="sagejs-add-control-") as tmp:
    tmp = pathlib.Path(tmp)
    c = tmp / "control.c"
    c.write_text(driver)
    exe = tmp / "control"
    lib = pari / "Olinux-x86_64"
    subprocess.run(
        [
            "cc",
            "-O2",
            "-I" + str(pari / "src/headers"),
            "-I" + str(lib),
            "-I" + str(prefix / "include"),
            str(c),
            "-L" + str(lib),
            "-Wl,-rpath," + str(lib),
            "-lpari",
            str(prefix / "lib/libmpfr.a"),
            str(prefix / "lib/libgmp.a"),
            "-lm",
            "-o",
            str(exe),
        ],
        check=True,
        timeout=30,
    )
    env = dict(os.environ)
    json_mode = "--json" in sys.argv[3:]
    if json_mode:
        env["SAGEJS_ADD_RECORDS"] = "1"
    else:
        env.pop("SAGEJS_ADD_RECORDS", None)
    run = subprocess.run(
        [str(exe)], capture_output=True, text=True, timeout=30, env=env
    )
    assert run.returncode == 0, run.stderr
    rows = [line.split() for line in run.stdout.splitlines()]
    if json_mode:
        records = [r[1:] for r in rows if r[0] == "record"]
        assert len(records) == 1229
        print(json.dumps(records))
        sys.exit(0)
    assert len(rows) == 1213, len(rows)
    for label in ("prepared", "boundary"):
        group = [r for r in rows if r[0] == label]
        print(
            label,
            "pairs",
            len(group),
            "matches (nearest, zero, away)",
            [sum(r[i] == "1" for r in group) for i in (8, 9, 10)],
        )
    differences = [r for r in rows if r[9] != "1"]
    print("first truncation differences", differences[:8])
    print(
        "prepared precision patterns",
        sorted({(r[2], r[3], r[6]) for r in rows if r[0] == "prepared"}),
    )
