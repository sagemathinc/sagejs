"use strict";

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const result = spawnSync(join(root, "bin", "sagejs"), ["--python"], {
  cwd: root,
  encoding: "utf8",
  input: String.raw`
import time

field = GF(65521)
ring = PolynomialRing(field, "x")
for divisor_length, quotient_length in [(301, 1501), (1001, 4001)]:
    divisor = ring([(7 * index + 3) % 65521 for index in range(divisor_length)])
    quotient = ring([(13 * index + 9) % 65521 for index in range(quotient_length)])
    remainder = ring([(19 * index + 1) % 65521 for index in range(101)])
    dividend = divisor * quotient + remainder
    samples = []
    for _repeat in range(11):
        started = time.perf_counter()
        dividend.quo_rem(divisor)
        samples.append(1000 * (time.perf_counter() - started))
    samples.sort()
    print(
        "degree " + str(dividend.degree()) + "/" + str(divisor.degree())
        + ": " + str(round(samples[len(samples) // 2], 3)) + " ms"
    )
`,
  timeout: 60_000,
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
process.stdout.write(result.stdout);
