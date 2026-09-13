"""Untimed PARI/MPFR arithmetic control, not a replacement native algorithm."""

import pathlib
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
  char *s=mpz_get_str(NULL,10,z);GEN n=s[0]=='-'?negi(strtoi(s+1)):strtoi(s);free(s);mpz_clear(z);
  return gmul2n(itor(n,nbits2prec(mpfr_get_prec(x))),e);
}
static void compare(GEN x,GEN y,const char *label,long id) {
  long px=bit_prec(x),py=bit_prec(y),p=px<py?px:py;
  mpfr_t a,b,c;mpfr_init2(a,px);mpfr_init2(b,py);mpfr_init2(c,p);
  load(a,x);load(b,y);mpfr_mul(c,a,b,MPFR_RNDN);
  GEN expected=mulrr(x,y),actual=unload(c);long e1,e2;
  GEN q1=grndtoi(expected,&e1),q2=grndtoi(actual,&e2);
  mpfr_round_nearest_away(mpfr_mul,c,a,b);
  GEN away=unload(c);
  printf("%s %ld %ld %ld %ld %d %d %ld %ld %d\n",label,id,px,py,bit_prec(expected),
    gequal(expected,actual),gequal(q1,q2),e1,e2,gequal(expected,away));
  mpfr_clear(a);mpfr_clear(b);mpfr_clear(c);
}
int main(void) {
  pari_init(32000000,500000);
  const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018",
    "x^4-20018*x-20034","x^4-2000022*x-2000042"};
  for(long f=0;f<4;f++) {
    GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));long n=nf_get_degree(nf);
    for(long k=1;k<=8;k++) {
      pari_sp av=avma;GEN a=cgetg(n+1,t_COL);
      for(long j=1;j<=n;j++)gel(a,j)=stoi(j%2?k*j:-k-j);
      GEN v=RgM_RgC_mul(nf_get_M(nf),a);
      assert(typ(gel(v,1))==t_REAL && typ(gel(v,2))==t_REAL);
      compare(gel(v,1),gel(v,2),"prepared",8*f+k);avma=av;
    }
  }
  long precision;setrealprecision(19,&precision);
  GEN x=gadd(real_1(3),gmul2n(itor(stoi(3),3),-63));
  GEN y=gadd(real_1(3),gmul2n(real_1(3),-1));
  compare(x,y,"halfway",1);compare(gneg(x),y,"halfway",2);
  pari_close();return 0;
}
"""
with tempfile.TemporaryDirectory(prefix="sagejs-multiply-control-") as tmp:
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
    run = subprocess.run([str(exe)], capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stderr
    rows = [line.split() for line in run.stdout.splitlines()]
    assert len(rows) == 34, len(rows)
    for label in ("prepared", "halfway"):
        group = [r for r in rows if r[0] == label]
        print(
            label,
            "pairs",
            len(group),
            "exact_matches",
            sum(r[5] == "1" for r in group),
            "rounded_integer_matches",
            sum(r[6] == "1" for r in group),
            "error_exponent_matches",
            sum(r[7] == r[8] for r in group),
            "nearest_away_matches",
            sum(r[9] == "1" for r in group),
        )
    print(
        "precision patterns",
        sorted({(r[2], r[3], r[4]) for r in rows if r[0] == "prepared"}),
    )
    for r in rows:
        if r[5] != "1":
            print("difference", " ".join(r))
    assert all(r[9] == "1" for r in rows), "nearest-away control diverged"
