"""Untimed PARI/MPFR arithmetic control, not a replacement native algorithm."""

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
  if (getenv("SAGEJS_MULTIPLY_RECORDS")) {
    long de;char *sx=GENtostr(mantissa_real(x,&de));
    char *sy=GENtostr(mantissa_real(y,&de));
    char *sz=GENtostr(mantissa_real(expected,&de));
    printf("record %s %ld %ld %s %ld %ld %s %ld %ld\n",
      sx,px,expo(x),sy,py,expo(y),sz,bit_prec(expected),expo(expected));
    pari_free(sx);pari_free(sy);pari_free(sz);
  }
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
      compare(gel(v,1),gel(v,2),"prepared",8*f+k);
      if (f<2 && getenv("SAGEJS_NORM_RECORDS")) {
        printf("normrecord %ld",n);
        for(long j=1;j<=n;j++) {
          GEN z=gel(v,j);long de;char *s=GENtostr(mantissa_real(z,&de));
          printf(" %s %ld %ld",s,bit_prec(z),expo(z));pari_free(s);
        }
        GEN z=embed_norm(v,n);long de;char *s=GENtostr(mantissa_real(z,&de));
        printf(" %s %ld %ld\n",s,bit_prec(z),expo(z));pari_free(s);
      }
      if (f>=2 && getenv("SAGEJS_NORM_RECORDS")) {
        long r1=nf_get_r1(nf),r2=(n-r1)/2;
        printf("mixedrecord %ld %ld",r1,r2);
        for(long j=1;j<lg(v);j++) {
          GEN z=gel(v,j);
          for(long part=1;part<=(j<=r1?1:2);part++) {
            GEN t=j<=r1?z:gel(z,part);long de;
            char *s=GENtostr(mantissa_real(t,&de));
            printf(" %s %ld %ld",s,bit_prec(t),expo(t));pari_free(s);
          }
        }
        GEN z=embed_norm(v,r1);long de;char *s=GENtostr(mantissa_real(z,&de));
        printf(" %s %ld %ld\n",s,bit_prec(z),expo(z));pari_free(s);
      }
      avma=av;
    }
  }
  long precision;setrealprecision(19,&precision);
  GEN x=gadd(real_1(3),gmul2n(itor(stoi(3),3),-63));
  GEN y=gadd(real_1(3),gmul2n(real_1(3),-1));
  compare(x,y,"halfway",1);compare(gneg(x),y,"halfway",2);
  /* Place the exact product just above a 64-bit rounding midpoint. The
   * 192-bit operand's low word matters, unlike a random test with probability
   * about 2^-64 of approaching this boundary. */
  GEN mx=addiu(int2n(63),3),k=addiu(int2n(63),4294967295UL);
  GEN numerator=shifti(addiu(shifti(k,1),1),190);
  GEN my=addiu(divii(subiu(numerator,1),mx),1);
  GEN ax=gmul2n(itor(mx,nbits2prec(64)),-63);
  GEN ay=gmul2n(itor(my,nbits2prec(192)),-191);
  compare(ax,ay,"near-halfway",1);compare(gneg(ax),ay,"near-halfway",2);
  const long precisions[]={64,128,192,256,320,512,1024,2048};
  long id=0;setrand(stoi(17));
  for(long i=0;i<8;i++)for(long j=0;j<8;j++)for(long variant=0;variant<3;variant++) {
    pari_sp av=avma;long px=precisions[i],py=precisions[j];
    GEN bx=int2n(px-1),by=int2n(py-1),u,v;
    if (variant==0) {u=subiu(int2n(px),1);v=subiu(int2n(py),1);}
    else if (variant==1) {u=addii(bx,randomi(bx));v=addii(by,randomi(by));}
    else {u=addiu(bx,3);v=addiu(by,5);}
    GEN rx=gmul2n(itor(u,nbits2prec(px)),-px+1);
    GEN ry=gmul2n(itor(v,nbits2prec(py)),-py+1);
    if (variant==1) rx=gneg(rx);
    compare(rx,ry,"short-grid",++id);avma=av;
  }
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
    json_mode = "--json" in sys.argv[3:]
    norm_mode = "--norm-json" in sys.argv[3:]
    mixed_mode = "--mixed-json" in sys.argv[3:]
    env = dict(os.environ)
    if json_mode:
        env["SAGEJS_MULTIPLY_RECORDS"] = "1"
    else:
        env.pop("SAGEJS_MULTIPLY_RECORDS", None)
    if norm_mode or mixed_mode:
        env["SAGEJS_NORM_RECORDS"] = "1"
    else:
        env.pop("SAGEJS_NORM_RECORDS", None)
    run = subprocess.run(
        [str(exe)], capture_output=True, text=True, timeout=30, env=env
    )
    assert run.returncode == 0, run.stderr
    rows = [line.split() for line in run.stdout.splitlines()]
    if norm_mode or mixed_mode:
        records = [
            r[1:]
            for r in rows
            if r[0] == ("mixedrecord" if mixed_mode else "normrecord")
        ]
        assert len(records) == 16, len(records)
        print(json.dumps(records))
        sys.exit(0)
    if json_mode:
        records = [r[1:] for r in rows if r[0] == "record"]
        assert len(records) == 228, len(records)
        print(json.dumps(records))
        sys.exit(0)
    assert len(rows) == 228, len(rows)
    for label in ("prepared", "halfway", "near-halfway", "short-grid"):
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
    assert all(r[9] == "1" for r in rows if r[0] in ("prepared", "halfway")), (
        "nearest-away control diverged"
    )
