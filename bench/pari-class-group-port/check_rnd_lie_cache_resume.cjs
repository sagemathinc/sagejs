"use strict";

// Authenticate PARI's resident state across rnd_rel, then replay the exact
// following small_norm row with the source's absolute done_small counter.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const pari = path.resolve(process.argv[2]);
const archive = path.resolve(process.argv[3]);
const initial = path.resolve(process.argv[4]);
const analytic = path.resolve(process.argv[5]);
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "rnd_lie_cache_resume_fixture.json")),
);
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function evaluate(source, argv, capture) {
  const scopedProcess = Object.create(process);
  scopedProcess.argv = argv;
  scopedProcess.exit = (code) => {
    throw { controlledExit: true, code };
  };
  try {
    vm.runInNewContext(
      source,
      {
        require,
        process: scopedProcess,
        __dirname,
        __filename: argv[1],
        structuredClone,
        Buffer,
        console: { error: console.error, log: capture },
      },
      { filename: argv[1] },
    );
  } catch (error) {
    if (!error || error.controlledExit !== true || error.code !== 0) throw error;
  }
}

function sourceState() {
  const prior = path.join(__dirname, "check_rnd_relation_collector.cjs");
  let source = fs.readFileSync(prior, "utf8");
  source = source.replace(
    "static long forced_random_branch = 0;",
    "static long forced_random_branch = 0; static long audit_lie_seen = 0; static long audit_post_seen = 0;",
  );
  const declaration = String.raw`
static void audit_matrix(GEN a,int word);
#define AUDIT_CACHE_FACT(event,cache,fact) do { \
  printf("{\"event\":\"%s\",\"last\":%ld,\"end\":%ld,\"chk\":%ld,\"missing\":%lu,\"relsup\":%ld,\"fact\":[",event,(cache)->last-(cache)->base,(cache)->end-(cache)->base,(cache)->chk-(cache)->base,(cache)->missing,(cache)->relsup); \
  for(long audit_q=1;audit_q<=(fact)[0].pr;audit_q++){if(audit_q>1)putchar(',');printf("[%ld,%ld]",(fact)[audit_q].pr,(fact)[audit_q].ex);} \
  printf("],\"basis\":");audit_matrix((cache)->basis,1);printf("}\n"); \
} while (0)`;
  source = source.replace(
    "static void audit_matrix(GEN a,int word) {",
    declaration + "\nstatic void audit_matrix(GEN a,int word) {",
  );
  const replacements = [
    [
      "        rnd_rel(&cache, &F, nf, fact); forced_random_branch=2;",
      "        rnd_rel(&cache, &F, nf, fact); forced_random_branch=2;\n        AUDIT_CACHE_FACT(\"rnd_cache_return\",&cache,fact);",
    ],
    [
      "        if (LIE)\n        { /* We have full rank for class group and unit. The following tries to",
      "        if (LIE)\n        { if (forced_random_branch && !audit_lie_seen) { AUDIT_CACHE_FACT(\"lie_entry\",&cache,fact); audit_lie_seen=1; }\n          /* We have full rank for class group and unit. The following tries to",
    ],
    [
      "        long j, k, LIE = (R && lg(W) > 1 && (done_small % 2));\n        REL_t *last = cache.last;",
      "        long j, k, LIE = (R && lg(W) > 1 && (done_small % 2));\n        if (forced_random_branch && !audit_post_seen) { printf(\"{\\\"event\\\":\\\"post_rnd_small_entry\\\",\\\"lie\\\":%ld,\\\"hasR\\\":%ld,\\\"doneSmall\\\":%ld}\\n\",LIE,R?1L:0L,done_small); AUDIT_CACHE_FACT(\"post_rnd_cache_entry\",&cache,fact); audit_post_seen=1; }\n        REL_t *last = cache.last;",
    ],
  ];
  const insertion = replacements
    .map(
      ([from, to]) =>
        `    ${JSON.stringify(`replace(${JSON.stringify(from)}, ${JSON.stringify(to)});`)},`,
    )
    .join("\n");
  source = source.replace('  ].join("\\n");', `${insertion}\n  ].join("\\n");`);
  let oracle;
  evaluate(
    source,
    [process.argv[0], prior, pari, archive, "--field3", "--oracle-only"],
    (text) => {
      oracle = JSON.parse(text);
    },
  );
  const events = JSON.parse(
    fs.readFileSync(path.join(oracle.traceDirectory, "trace.json")),
  );
  const get = (name) => events.find((entry) => entry.event === name);
  const rnd = get("rnd_cache_return");
  const post = get("post_rnd_small_entry");
  const postCache = get("post_rnd_cache_entry");
  const lie = get("lie_entry");
  assert(rnd && post && postCache && lie);
  return {
    rnd: compact(rnd),
    post: { lie: post.lie, hasR: post.hasR, doneSmall: post.doneSmall, ...compact(postCache) },
    lie: compact(lie),
  };
}

function compact(event) {
  return {
    last: event.last,
    end: event.end,
    chk: event.chk,
    missing: event.missing,
    relsup: event.relsup,
    fact: event.fact,
    basisLength: event.basis.length,
    basisHash: hash(event.basis),
  };
}

function cpythonReplay(doneSmall) {
  const prior = path.join(__dirname, "check_rnd_relation_outer_driver.cjs");
  let source = fs.readFileSync(prior, "utf8");
  source = source.replace(
    "action=publish(action,columns);assert action==5,(action,v['append_attempt_state'],control)",
    `action=publish(action,columns);assert action==5,(action,v['append_attempt_state'],control)\nresume=importlib.import_module('bench.pari-class-group-port.rnd_lie_cache_resume').pari_resume_after_random_relations\nassert resume(rows,${doneSmall},v['relation_state'],v['outer_state'])==0`,
  );
  source = source.replace(
    "assert observed==298 and source_next==296",
    "assert observed==296 and source_next==296",
  );
  source = source.replace(
    "assert observed_records[:rows]!=source_records",
    "assert observed_records[:rows]==source_records",
  );
  source = source.replace(
    "out={'randomLast':columns,",
    "observed_generators=list(map(str,v['generators'][columns*n:observed*n]));source_generators=list(map(str,d['appends'][1]['newGenerators']));assert observed_generators[:n]==source_generators;observed_logs=list(map(str,v['log_embeddings'][columns*7*places:observed*7*places]));source_logs=list(map(str,d['appends'][1]['newLogs']));assert observed_logs[:7*places]==source_logs;out={'observedNextGenerators':observed_generators,'sourceNextGenerators':source_generators,'observedNextLogs':observed_logs,'sourceNextLogs':source_logs,'randomLast':columns,",
  );
  source = source.replace(
    "const fixture = JSON.parse(",
    'console.log(JSON.stringify({ replay: expected })); process.exit(0);\nconst fixture = JSON.parse(',
  );
  let replay;
  evaluate(
    source,
    [process.argv[0], prior, pari, archive, initial, analytic],
    (text) => {
      const value = JSON.parse(text);
      if (value.replay) replay = value.replay;
    },
  );
  assert(replay);
  return replay;
}

async function main() {
  assert.deepEqual(fixture.identity, {
    pariVersion: "2.17.4",
    polynomial: "x^4-2000022*x-2000042",
    boundary: "forced rnd_rel return through following small_norm row",
  });
  const source = sourceState();
  assert.deepEqual(source, fixture.source);
  assert.equal(source.rnd.basisHash, source.post.basisHash);
  assert.deepEqual(source.rnd.fact, source.post.fact);
  const replay = cpythonReplay(source.post.doneSmall);
  const replayHashes = {
    rng: hash(replay.rng),
    relations: hash(replay.randomRecords),
    generators: hash(replay.randomGenerators),
    logs: hash(replay.randomLogs),
    hnf: hash(replay.randomHNF),
    next: hash(replay.observedNextRecords),
    sourceNext: hash(replay.sourceNextRecords),
    nextGenerators: hash(replay.observedNextGenerators),
    sourceNextGenerators: hash(replay.sourceNextGenerators),
    nextLogs: hash(replay.observedNextLogs),
    sourceNextLogs: hash(replay.sourceNextLogs),
  };
  assert.deepEqual(
    { randomLast: replay.randomLast, next: replay.observedNext },
    fixture.counts,
  );
  assert.deepEqual(replayHashes, fixture.hashes);
  assert.equal(replayHashes.next, replayHashes.sourceNext);
  assert.equal(replayHashes.nextGenerators, replayHashes.sourceNextGenerators);
  assert.equal(replayHashes.nextLogs, replayHashes.sourceNextLogs);

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "rnd_lie_cache_resume.py"),
  });
  const kernel = require(built.modulePath).pari_resume_after_random_relations;
  assert(kernel.nativeAvailable);
  const backends = [];
  for (const backend of ["javascript", "gmp"]) {
    const relation = [295n, 8192n, 0n, 0n, 295n, 295n];
    const outer = Array(19).fill(0n);
    outer[2] = 1n;
    outer[15] = 1n;
    outer[16] = 5n;
    assert.equal(kernel[backend](288n, 290n, relation, outer), 0n);
    assert.deepEqual(outer.slice(2, 8), [290n, 0n, 0n, 295n, 295n, 0n]);
    const snapshot = [...outer];
    assert.throws(() => kernel[backend](288n, 291n, relation, outer));
    assert.deepEqual(outer, snapshot);
    backends.push(backend);
  }
  console.log(
    JSON.stringify({
      field: 3,
      source,
      cpython: {
        randomLast: replay.randomLast,
        next: replay.observedNext,
        sourceNext: replay.sourceNext,
        hashes: replayHashes,
        outerState: replay.outerState,
      },
      native: backends,
      conclusion:
        "absolute done_small=290 preserves false LIE parity and closes PARI 295->296 exactly",
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
