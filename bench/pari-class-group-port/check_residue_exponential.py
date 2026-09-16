"""Diagnostic: is MPFR exp interchangeable with PARI's residue exponential?

This is not a port or performance benchmark. Differences are reported, not
silently accepted as evidence of equivalent arithmetic.
"""

import json
import pathlib
import subprocess
import sys
import tempfile

import gmpy2

pari = pathlib.Path(sys.argv[1]).resolve()
build = pari / "Olinux-x86_64"
driver = r"""
#include "pari.h"
static double input;
static GEN capture_exp(GEN x) { input=rtodbl(x); return mpexp(x); }
#define mpexp capture_exp
#include "BUCH_SOURCE"
#undef mpexp
static void dump(long field,long tag,double x,GEN value) {
  long e;GEN m=mantissa_real(value,&e);char *s=GENtostr(m);
  printf("%ld %ld %a %ld %ld %s\n",field,tag,x,bit_prec(value),expo(value),s);
  pari_free(s);
}
int main(void) {
  pari_init(64000000,10000);
  const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018",
    "x^4-20018*x-20034","x^4-2000022*x-2000042"};
  long bounds[]={2,3,4,5,8,16,31,32,64,101,300,1000,10000};
  for(long field=0;field<4;field++) {
    GEN nf=nfinit(gp_read_str(polys[field]),nbits2prec(192));GRHcheck_t S;
    init_GRHcheck(&S,nf_get_degree(nf),nf_get_r1(nf),dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);
    cache_prime_dec(&S,10001,nf);
    for(long i=0;i<13;i++){GEN value=compute_invres(&S,bounds[i]);dump(field,bounds[i],input,value);}
    free_GRHcheck(&S);
  }
  for(long k=-160;k<=160;k++) {double x=k/16.0;dump(-1,k,x,mpexp(dbltor(x)));}
  for(long k=-1000;k<=0;k+=10)for(long sign=-1;sign<=1;sign+=2) {
    double x=sign*ldexp(1.0,k);dump(-2,k,x,mpexp(dbltor(x)));
  }
  pari_close();return 0;
}
""".replace("BUCH_SOURCE", str(pari / "src/basemath/buch2.c"))

with tempfile.TemporaryDirectory(prefix="sagejs-residue-exp-") as directory:
    directory = pathlib.Path(directory)
    source = directory / "oracle.c"
    source.write_text(driver)
    exe = directory / "oracle"
    subprocess.run(
        [
            "cc",
            "-O2",
            "-I" + str(pari / "src/headers"),
            "-I" + str(build),
            str(source),
            "-L" + str(build),
            "-Wl,-rpath," + str(build),
            "-lpari",
            "-lm",
            "-o",
            str(exe),
        ],
        check=True,
        timeout=30,
    )
    result = subprocess.run(
        [str(exe)], capture_output=True, text=True, check=True, timeout=30
    )

differences = []
counts = {"residue": 0, "synthetic": 0}
precision_counts = {}
rounded64_differences = 0
residue_rounded64_differences = 0
for line in result.stdout.splitlines():
    field, tag, input_hex, precision, exponent, mantissa = line.split()
    field, tag, precision, exponent, mantissa = map(
        int, (field, tag, precision, exponent, mantissa)
    )
    counts["residue" if field >= 0 else "synthetic"] += 1
    precision_counts[precision] = precision_counts.get(precision, 0) + 1
    scale = exponent + 1 - precision
    unit = gmpy2.mpq(2) ** scale
    expected = mantissa * unit
    with gmpy2.context(precision=precision, round=gmpy2.RoundToNearest):
        actual = gmpy2.exp(gmpy2.mpfr(float.fromhex(input_hex)))
    error = (gmpy2.mpq(actual) - expected) / unit
    with gmpy2.context(precision=64, round=gmpy2.RoundToNearest):
        if gmpy2.mpfr(expected) != gmpy2.exp(gmpy2.mpfr(float.fromhex(input_hex))):
            rounded64_differences += 1
            if field >= 0:
                residue_rounded64_differences += 1
    if error:
        differences.append(
            {
                "field": field,
                "tag": tag,
                "input": input_hex,
                "precision": precision,
                "ulp_difference": str(error),
                "relative_difference": float(error * unit / expected),
            }
        )

assert counts == {"residue": 52, "synthetic": 523}, counts
print(
    json.dumps(
        {
            "counts": counts,
            "output_precisions": precision_counts,
            "different_results": len(differences),
            "residue_differences": sum(row["field"] >= 0 for row in differences),
            "differences_after_rounding_to_64_bits": rounded64_differences,
            "residue_differences_after_rounding_to_64_bits": residue_rounded64_differences,
            "first_differences": differences[:12],
            "gmpy2": gmpy2.version(),
            "mpfr": gmpy2.mpfr_version(),
        },
        indent=2,
    )
)
