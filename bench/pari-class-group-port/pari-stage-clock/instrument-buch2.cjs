#!/usr/bin/env node
"use strict";

/*
 * Apply the benchmark-only Sage.js stage clock to pristine PARI 2.17.4
 * src/basemath/buch2.c.  Every replacement is deliberately anchored to the
 * pinned source.  Refuse partial or repeated application.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const PRISTINE_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  assert(first >= 0, `${label}: pinned anchor missing`);
  assert.equal(source.indexOf(before, first + 1), -1, `${label}: anchor is ambiguous`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function inserted(value) {
  return value.replace(/^\+/gm, "");
}

function instrument(source) {
  assert.equal(sha256(source), PRISTINE_SHA256, "buch2.c is not pristine PARI 2.17.4");
  assert(!source.includes("sagejs_buchall_stage_clock_reset"), "clock already applied");

  source = replaceOnce(
    source,
    "#include \"pari.h\"\n#include \"paripriv.h\"\n",
    inserted(`#include "pari.h"\n#include "paripriv.h"\n\n/*\n+ * Sage.js benchmark-only instrumentation.  This derivative is never linked\n+ * into the product or used as a mathematical authority.  CLOCK_MONOTONIC\n+ * deltas are charged to exactly one active leaf.\n+ */\n+#include <stdint.h>\n+#include <string.h>\n+#include <time.h>\n+\n+enum\n+{\n+  SAGEJS_BUCHALL_RELATION_RETRY = 0,\n+  SAGEJS_BUCHALL_HNF_SNF_TRANSFORM = 1,\n+  SAGEJS_BUCHALL_UNIT_REGULATOR = 2,\n+  SAGEJS_BUCHALL_HONESTY_GENERATORS_FINAL = 3,\n+  SAGEJS_BUCHALL_UNATTRIBUTED_REMAINDER = 4,\n+  SAGEJS_BUCHALL_STAGE_COUNT = 5\n+};\n+\n+typedef struct\n+{\n+  int enabled;\n+  int active;\n+  int monotonic;\n+  struct timespec last;\n+  uint64_t totals[SAGEJS_BUCHALL_STAGE_COUNT];\n+  uint64_t visits[SAGEJS_BUCHALL_STAGE_COUNT];\n+} sagejs_buchall_stage_clock_t;\n+\n+static _Thread_local sagejs_buchall_stage_clock_t sagejs_buchall_clock;\n+\n+static uint64_t\n+sagejs_buchall_nanoseconds(struct timespec value)\n+{\n+  return (uint64_t)value.tv_sec * UINT64_C(1000000000)\n+       + (uint64_t)value.tv_nsec;\n+}\n+\n+void\n+sagejs_buchall_stage_clock_reset(int enabled)\n+{\n+  memset(&sagejs_buchall_clock, 0, sizeof(sagejs_buchall_clock));\n+  sagejs_buchall_clock.enabled = enabled != 0;\n+  sagejs_buchall_clock.active = SAGEJS_BUCHALL_UNATTRIBUTED_REMAINDER;\n+  sagejs_buchall_clock.monotonic = 1;\n+  sagejs_buchall_clock.visits[sagejs_buchall_clock.active] = 1;\n+  if (sagejs_buchall_clock.enabled)\n+    clock_gettime(CLOCK_MONOTONIC, &sagejs_buchall_clock.last);\n+}\n+\n+void\n+sagejs_buchall_stage_clock_switch(int stage)\n+{\n+  struct timespec now;\n+  uint64_t previous_ns, now_ns;\n+  if (!sagejs_buchall_clock.enabled) return;\n+  if (stage < 0 || stage >= SAGEJS_BUCHALL_STAGE_COUNT)\n+  {\n+    sagejs_buchall_clock.monotonic = 0;\n+    return;\n+  }\n+  clock_gettime(CLOCK_MONOTONIC, &now);\n+  previous_ns = sagejs_buchall_nanoseconds(sagejs_buchall_clock.last);\n+  now_ns = sagejs_buchall_nanoseconds(now);\n+  if (now_ns < previous_ns) sagejs_buchall_clock.monotonic = 0;\n+  else sagejs_buchall_clock.totals[sagejs_buchall_clock.active] +=\n+         now_ns - previous_ns;\n+  sagejs_buchall_clock.last = now;\n+  if (sagejs_buchall_clock.active != stage)\n+  {\n+    sagejs_buchall_clock.active = stage;\n+    sagejs_buchall_clock.visits[stage]++;\n+  }\n+}\n+\n+void\n+sagejs_buchall_stage_clock_finish(void)\n+{\n+  struct timespec now;\n+  uint64_t previous_ns, now_ns;\n+  if (!sagejs_buchall_clock.enabled) return;\n+  clock_gettime(CLOCK_MONOTONIC, &now);\n+  previous_ns = sagejs_buchall_nanoseconds(sagejs_buchall_clock.last);\n+  now_ns = sagejs_buchall_nanoseconds(now);\n+  if (now_ns < previous_ns) sagejs_buchall_clock.monotonic = 0;\n+  else sagejs_buchall_clock.totals[sagejs_buchall_clock.active] +=\n+         now_ns - previous_ns;\n+  sagejs_buchall_clock.last = now;\n+  sagejs_buchall_clock.enabled = 0;\n+}\n+\n+uint64_t\n+sagejs_buchall_stage_clock_total(int stage)\n+{\n+  if (stage < 0 || stage >= SAGEJS_BUCHALL_STAGE_COUNT) return 0;\n+  return sagejs_buchall_clock.totals[stage];\n+}\n+\n+uint64_t\n+sagejs_buchall_stage_clock_visits(int stage)\n+{\n+  if (stage < 0 || stage >= SAGEJS_BUCHALL_STAGE_COUNT) return 0;\n+  return sagejs_buchall_clock.visits[stage];\n+}\n+\n+int\n+sagejs_buchall_stage_clock_monotonic(void)\n+{\n+  return sagejs_buchall_clock.monotonic;\n+}\n+`),
    "instrumentation prelude",
  );

  source = replaceOnce(
    source,
    "void\nsagejs_buchall_stage_clock_reset(int enabled)",
    "static void\nsagejs_buchall_stage_clock_reset_aggregate(int enabled)",
    "rename aggregate reset",
  );
  source = replaceOnce(
    source,
    "void\nsagejs_buchall_stage_clock_switch(int stage)",
    "static void\nsagejs_buchall_stage_clock_switch_aggregate(int stage)",
    "rename aggregate switch",
  );
  source = replaceOnce(
    source,
    "void\nsagejs_buchall_stage_clock_finish(void)",
    "static void\nsagejs_buchall_stage_clock_finish_aggregate(void)",
    "rename aggregate finish",
  );
  source = replaceOnce(
    source,
    "int\nsagejs_buchall_stage_clock_monotonic(void)\n{\n  return sagejs_buchall_clock.monotonic;\n}\n",
    inserted(`int
+sagejs_buchall_stage_clock_monotonic(void)
+{
+  return sagejs_buchall_clock.monotonic;
+}
+
+enum { SAGEJS_BUCHALL_MAX_SEGMENTS = 4096 };
+
+typedef struct
+{
+  int stage;
+  uint64_t nanoseconds;
+} sagejs_buchall_stage_segment_t;
+
+static _Thread_local int sagejs_buchall_segments_enabled;
+static _Thread_local int sagejs_buchall_segments_complete;
+static _Thread_local uint64_t sagejs_buchall_segment_count;
+static _Thread_local sagejs_buchall_stage_segment_t
+  sagejs_buchall_segments[SAGEJS_BUCHALL_MAX_SEGMENTS];
+
+static void
+sagejs_buchall_stage_segment_charge(int stage, uint64_t before)
+{
+  uint64_t elapsed = sagejs_buchall_clock.totals[stage] - before;
+  if (sagejs_buchall_segments_complete && sagejs_buchall_segment_count)
+    sagejs_buchall_segments[sagejs_buchall_segment_count - 1].nanoseconds += elapsed;
+}
+
+void
+sagejs_buchall_stage_clock_reset(int enabled)
+{
+  sagejs_buchall_stage_clock_reset_aggregate(enabled);
+  sagejs_buchall_segments_enabled = enabled != 0;
+  sagejs_buchall_segments_complete = 1;
+  sagejs_buchall_segment_count = sagejs_buchall_segments_enabled ? 1 : 0;
+  if (sagejs_buchall_segment_count)
+  {
+    sagejs_buchall_segments[0].stage = SAGEJS_BUCHALL_UNATTRIBUTED_REMAINDER;
+    sagejs_buchall_segments[0].nanoseconds = 0;
+  }
+}
+
+void
+sagejs_buchall_stage_clock_switch(int stage)
+{
+  int previous_stage;
+  uint64_t before;
+  if (!sagejs_buchall_segments_enabled)
+  {
+    sagejs_buchall_stage_clock_switch_aggregate(stage);
+    return;
+  }
+  previous_stage = sagejs_buchall_clock.active;
+  before = sagejs_buchall_clock.totals[previous_stage];
+  sagejs_buchall_stage_clock_switch_aggregate(stage);
+  sagejs_buchall_stage_segment_charge(previous_stage, before);
+  if (previous_stage != stage)
+  {
+    if (sagejs_buchall_segment_count < SAGEJS_BUCHALL_MAX_SEGMENTS)
+    {
+      uint64_t index = sagejs_buchall_segment_count++;
+      sagejs_buchall_segments[index].stage = stage;
+      sagejs_buchall_segments[index].nanoseconds = 0;
+    }
+    else sagejs_buchall_segments_complete = 0;
+  }
+}
+
+void
+sagejs_buchall_stage_clock_finish(void)
+{
+  int previous_stage;
+  uint64_t before;
+  if (!sagejs_buchall_segments_enabled)
+  {
+    sagejs_buchall_stage_clock_finish_aggregate();
+    return;
+  }
+  previous_stage = sagejs_buchall_clock.active;
+  before = sagejs_buchall_clock.totals[previous_stage];
+  sagejs_buchall_stage_clock_finish_aggregate();
+  sagejs_buchall_stage_segment_charge(previous_stage, before);
+  sagejs_buchall_segments_enabled = 0;
+}
+
+int
+sagejs_buchall_stage_clock_segments_complete(void)
+{
+  return sagejs_buchall_segments_complete;
+}
+
+uint64_t
+sagejs_buchall_stage_clock_segment_count(void)
+{
+  return sagejs_buchall_segment_count;
+}
+
+int
+sagejs_buchall_stage_clock_segment_stage(uint64_t index)
+{
+  if (index >= sagejs_buchall_segment_count) return -1;
+  return sagejs_buchall_segments[index].stage;
+}
+
+uint64_t
+sagejs_buchall_stage_clock_segment_nanoseconds(uint64_t index)
+{
+  if (index >= sagejs_buchall_segment_count) return 0;
+  return sagejs_buchall_segments[index].nanoseconds;
+}
`),
    "ordered segment recorder",
  );

  source = replaceOnce(
    source,
    "\nSTART:\n  if (DEBUGLEVEL) timer_start(&T);",
    "\nSTART:\n  sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_RELATION_RETRY);\n  if (DEBUGLEVEL) timer_start(&T);",
    "relation START",
  );
  source = replaceOnce(
    source,
    "    do\n    {\n      pari_sp av4 = avma;",
    "    do\n    {\n      pari_sp av4 = avma;\n      sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_RELATION_RETRY);",
    "relation inner loop",
  );
  source = replaceOnce(
    source,
    "      if (DEBUGLEVEL) timer_start(&T);\n      if (precpb)",
    "      sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_HNF_SNF_TRANSFORM);\n      if (DEBUGLEVEL) timer_start(&T);\n      if (precpb)",
    "HNF entry",
  );
  source = replaceOnce(
    source,
    "\n    A = vecslice(C, 1, zc); /* cols corresponding to units */",
    "\n    sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_UNIT_REGULATOR);\n    A = vecslice(C, 1, zc); /* cols corresponding to units */",
    "regulator entry",
  );
  source = replaceOnce(
    source,
    "    /* DONE */\n\n    if (F.KCZ2 > F.KCZ)",
    "    /* DONE */\n\n    sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_HONESTY_GENERATORS_FINAL);\n    if (F.KCZ2 > F.KCZ)",
    "honesty entry",
  );
  source = replaceOnce(
    source,
    "    F.KCZ2 = 0; /* be honest only once */\n\n    /* fundamental units */",
    "    F.KCZ2 = 0; /* be honest only once */\n\n    sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_UNIT_REGULATOR);\n    /* fundamental units */",
    "unit entry",
  );
  source = replaceOnce(
    source,
    "\n  Vbase = vecpermute(F.LP, F.perm);",
    "\n  sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_HONESTY_GENERATORS_FINAL);\n  Vbase = vecpermute(F.LP, F.perm);",
    "final assembly entry",
  );
  source = replaceOnce(
    source,
    "  res = buchall_end(nf,res,clg2,W,B,A,Ce,Vbase);\n  delete_FB(&F);\n  res = gerepilecopy(av0, res);\n  if (flag) obj_insert_shallow(res, MATAL, cgetg(1,t_VEC));\n  if (nfisclone) gunclone(nf);",
    inserted(`  res = buchall_end(nf,res,clg2,W,B,A,Ce,Vbase);\n+  sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_UNATTRIBUTED_REMAINDER);\n+  delete_FB(&F);\n+  sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_HONESTY_GENERATORS_FINAL);\n+  res = gerepilecopy(av0, res);\n+  if (flag) obj_insert_shallow(res, MATAL, cgetg(1,t_VEC));\n+  sagejs_buchall_stage_clock_switch(SAGEJS_BUCHALL_UNATTRIBUTED_REMAINDER);\n+  if (nfisclone) gunclone(nf);`),
    "final copy and teardown",
  );
  return source;
}

if (require.main === module) {
  assert.equal(process.argv.length, 4, "usage: instrument-buch2.cjs INPUT OUTPUT");
  const source = fs.readFileSync(process.argv[2], "utf8");
  const result = instrument(source);
  fs.writeFileSync(process.argv[3], result);
  process.stdout.write(`${sha256(result)}\n`);
}

module.exports = { PRISTINE_SHA256, instrument, sha256 };
