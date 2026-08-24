#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..", "..", "..");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kernels.py",
);
const benchmark = join(
  root,
  "bench",
  "hyperelliptic",
  "benchmark-public-jacobian.cjs",
);
const sagejs = join(root, "bin", "sagejs");

function options(argv) {
  const result = { check: false, output: null, expectedCommit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") result.check = true;
    else if (argument === "--output") result.output = resolve(argv[++index]);
    else if (argument === "--expected-commit") {
      result.expectedCommit = argv[++index];
    } else throw new Error(`unknown argument ${argument}`);
  }
  if (!result.check && (result.output === null || result.expectedCommit === null)) {
    throw new Error("--output and --expected-commit are required");
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function command(name, args, { env = {}, timeout = 600_000 } = {}) {
  const result = spawnSync(name, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${name} ${args.join(" ")} failed with ${result.status}\n` +
        `${result.stdout}${result.stderr}`,
    );
  }
  return result;
}

function standaloneHarness() {
  const sourceText = readFileSync(benchmark, "utf8");
  const match = sourceText.match(
    /const standaloneHarness = String\.raw`([\s\S]*?)`;\n\nconst temporary/,
  );
  assert(match, "the public Jacobian benchmark has no standalone core harness");
  const exercise = String.raw`
static int exercise_scalar_and_progression(uint64_t genus) {
  static const uint64_t identity[8] = {1, 0, 1, 0, 0, 1, 0, 0};
  static const uint64_t genus2_step[8] = {1, 1008, 1, 0, 0, 149, 0, 0};
  static const uint64_t genus3_step[8] = {1, 1008, 1, 0, 0, 1007, 0, 0};
  const uint64_t *step = genus == 2 ? genus2_step : genus3_step;
  uint64_t model[12] = {0};
  uint64_t scalar_words[1] = {257};
  uint64_t scalar_signs[1] = {0};
  uint64_t scalar_statuses[1] = {0};
  uint64_t scalar_output[8] = {0};
  uint64_t *progression = calloc(COUNT * 8, sizeof(uint64_t));
  uint64_t *statuses = calloc(COUNT, sizeof(uint64_t));
  sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
  int accepted = 0;
  if (progression == NULL || statuses == NULL) return 0;
  model[0] = 1;
  model[1] = genus == 2 ? 1 : 2;
  model[genus == 2 ? 5 : 7] = 1;
  if (!sagejs_kernel_packed_cantor_progression_batch(
          &status, &accepted,
          (sagejs_source_u64_buffer){progression, COUNT * 8},
          (sagejs_source_u64_buffer){statuses, COUNT},
          (sagejs_source_u64_buffer){model, 12},
          (sagejs_source_u64_buffer){(uint64_t *) identity, 8},
          (sagejs_source_u64_buffer){(uint64_t *) step, 8},
          COUNT, genus, 1009) ||
      accepted != 1 || status.code != SAGEJS_NATIVE_OK) {
    free(statuses);
    free(progression);
    return 0;
  }
  status = (sagejs_native_status){SAGEJS_NATIVE_OK, NULL};
  accepted = 0;
  if (!sagejs_kernel_packed_cantor_scalar_batch(
          &status, &accepted,
          (sagejs_source_u64_buffer){scalar_output, 8},
          (sagejs_source_u64_buffer){scalar_statuses, 1},
          (sagejs_source_u64_buffer){model, 12},
          (sagejs_source_u64_buffer){(uint64_t *) step, 8},
          (sagejs_source_u64_buffer){scalar_words, 1},
          (sagejs_source_u64_buffer){scalar_signs, 1},
          1, 1, genus, 1009) ||
      accepted != 1 || status.code != SAGEJS_NATIVE_OK ||
      memcmp(scalar_output, progression + 257 * 8, 8 * sizeof(uint64_t)) != 0) {
    free(statuses);
    free(progression);
    return 0;
  }
  free(statuses);
  free(progression);
  return 1;
}

`;
  return match[1]
    .replace("int main(void) {", `${exercise}int main(void) {`)
    .replace(
      "  const uint64_t time2 = bench_case(2, &digest2);",
      "  if (!exercise_scalar_and_progression(2) || " +
        "!exercise_scalar_and_progression(3)) return 5;\n" +
        "  const uint64_t time2 = bench_case(2, &digest2);",
    );
}

function main() {
  const config = options(process.argv.slice(2));
  const harnessText = standaloneHarness();
  if (config.check) {
    assert.match(harnessText, /sagejs_kernel_packed_cantor_add_batch/);
    assert.match(harnessText, /sagejs_kernel_packed_cantor_scalar_batch/);
    assert.match(harnessText, /sagejs_kernel_packed_cantor_progression_batch/);
    assert.match(harnessText, /genus == 2/);
    assert.match(harnessText, /bench_case\(3/);
    process.stdout.write("Cantor sanitizer harness extraction passed\n");
    return;
  }
  assert.match(config.expectedCommit, /^[0-9a-f]{40}$/);
  const commit = command("git", ["rev-parse", "HEAD"]).stdout.trim();
  const status = command("git", ["status", "--short"]).stdout;
  assert.equal(commit, config.expectedCommit, "unexpected source revision");
  assert.equal(status, "", "sanitizer evidence requires a clean checkout");

  const flintPrefix = resolve(
    process.env.SAGEJS_FLINT_PREFIX ||
      join(root, "packages", "flint", ".native", "prefix"),
  );
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cantor-sanitizer-"));
  try {
    const cache = join(temporary, "cache");
    const harness = join(temporary, "standalone.c");
    writeFileSync(harness, harnessText);
    command(process.execPath, [
      sagejs,
      "native",
      "compile",
      source,
      "--cache-root",
      cache,
    ]);
    const index = JSON.parse(readFileSync(join(cache, "index.json"), "utf8"));
    const entry = index.sources[source];
    assert(entry, "compiled Cantor cache has no source entry");
    const artifact = join(cache, entry.cacheKey);
    const core = join(artifact, "kernel_core.c");
    const common = [
      "-O1",
      "-g",
      "-DSAGEJS_NATIVE_SOURCE_BOUNDS_CHECK=1",
      "-fPIC",
      "-fno-omit-frame-pointer",
      "-std=c11",
      "-I",
      artifact,
      "-I",
      join(flintPrefix, "include"),
      core,
      harness,
      join(flintPrefix, "lib", "libflint.a"),
      join(flintPrefix, "lib", "libopenblas.a"),
      join(flintPrefix, "lib", "libmpfr.a"),
      join(flintPrefix, "lib", "libgmp.a"),
      "-lm",
      "-lpthread",
      "-ldl",
    ];
    const rows = [];
    for (const sanitizer of ["address", "undefined", "leak"]) {
      const executable = join(temporary, `cantor-${sanitizer}`);
      const compile = command("cc", [
        ...common,
        `-fsanitize=${sanitizer}`,
        "-o",
        executable,
      ]);
      const run = command(executable, [], {
        env: {
          ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1",
          LSAN_OPTIONS: "exitcode=23",
          UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
        },
      });
      const value = JSON.parse(run.stdout);
      assert.deepEqual(
        value.rows.map((row) => [row.genus, row.digest]),
        [
          [2, "16532588233038003552"],
          [3, "8706117988639488592"],
        ],
      );
      rows.push({
        sanitizer,
        status: "passed",
        compile_stdout_sha256: sha256(compile.stdout),
        compile_stderr_sha256: sha256(compile.stderr),
        stdout_sha256: sha256(run.stdout),
        stderr_sha256: sha256(run.stderr),
        exact: value.rows.map((row) => ({
          genus: row.genus,
          digest: row.digest,
        })),
      });
    }
    const receipt = {
      schema: "sagejs.hyperelliptic-cantor-sanitizers/v1",
      platform: `${process.platform}-${process.arch}`,
      source_commit: commit,
      source_sha256: sha256(readFileSync(source)),
      generated_core_sha256: sha256(readFileSync(core)),
      harness_path: "bench/hyperelliptic/benchmark-public-jacobian.cjs",
      harness_sha256: sha256(readFileSync(benchmark)),
      sanitizer_harness_sha256: sha256(harnessText),
      flint_prefix_identity: sha256(
        readFileSync(join(flintPrefix, "include", "flint", "flint.h")),
      ),
      rows,
    };
    writeFileSync(config.output, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(`${config.output}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main();
