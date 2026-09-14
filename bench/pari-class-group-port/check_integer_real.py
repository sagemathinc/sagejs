"""PARI generic integer/real arithmetic records, including unsigned-word edges."""

import json
import pathlib
import subprocess
import sys
import tempfile

pari = pathlib.Path(sys.argv[1]).resolve()
driver = r"""
#include <pari.h>
#include <assert.h>
static void scalar(GEN x) {
  long p=-1,e=0,de;GEN m=x;
  if (typ(x)==t_REAL) {p=bit_prec(x);e=expo(x);m=mantissa_real(x,&de);}
  else assert(typ(x)==t_INT);
  char *s=GENtostr(m);printf(" %s %ld %ld",s,p,e);pari_free(s);
}
int main(void) {
  pari_init(32000000,500000);
  const char *integers[]={"0","1","-1","2","-3","9223372036854775808",
    "-9223372036854775808","18446744073709551615","-18446744073709551615"};
  const long ps[]={64,128,256},es[]={-100,-1,0,70};
  for(long i=0;i<9;i++)for(long j=0;j<3;j++)for(long k=0;k<4;k++)
    for(long variant=0;variant<3;variant++) {
      pari_sp av=avma;GEN integer=gp_read_str(integers[i]),x;
      if (!variant) x=real_0_bit(es[k]);
      else {
        GEN m=addiu(int2n(ps[j]-1),3);
        x=gmul2n(itor(m,nbits2prec(ps[j])),es[k]+1-ps[j]);
        if (variant==2) x=gneg(x);
      }
      printf("%s",integers[i]);scalar(x);scalar(gmul(integer,x));scalar(gadd(integer,x));
      if (signe(integer)) scalar(divri(x,integer));
      printf("\n");
      avma=av;
    }
  ulong state=1234567;
  for(long p=64;p<=512;p*=2)for(long k=0;k<128;k++) {
    pari_sp av=avma;
    state=state*6364136223846793005UL+1442695040888963407UL;
    GEN integer=utoi((state >> 1) | 1UL);
    GEN m=gen_0;
    for(long word=0;word<p/64;word++) {
      state=state*6364136223846793005UL+1442695040888963407UL;
      ulong limb=state;
      if (!word) limb |= (1UL<<63);
      m=addiu(shifti(m,64),limb);
    }
    GEN x=gmul2n(itor(m,nbits2prec(p)),(k%71)-35+1-p);
    if(k%2) x=gneg(x);
    if(k%3==0) integer=negi(integer);
    char *s=GENtostr(integer);printf("%s",s);pari_free(s);
    scalar(x);scalar(gmul(integer,x));scalar(gadd(integer,x));scalar(divri(x,integer));printf("\n");
    avma=av;
  }
  for(long p=64;p<=512;p*=2)for(long k=0;k<256;k++) {
    pari_sp av=avma;
    GEN integer=gen_0,m=gen_0;
    for(long word=0;word<=k%17;word++) {
      state=state*6364136223846793005UL+1442695040888963407UL;
      integer=addiu(shifti(integer,64),state | 1UL);
    }
    for(long word=0;word<p/64;word++) {
      state=state*6364136223846793005UL+1442695040888963407UL;
      ulong limb=state;
      if (!word) limb |= (1UL<<63);
      m=addiu(shifti(m,64),limb);
    }
    GEN x=gmul2n(itor(m,nbits2prec(p)),(k%71)-35+1-p);
    if(k%2) x=gneg(x);
    if(k%3==0) integer=negi(integer);
    char *s=GENtostr(integer);printf("%s",s);pari_free(s);
    scalar(x);scalar(divri(x,integer));printf("\n");
    avma=av;
  }
  pari_close();return 0;
}
"""
with tempfile.TemporaryDirectory(prefix="sagejs-integer-real-") as tmp:
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
    run = subprocess.run([str(exe)], capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stderr
    rows = [line.split() for line in run.stdout.splitlines()]
    assert len(rows) == 1860, len(rows)
    print(json.dumps(rows))
