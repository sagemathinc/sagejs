#!/usr/bin/env node
"use strict";

// Workers for the qualified matched flag-zero timing boundary. Preparation
// builds the pinned PARI derivative once; timed samples only execute an
// authenticated existing Sage.js addon or that prepared executable.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ARCHIVE_SHA256, BUCH2_SHA256, buildAndRun } = require("./h1_matched_flag_zero_control.cjs");

const HERE = __dirname;
const SCHEMA = "sagejs.pari-class-group/h1-matched-flag-zero-worker-v1";
const BOUNDARY = "prepared H1 through one compact p192 PRECI publication";
const FIELD = "x^3-20018*x+20034";
const INPUT_SHA = "22a997866388571cd3c12e1a3ea5c5cc3a7fe89217b253bb0e779007f6fe9b77";
const RELATION_SHA = "b0c647186a5fed5317c7135ccf16623a930631382ad7963e12af4ded2db7259a";
const COMPACT_SHA = "80cec2acce5b95ec48beff67b800410eedb5e580e25029aa79d4d63dc40b1c2d";
const OWNER_SHA = "a0ae8b44555295c035a3603ce4c18dde8dd174bff80b79d34f61d86423a13b5e";
const ROOT = ["0", "1", "3", "192", "1", "0", "0", "7", "73", "8", "0", "1"];
const GETFU = ["3", "10", "-186", "0", "1923", "0", "0", "1"];
const COUNTERS = Object.freeze({
  C1: "333", C2: "333", KC: "66", KCZ: "48", KCZ2: "48",
  accepted_relations: "73", catalog_entries: "1230",
  decomposition_calls: "48", degree_groups: "1833", descriptors: "66",
  factor_attempts: "96", factor_slots: "2270", initial_relations: "12",
  random_relations: "0", small_elements: "1046", subfactor_trials: "4",
  visited_ideals: "16",
});

function sha256File(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function replaceOnce(source, from, to) {
  assert.equal(source.split(from).length, 2, `non-unique PARI marker: ${from}`);
  return source.replace(from, to);
}

function eagerFullSource(pristine) {
  let source = pristine;
  source = replaceOnce(source, '#include "paripriv.h"', String.raw`#include "paripriv.h"
#include <time.h>
#include <sys/resource.h>
static GEN matched_ideals, matched_norms;
static long matched_ideals_visited;
static struct timespec matched_start, matched_stop;
static unsigned long long matched_kernel_ns;`);
  source = replaceOnce(source,
    "{ Nid = pr_norm(id); id = pr_hnf(nf, id);}",
    "{ Nid = gel(matched_norms,j); id = gel(matched_ideals,j); matched_ideals_visited++; }");
  source = replaceOnce(source, "      gel(y,k) = pr_norm(P);",
    "      gel(y,k) = gel(matched_norms,k);");
  const factorBase = "  FBgen(&F, nf, N, LIMC, LIMC2, &GRHcheck);\n  if (!F.KC) goto START;";
  source = replaceOnce(source, factorBase, `${factorBase}
  matched_ideals = cgetg(F.KC+1,t_VEC);
  matched_norms = cgetg(F.KC+1,t_VEC);
  {
    long matched_packet = 0, matched_j, matched_k;
    for (matched_j=1; matched_j<=F.KCZ; matched_j++) {
      GEN matched_group=gel(F.LV,F.FB[matched_j]);
      for (matched_k=1; matched_k<lg(matched_group); matched_k++) {
        GEN matched_id=gel(matched_group,matched_k); matched_packet++;
        gel(matched_ideals,matched_packet)=pr_hnf(nf,matched_id);
        gel(matched_norms,matched_packet)=pr_norm(matched_id);
      }
    }
  }`);
  const getfu = "      fu = getfu(nf, &A, CU? &U: NULL, PREC);";
  source = replaceOnce(source, getfu, `${getfu}
      clock_gettime(CLOCK_MONOTONIC_RAW, &matched_stop);
      matched_kernel_ns =
        (unsigned long long)(matched_stop.tv_sec-matched_start.tv_sec)*1000000000ULL +
        (unsigned long long)(matched_stop.tv_nsec-matched_start.tv_nsec);`);
  source += String.raw`
int main(void) {
  GEN nf, result; struct rusage usage;
  pari_init(768000000,1000000); setrand(gp_read_str("1"));
  nf=nfinit0(gp_read_str("x^3-20018*x+20034"),0,nbits2prec(192));
  matched_ideals_visited=0; clock_gettime(CLOCK_MONOTONIC_RAW,&matched_start);
  result=Buchall_param(nf,0.,0.,BNF_RELPID,0,nbits2prec(192));
  if(!result || !matched_kernel_ns)return 2;
  getrusage(RUSAGE_SELF,&usage);
  printf("{\"kernelNs\":\"%llu\",\"peakRssKiB\":\"%ld\",\"visitedIdeals\":\"%ld\"}\n",
         matched_kernel_ns,usage.ru_maxrss,matched_ideals_visited);
  pari_close(); return 0;
}
`;
  return source;
}

function compile(source, filename, executable, pariRoot) {
  fs.writeFileSync(filename, source);
  const library = path.join(pariRoot, "Olinux-x86_64");
  const compiler = process.env.CC || "cc";
  const args = [
    "-O3", "-Wall", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${library}`,
    filename, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm",
    "-o", executable,
  ];
  run(compiler, args);
  return { compiler, args };
}

function normalizeCounters(record) {
  const map = {
    catalogEntries: "catalog_entries", degreeGroups: "degree_groups",
    factorSlots: "factor_slots", decompositionCalls: "decomposition_calls",
    subfactorTrials: "subfactor_trials", initialRelations: "initial_relations",
    acceptedRelations: "accepted_relations", visitedIdeals: "visited_ideals",
    smallElements: "small_elements", factorAttempts: "factor_attempts",
    randomRelations: "random_relations",
  };
  return Object.fromEntries(Object.entries(record).map(([key, value]) =>
    [map[key] || key, String(value)]));
}

function preparePari(outputDirectory) {
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz");
  assert.equal(sha256File(archive), ARCHIVE_SHA256);
  assert.equal(sha256File(path.join(pariRoot, "src/basemath/buch2.c")), BUCH2_SHA256);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const control = buildAndRun({ pariRoot, archive });
  assert.equal(control.records.length, 2);
  const [relation, compact] = control.records;
  assert.equal(relation.kind, "relation-prefix");
  assert.equal(compact.kind, "compact-p192");
  assert.deepEqual(normalizeCounters(relation.counters), COUNTERS);
  assert.equal(compact.precisionBits, "192");
  assert.equal(String(compact.getfuReason), "3");
  assert.equal(compact.expandedUnits, null);
  assert.deepEqual(relation.terminalRngState, compact.terminalRngState);

  const pristine = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(digest(Buffer.from(pristine).toString("base64")),
    digest(Buffer.from(fs.readFileSync(path.join(pariRoot, "src/basemath/buch2.c"))).toString("base64")));
  const source = eagerFullSource(pristine);
  const sourcePath = path.join(outputDirectory, "matched-eager-timing.c");
  const executable = path.join(outputDirectory, "matched-eager-timing");
  const build = compile(source, sourcePath, executable, pariRoot);
  const probe = JSON.parse(run(executable, []).trim());
  assert.equal(probe.visitedIdeals, "16");
  const library = fs.realpathSync(path.join(pariRoot, "Olinux-x86_64/libpari.so"));
  const descriptor = {
    schema: "sagejs.pari-class-group/h1-matched-pari-timing-build-v1",
    executable, sourcePath,
    inputSha256: INPUT_SHA, relationPrefixSha256: RELATION_SHA,
    compactSha256: COMPACT_SHA, ownerEvidenceSha256: OWNER_SHA,
    terminalRngSha256: digest(relation.terminalRngState.map(String)),
    counters: COUNTERS, root: ROOT, getfu: GETFU,
    identities: {
      archiveSha256: ARCHIVE_SHA256, pristineBuch2Sha256: BUCH2_SHA256,
      derivativeSourceSha256: sha256File(sourcePath),
      executableSha256: sha256File(executable),
      librarySha256: sha256File(library),
      controlExecutableSha256: control.executableSha256,
      relationControlExecutableSha256: control.relationExecutableSha256,
      compiler: build.compiler,
      compilerVersionSha256: digest(run(build.compiler, ["--version"])),
      flags: build.args.filter((value) => value.startsWith("-")),
    },
    excludedProbeKernelNs: probe.kernelNs,
  };
  const descriptorPath = path.join(outputDirectory, "descriptor.json");
  fs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  return { descriptorPath, ...descriptor };
}

function common(implementation, sample) {
  return {
    schema: SCHEMA, implementation, boundary: BOUNDARY, field: FIELD,
    relationPrefixSha256: RELATION_SHA, compactSha256: COMPACT_SHA,
    ownerEvidenceSha256: OWNER_SHA,
    terminalRngSha256: sample.terminalRngSha256,
    counters: COUNTERS, root: ROOT, getfuState: GETFU,
    status: "not_given(PRECI)", precisionBits: "192", getfuAttempts: "1",
    precisionRetries: "0", strongerExactSuffixCalls: "0",
    publicComplete: false, nativeCalls: "1", evidenceInsideClock: false,
    kernelNs: sample.kernelNs, peakRssKiB: String(sample.peakRssKiB),
    artifactIdentity: sample.artifactIdentity,
  };
}

function sageWorker(inputPath) {
  assert.equal(sha256File(inputPath), INPUT_SHA);
  const checker = path.join(HERE, "check_h1_matched_flag_zero_fused.cjs");
  const result = run(process.execPath, [checker, "--validate-artifact", inputPath, "none"], {
    env: process.env,
  });
  const sample = JSON.parse(result.trim().split("\n").at(-1));
  assert.equal(sample.relationSha256, RELATION_SHA);
  assert.equal(sample.compactSha256, COMPACT_SHA);
  assert.equal(sample.ownerEvidenceSha256, OWNER_SHA);
  assert.deepEqual(sample.counters, COUNTERS);
  assert.deepEqual(sample.root, ROOT);
  assert.deepEqual(sample.getfu, GETFU);
  return common("sagejs", {
    kernelNs: sample.wallNs, peakRssKiB: sample.peakRssKiB,
    terminalRngSha256: sample.terminalRngSha256,
    artifactIdentity: {
      ...sample.artifactIdentity,
      checkerSha256: sha256File(checker), inputSha256: INPUT_SHA,
      runtime: process.version,
    },
  });
}

function pariWorker(descriptorPath) {
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
  assert.equal(descriptor.schema, "sagejs.pari-class-group/h1-matched-pari-timing-build-v1");
  assert.equal(sha256File(descriptor.executable), descriptor.identities.executableSha256);
  assert.equal(sha256File(descriptor.sourcePath), descriptor.identities.derivativeSourceSha256);
  const sample = JSON.parse(run(descriptor.executable, []).trim());
  assert.equal(sample.visitedIdeals, "16");
  return common("pari-2.17.4", {
    kernelNs: sample.kernelNs, peakRssKiB: sample.peakRssKiB,
    terminalRngSha256: descriptor.terminalRngSha256,
    artifactIdentity: {
      ...descriptor.identities,
      descriptorSha256: sha256File(descriptorPath), inputSha256: INPUT_SHA,
    },
  });
}

const [mode, ...args] = process.argv.slice(2);
try {
  let output;
  if (mode === "--prepare-pari") output = preparePari(path.resolve(args[0]));
  else if (mode === "--sage") output = sageWorker(path.resolve(args[0]));
  else if (mode === "--pari") output = pariWorker(path.resolve(args[0]));
  else throw new Error("expected --prepare-pari, --sage, or --pari");
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
