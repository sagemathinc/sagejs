"use strict";
// Generated-core ABI diagnostic only: no handwritten arithmetic implementation.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const compilerOption = process.argv.find(arg => arg.startsWith("--compiler-root="));
const compilerRoot = compilerOption ? path.resolve(compilerOption.slice("--compiler-root=".length)) : path.resolve(__dirname, "../..");
const { compileKernel } = require(path.join(compilerRoot, "tools/native-kernel/compiler.cjs"));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 120000, maxBuffer: 2 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]);
  const prefix = path.resolve(process.argv[3]);
  const signed = process.argv.includes("--signed-addition");
  const entry = signed ? "pari_signed_real_sum" : "pari_short_product";
  const allRows = JSON.parse(run("python3", [path.join(__dirname,
    signed ? "check_signed_add.py" : "check_multiply_precision.py"), pari, prefix, "--json"]));
  const precision192 = process.argv.includes("--precision-192");
  const rows = precision192 ? allRows.filter(row => Number(row[1]) === 192 && Number(row[4]) === 192) : allRows;
  assert(rows.length > 0 && rows.length <= 2000);
  assert(rows.every(row => row.length === 9));
  const coreOption = process.argv.find(arg => arg.startsWith("--core="));
  assert(!(coreOption && compilerOption), "select a compiler or an existing generated core, not both");
  const built = coreOption ? { coreSourcePath: path.resolve(coreOption.slice(7)) } :
    await compileKernel({ sourcePath: path.join(__dirname, "short_product.py") });
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert(core.includes(`static int tagged_${entry}(`));
  assert(core.includes(`static int native_${entry}(`));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-arithmetic-backends-"));
  const source = path.join(dir, "driver.c"), exe = path.join(dir, "driver");
  fs.writeFileSync(source, `#include <stdio.h>
#include "${built.coreSourcePath}"
#include <stdlib.h>
#include <time.h>
typedef struct { mpz_t inputs[6], expected[3]; sagejs_tagged_int tagged[6]; } input_row;
static void check(int ok) { if (!ok) { fputs("arithmetic backend mismatch or invalid input\\n", stderr); exit(2); } }
static void reset_tagged(sagejs_tagged_int *target, const mpz_t source) {
  sagejs_tagged_clear(target);sagejs_tagged_init(target);int64_t small;
  if(mpz_to_int64(source,&small))sagejs_tagged_set_small(target,small);
  else{sagejs_tagged_make_big(target);mpz_set(target->big,source);}
}
int main(void) {
  size_t count; check(scanf("%zu", &count)==1 && count>0 && count<=2000);
  input_row *rows=calloc(count,sizeof(input_row)); check(rows!=NULL);
  for(size_t r=0;r<count;r++) {
    for(int j=0;j<6;j++) { mpz_init(rows[r].inputs[j]); check(mpz_inp_str(rows[r].inputs[j],stdin,10)>0);
      sagejs_tagged_init(&rows[r].tagged[j]); int64_t small;
      if(mpz_to_int64(rows[r].inputs[j],&small))sagejs_tagged_set_small(&rows[r].tagged[j],small);
      else{sagejs_tagged_make_big(&rows[r].tagged[j]);mpz_set(rows[r].tagged[j].big,rows[r].inputs[j]);} }
    for(int j=0;j<3;j++) { mpz_init(rows[r].expected[j]); check(mpz_inp_str(rows[r].expected[j],stdin,10)>0); }
  }
  mpz_t out[3], decoded; sagejs_tagged_int tagged_out[3]; mpz_init(decoded);
  for(int j=0;j<3;j++){mpz_init(out[j]);sagejs_tagged_init(&tagged_out[j]);}
  for(int pair=-1;pair<3;pair++) for(int order=0;order<2;order++) {
    int backend=pair<0?order:(pair+order)%2; double seconds=0;
    int repetitions=pair<0?1:200;
    for(size_t r=0;r<count;r++) {
      input_row *v=&rows[r]; sagejs_native_status status={0}; struct timespec start,end;
      for(int k=0;k<repetitions;k++) {
        /* Callees may promote borrowed tagged operands without changing their
         * values. Restore representation outside each timer, not just once
         * per case, so repetitions do not inherit that representation. */
        if(backend)for(int j=0;j<6;j++)reset_tagged(&v->tagged[j],v->inputs[j]);
        clock_gettime(CLOCK_MONOTONIC,&start);
        int ok=backend ? tagged_${entry}(&status,&tagged_out[0],&tagged_out[1],&tagged_out[2],
          &v->tagged[0],&v->tagged[1],&v->tagged[2],&v->tagged[3],&v->tagged[4],&v->tagged[5]) :
          native_${entry}(&status,out[0],out[1],out[2],v->inputs[0],v->inputs[1],v->inputs[2],v->inputs[3],v->inputs[4],v->inputs[5]);
        clock_gettime(CLOCK_MONOTONIC,&end);
        seconds+=(end.tv_sec-start.tv_sec)+(end.tv_nsec-start.tv_nsec)*1e-9;
        check(ok && !status.code);
      }
      for(int j=0;j<3;j++) { if(backend){if(tagged_out[j].is_big)mpz_set(decoded,tagged_out[j].big);
        else set_mpz_int64(decoded,tagged_out[j].small);check(mpz_cmp(decoded,v->expected[j])==0);}
        else check(mpz_cmp(out[j],v->expected[j])==0); }
    }
    if(pair>=0)printf("%d %d %.9f\\n",pair,backend,seconds);
  }
  for(int j=0;j<3;j++){mpz_clear(out[j]);sagejs_tagged_clear(&tagged_out[j]);}mpz_clear(decoded);
  for(size_t r=0;r<count;r++){for(int j=0;j<6;j++){mpz_clear(rows[r].inputs[j]);sagejs_tagged_clear(&rows[r].tagged[j]);}
    for(int j=0;j<3;j++)mpz_clear(rows[r].expected[j]);}free(rows);return 0;
}
`);
  const compileStart = performance.now();
  run("cc", ["-O2", "-ffp-contract=off", "-I" + path.join(prefix, "include"), source,
    "-L" + path.join(prefix, "lib"), "-Wl,-rpath," + path.join(prefix, "lib"),
    "-lgmp", "-lmpfr", "-lmpc", "-lm", "-o", exe]);
  const compileSeconds = (performance.now() - compileStart) / 1000;
  const output = run(exe, [], { input: [String(rows.length), ...rows.flat().map(String)].join("\n") + "\n" });
  const samples = output.trim().split("\n").map(line => {
    const [pair, backend, seconds] = line.split(" ").map(Number);
    assert(Number.isFinite(seconds) && seconds >= 0);
    return { pair, backend: backend ? "tagged" : "gmp", seconds };
  });
  assert.equal(samples.length, 6);
  console.log(JSON.stringify({ qualified: false, entry, cases: rows.length, precision192, repetitions: 200,
    boundary: "Direct generated functions, operands preloaded and tagged representation reset outside every call timer, one discarded warmup; output storage reused. Per-call clocks; no host marshalling. Short unpinned alternating diagnostics, not collector parity.",
    compileSeconds, core: built.coreSourcePath, coreSha256: createHash("sha256").update(core).digest("hex"), samples }));
})().catch(error => { console.error(error); process.exitCode = 1; });
