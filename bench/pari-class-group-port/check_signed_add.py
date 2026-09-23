"""Bounded, untimed PARI signed-addition records for the language experiment."""

import json
import pathlib
import subprocess
import sys
import tempfile

pari = pathlib.Path(sys.argv[1]).resolve()
driver = r"""
#include <pari.h>
static void record(GEN x,GEN y) {
  GEN z=addrr(x,y);long de;
  char *a=GENtostr(mantissa_real(x,&de));
  char *b=GENtostr(mantissa_real(y,&de));
  char *c=GENtostr(mantissa_real(z,&de));
  printf("%s %ld %ld %s %ld %ld %s %ld %ld\n",
    a,bit_prec(x),expo(x),b,bit_prec(y),expo(y),c,bit_prec(z),expo(z));
  pari_free(a);pari_free(b);pari_free(c);
}
int main(void) {
  pari_init(32000000,500000);setrand(stoi(31));
  const long ps[]={64,128,256,512,2176,2240,2304,2368,2432,2496};
  const long gaps[]={0,1,2,3,4,5,31,63,64,65,66,127,128,129};
  for(long i=0;i<8;i++)for(long j=0;j<8;j++)
    for(long k=0;k<14;k++)for(long variant=0;variant<3;variant++) {
      pari_sp av=avma;long px=ps[i],py=ps[j];
      GEN hx=int2n(px-1),hy=int2n(py-1),mx,my;
      if (variant==0) {mx=hx;my=hy;}
      else if (variant==1) {mx=subiu(int2n(px),1);my=subiu(int2n(py),1);}
      else {mx=addii(hx,randomi(hx));my=addii(hy,randomi(hy));}
      GEN x=gmul2n(itor(mx,nbits2prec(px)),1-px);
      GEN y=gmul2n(itor(my,nbits2prec(py)),1-py-gaps[k]);
      record(x,gneg(y));record(gneg(x),y);avma=av;
    }
  /* Preserve the established randomized corpus, then force every ordered
     p2432 pairing with deterministic leading/all-one mantissas. */
  for(long i=0;i<10;i++)for(long j=0;j<10;j++)if(i>=8 || j>=8)
    for(long k=0;k<14;k++)for(long variant=0;variant<2;variant++) {
      pari_sp av=avma;long px=ps[i],py=ps[j];
      GEN mx=variant?subiu(int2n(px),1):int2n(px-1);
      GEN my=variant?subiu(int2n(py),1):int2n(py-1);
      GEN x=gmul2n(itor(mx,nbits2prec(px)),1-px);
      GEN y=gmul2n(itor(my,nbits2prec(py)),1-py-gaps[k]);
      record(x,gneg(y));record(gneg(x),y);avma=av;
    }
  pari_close();return 0;
}
"""
with tempfile.TemporaryDirectory(prefix="sagejs-signed-add-") as tmp:
    tmp = pathlib.Path(tmp)
    c = tmp / "control.c"
    c.write_text(driver)
    lib = pari / "Olinux-x86_64"
    exe = tmp / "control"
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
    assert len(rows) == 7392
    print(json.dumps(rows))
