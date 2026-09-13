"""Untimed direct-PARI differential for the prepared real rounding contract."""

import importlib.util
import pathlib
import subprocess
import sys
import tempfile

source = pathlib.Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location(
    "pari_rounding", pathlib.Path(__file__).with_name("rounding.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

# The C here is an oracle driver, not a production implementation. It invokes
# upstream grndtoi and exports the actual representation via mantissa_real.
driver = r"""
#include <pari.h>
int main(void) {
  const char *values[] = {"0.", "0.5", "-0.5", "1.5", "-1.5",
    "2.5", "-2.5", "1.", "-1.", "2.^200", "-2.^200",
    "2.^(-100)", "-2.^(-100)", "1.+2.^(-31)", "1.-2.^(-31)",
    "1.+2.^(-32)", "1.-2.^(-32)", "1.+2.^(-33)", "1.-2.^(-33)",
    "-1.+2.^(-32)", "-1.-2.^(-32)", "0.5+2.^(-40)",
    "0.5-2.^(-40)", "-0.5+2.^(-40)", "-0.5-2.^(-40)"};
  pari_init(8000000, 500000);
  for (long digits=19; digits<=77; digits+=29) {
    long precision;
    setrealprecision(digits, &precision);
    for (unsigned i=0; i<sizeof(values)/sizeof(values[0]); i++) {
      pari_sp av=avma;
      GEN x=gp_read_str(values[i]); long e, error;
      GEN m=mantissa_real(x,&e), q=grndtoi(x,&error);
      pari_printf("%Ps %ld %ld %Ps %ld\n",m,e,expo(x),q,error);
      avma=av;
    }
  }
  pari_close();
  return 0;
}
"""
with tempfile.TemporaryDirectory(prefix="sagejs-rounding-oracle-") as tmp:
    tmp = pathlib.Path(tmp)
    c = tmp / "oracle.c"
    c.write_text(driver)
    exe = tmp / "oracle"
    build = source / "Olinux-x86_64"
    subprocess.run(
        [
            "cc",
            "-O2",
            "-I" + str(source / "src/headers"),
            "-I" + str(build),
            str(c),
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
    result = subprocess.run([str(exe)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    count = 0
    for line in result.stdout.splitlines():
        m, e, exponent, q, error = map(int, line.split())
        actual = module.pari_round_real(m, e, exponent)
        assert actual == (q, error), (m, e, exponent, actual, q, error)
        count += 1
    assert count == 75, count
    print(f"PARI prepared rounding: {count} integer/error-exponent pairs agree")
