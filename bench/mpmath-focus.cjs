#!/usr/bin/env node
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(
  join(root, "upstream-tests", "python-packages", "manifest.json"),
  "utf8",
));
const mpmath = manifest.packages.find((entry) => entry.name === "mpmath");

const clusters = {
  binding: [
    "test_calculus.test_differint",
    "test_diff.test_diff",
    "test_diff.test_diff_partial",
    "test_diff.test_diffs",
    "test_eigen.test_eig",
    "test_eigen.test_eig_dyn",
    "test_eigen_symmetric.test_eighe_fixed_matrix",
    "test_eigen_symmetric.test_eigsy_irandmatrix",
    "test_eigen_symmetric.test_eigsy_randmatrix",
    "test_eigen_symmetric.test_svd_c_rand",
    "test_eigen_symmetric.test_svd_r_rand",
    "test_elliptic.test_djtheta",
    "test_rootfinding.test_anewton",
    "test_rootfinding.test_findroot",
    "test_rootfinding.test_mnewton",
    "test_rootfinding.test_multiplicity",
  ],
  arithmetic: [
    "test_calculus.test_limits",
    "test_functions2.test_hyper_3f2_etc",
    "test_levin.test_levin_0",
    "test_levin.test_levin_1",
    "test_levin.test_levin_2",
    "test_levin.test_levin_3",
    "test_levin.test_levin_nsum",
    "test_summation.test_nprod",
    "test_summation.test_nsum",
  ],
  conversion: [
    "test_identify.test_pslq",
    "test_special.test_convert_special",
  ],
  metadata: [
    "test_mpmath.test_newstyle_classes",
    "test_quad.test_quadosc",
  ],
};

function usage() {
  console.error(
    "usage: pnpm bench:mpmath:focus [cluster|test.module ...] [--trace] [--cpython]",
  );
  console.error(`clusters: ${Object.keys(clusters).join(", ")}, all`);
}

const raw = process.argv.slice(2);
const trace = raw.includes("--trace");
const cpython = raw.includes("--cpython");
const names = raw.filter((arg) => !arg.startsWith("--"));
let tests;
if (!names.length) {
  tests = clusters.binding;
} else {
  tests = names.flatMap((name) => {
    if (name === "all") return Object.values(clusters).flat();
    if (clusters[name]) return clusters[name];
    if (name.includes(".")) return [name];
    usage();
    process.exit(2);
  });
}
tests = [...new Set(tests)];

const cacheBase = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
const sitePackages = process.env.SAGEJS_MPMATH_SITE_PACKAGES || join(
  cacheBase,
  "sagejs",
  "benchmarks",
  `${mpmath.name}-${mpmath.version}`,
  "site-packages",
);
if (!existsSync(join(sitePackages, "mpmath"))) {
  throw new Error(
    `mpmath benchmark environment is missing; run pnpm bench:mpmath:suite first: ${sitePackages}`,
  );
}

const suite = join(root, "bench", "mpmath-upstream-suite.py");
const command = cpython ? (process.env.PYTHON || "python3") : process.execPath;
const args = cpython
  ? [suite]
  : [join(root, "bin", "sagejs-source.cjs"), "--python", suite];
const env = {
  ...process.env,
  MPMATH_NOGMPY: "Y",
  SAGEJS_MPMATH_FULL_SUITE: "1",
  SAGEJS_MPMATH_SUITE_TESTS: tests.join(","),
  SAGEJS_MPMATH_SUITE_RERAISE: trace ? "1" : "0",
};
if (cpython) env.PYTHONPATH = sitePackages;
else env.SAGEJS_SITE_PACKAGES = sitePackages;

console.error(
  `${cpython ? "CPython" : "Sage.js"}: running ${tests.length} focused mpmath tests`,
);
const result = spawnSync(command, args, {
  cwd: root,
  env,
  encoding: "utf8",
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.error) throw result.error;
process.exit(result.status ?? 1);
