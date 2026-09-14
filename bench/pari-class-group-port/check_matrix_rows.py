"""PARI prepared embedding matrix/coordinate/output records; no timing."""

import json
import os
import pathlib
import subprocess
import sys
import tempfile

pari = pathlib.Path(sys.argv[1]).resolve()
driver = r"""
#include <pari.h>
#include <assert.h>
static GEN component(GEN column,long row,long r1) {
  if (row<r1) return gel(column,row+1);
  GEN value=gel(column,r1+1+(row-r1)/2);
  if (typ(value)==t_COMPLEX) return gel(value,1+(row-r1)%2);
  return (row-r1)%2?gen_0:value;
}
static void scalar(GEN value) {
  long precision=-1,exponent=0,de;GEN mantissa=value;
  if (typ(value)==t_REAL) {
    precision=bit_prec(value);exponent=expo(value);mantissa=mantissa_real(value,&de);
  } else assert(typ(value)==t_INT);
  char *s=GENtostr(mantissa);printf(" %s %ld %ld",s,precision,exponent);pari_free(s);
}
int main(void) {
  pari_init(32000000,500000);
  const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018",
    "x^4-20018*x-20034","x^4-2000022*x-2000042"};
  for(long f=0;f<4;f++) {
    GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));
    GEN M=nf_get_M(nf);long n=nf_get_degree(nf),r1=nf_get_r1(nf);
    for(long k=1;k<=8+n;k++) {
      pari_sp av=avma;GEN a=cgetg(n+1,t_COL);
      for(long j=1;j<=n;j++)gel(a,j)=stoi(k<=8?(j%2?k*j:-k-j):(j==k-8));
      GEN v=RgM_RgC_mul(M,a);
      if (getenv("SAGEJS_MATRIX_RECORDS")) {
        if (k<=8) {
          printf("%ld %ld",n,r1);
          for(long row=0;row<n;row++)for(long j=1;j<=n;j++)scalar(component(gel(M,j),row,r1));
          for(long j=1;j<=n;j++)printf(" %ld",itos(gel(a,j)));
          for(long row=0;row<n;row++)scalar(component(v,row,r1));
          scalar(embed_norm(v,r1));printf("\n");
        }
        avma=av;continue;
      }
      for(long row=0;row<n;row++) {
        printf("%ld",n);
        for(long j=1;j<=n;j++)scalar(component(gel(M,j),row,r1));
        for(long j=1;j<=n;j++)printf(" %ld",itos(gel(a,j)));
        scalar(component(v,row,r1));printf("\n");
      }
      avma=av;
    }
  }
  pari_close();return 0;
}
"""
with tempfile.TemporaryDirectory(prefix="sagejs-matrix-rows-") as tmp:
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
            str(c),
            "-L" + str(lib),
            "-Wl,-rpath," + str(lib),
            "-lpari",
            "-o",
            str(exe),
        ],
        check=True,
        timeout=30,
    )
    env = dict(os.environ)
    matrix = "--matrix-json" in sys.argv[2:]
    if matrix:
        env["SAGEJS_MATRIX_RECORDS"] = "1"
    else:
        env.pop("SAGEJS_MATRIX_RECORDS", None)
    run = subprocess.run(
        [str(exe)], capture_output=True, text=True, timeout=30, env=env
    )
    assert run.returncode == 0, run.stderr
    rows = [line.split() for line in run.stdout.splitlines()]
    assert len(rows) == (32 if matrix else 162), len(rows)
    print(json.dumps(rows))
