#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");
const { compile } = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "number_fields",
  "round4_state_kernel.py",
);
const sagejs = join(root, "bin", "sagejs");

async function main() {
  const compiled = await compile({
    sourcePath,
    cacheRoot: join(dirname(sourcePath), ".sagejs-native-kernels"),
  });
  const program = String.raw`
import time
from sagejs.native import is_compiled
from sagejs.number_fields.round4 import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.round4_state_kernel import packed_round4_exact_characteristic

defining = [87782430961,0,73445288000,0,1769278869776,0,2940754348320,0,3788371498452,0,3275906117440,0,1764753386480,0,613283590880,0,143402547926,0,23223642560,0,2645190320,0,212540000,0,11928052,0,455360,0,11216,0,160,0,1]
element = [4096,-1921167192014974631699,23311077024722075280332,72979478997529796730157,-34658213573031162851615,57796697381498454556261,37476275780919218544234,-74752371447830479155954,67247584065081978290845,-1253424846351917248449,-62480424453365492468748,72002143441676135040555,62436778254632705463411,-13629844741848554887801,-5166348272990322863938,-1992251438047013516850,-7730640446327687246529,-38308508203332025015337,-3574998774953472019644,-60624286770897190058033,68332303106228657974947,-23222117488793191769793,-38023491182303020748482,-10272845292075491321262,-66668303197036574539449,-22001171014693020533883,-34909127836307276045028,-5430096565031968270255,-44773352021897791522287,-18537074588670589717219,-10609318725528131460374,27295268574728619925010,39991162386792915112613]
degree = 32
control = kernel_integer_buffer(packed_round4_exact_characteristic, [0, 0, 0, 49])
output = kernel_integer_zeros(packed_round4_exact_characteristic, degree + 1, 192)
matrix_workspace = kernel_integer_zeros(packed_round4_exact_characteristic, degree * degree, 48)
packed_defining = kernel_integer_buffer(packed_round4_exact_characteristic, defining)
packed_element = kernel_integer_buffer(packed_round4_exact_characteristic, element)
packed_prime = kernel_integer_buffer(packed_round4_exact_characteristic, [2])

def measure():
    started = time.perf_counter()
    assert packed_round4_exact_characteristic(
        control,
        output,
        matrix_workspace,
        packed_defining,
        packed_element,
        packed_prime,
        degree,
    )
    return 1000 * (time.perf_counter() - started)

_warmup_ms = measure()
samples = [measure() for _ in range(7)]
samples.sort()
print(repr({
    'compiled': is_compiled(packed_round4_exact_characteristic),
    'median_ms': samples[len(samples)//2],
    'minimum_ms': samples[0],
    'maximum_ms': samples[-1],
    'status': integer_buffer_values(control),
    'output_degree': len(integer_buffer_values(output)) - 1,
}))
`;
  const run = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input: program,
    timeout: 120_000,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(run.stderr || run.stdout);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: 1,
        workload:
          "vector010 transition 49 exact characteristic certificate, degree 32, denominator 2^12",
        sourceHash: compiled.sourceHash,
        nativeAbi: compiled.nativeAbi,
        warmup: 1,
        samples: 7,
        result: run.stdout.trim(),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
