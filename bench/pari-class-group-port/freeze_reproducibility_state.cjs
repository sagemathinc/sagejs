#!/usr/bin/env node
"use strict";

// Read-only, deterministic identity freezer for the class-group experiment.
// It hashes committed sources, installed tools, pristine PARI, and explicitly
// named generated-artifact roots. It does not build, benchmark, or claim that
// the working tree or host is suitable for qualified timing.

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PARI_ROOT = "/home/user/upstream/pari-2.17.4";
const DEFAULT_PARI_ARCHIVE = "/home/user/upstream/pari-2.17.4.tar.gz";
const SOURCE_GROUPS = Object.freeze({
  experiment: ["bench/pari-class-group-port"],
  compiler: [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tools/native-compiler.ts",
    "tools/native-kernel",
    "src/baselib/sagejs/runtime.py",
    "src/baselib/sagejs/runtime.pyi",
  ],
  plansAndAudits: [
    "agents/pari-class-group-end-to-end-native-plan.md",
    "agents/pari-class-group-e2e-checkpoint-2026-09-17.md",
    "agents/pari-class-group-e2e-completion-matrix.md",
    "agents/pari-class-group-e2e-completion-matrix-addendum-2026-09-18T060951Z.md",
    "agents/pari-class-group-e2e-completion-matrix-addendum-2026-09-18T063058Z.md",
    "agents/pari-class-group-e2e-resource-ledger.md",
    "agents/pari-class-group-current-freeze-audit.md",
  ],
});

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function run(command, args, { cwd = ROOT, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    if (allowFailure) return null;
    fail(`${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (allowFailure) return null;
    fail(`${command} ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
  }
  return result.stdout;
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileIdentity(filename) {
  if (!fs.existsSync(filename)) return { status: "absent" };
  const stat = fs.statSync(filename);
  if (!stat.isFile()) return { status: "not-file" };
  const data = fs.readFileSync(filename);
  return { status: "present", bytes: data.length, sha256: sha256Buffer(data) };
}

function executableIdentity(command, versionArgs = ["--version"]) {
  const resolved = run("bash", ["-lc", `command -v -- ${JSON.stringify(command)}`], {
    allowFailure: true,
  });
  if (resolved === null) return { status: "absent" };
  const filename = resolved.trim();
  const version = run(filename, versionArgs, { allowFailure: true });
  return {
    status: "present",
    path: filename,
    ...fileIdentity(filename),
    version: version === null ? null : version.trim().split("\n")[0],
  };
}

function parseArgs(argv) {
  const options = {
    commit: "HEAD",
    pariRoot: process.env.SAGEJS_PARI_ROOT || DEFAULT_PARI_ROOT,
    pariArchive: process.env.SAGEJS_PARI_ARCHIVE || DEFAULT_PARI_ARCHIVE,
    artifactRoots: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--commit") options.commit = argv[++i];
    else if (arg === "--pari-root") options.pariRoot = argv[++i];
    else if (arg === "--pari-archive") options.pariArchive = argv[++i];
    else if (arg === "--artifact-root") options.artifactRoots.push(argv[++i]);
    else fail(`unknown argument: ${arg}`);
    if (argv[i] === undefined) fail(`missing value for ${arg}`);
  }
  return options;
}

function committedGroup(commit, paths) {
  const records = [];
  const listing = run("git", ["ls-tree", "-r", "-l", commit, "--", ...paths]);
  for (const line of listing.split("\n")) {
    if (line === "") continue;
    const match = /^(\d+) (\w+) ([0-9a-f]+)\s+(\d+)\t(.*)$/.exec(line);
    if (match === null) fail(`unexpected git ls-tree record: ${line}`);
    records.push({
      mode: match[1],
      type: match[2],
      oid: match[3],
      bytes: Number(match[4]),
      path: match[5],
    });
  }
  records.sort((a, b) => a.path.localeCompare(b.path));
  const canonical = records
    .map(({ mode, type, oid, bytes, path: filename }) =>
      `${mode}\0${type}\0${oid}\0${bytes}\0${filename}\n`,
    )
    .join("");
  const extensions = {};
  for (const record of records) {
    const extension = path.extname(record.path) || "[none]";
    const entry = extensions[extension] || { files: 0, bytes: 0 };
    entry.files += 1;
    entry.bytes += record.bytes;
    extensions[extension] = entry;
  }
  return {
    files: records.length,
    bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    sha256: sha256Buffer(canonical),
    extensions: Object.fromEntries(Object.entries(extensions).sort()),
  };
}

function artifactGroup(root) {
  const absolute = path.resolve(root);
  if (!fs.existsSync(absolute)) return { path: absolute, status: "absent" };
  const listing = run("find", [absolute, "-type", "f", "-print0"]);
  const filenames = listing.split("\0").filter(Boolean).sort();
  const records = filenames.map((filename) => {
    const data = fs.readFileSync(filename);
    return {
      path: path.relative(absolute, filename),
      bytes: data.length,
      sha256: sha256Buffer(data),
    };
  });
  const canonical = records
    .map((record) => `${record.sha256}\0${record.bytes}\0${record.path}\n`)
    .join("");
  return {
    path: absolute,
    status: "present",
    files: records.length,
    bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    sha256: sha256Buffer(canonical),
  };
}

function pariIdentity(pariRoot, pariArchive) {
  const root = path.resolve(pariRoot);
  const archive = path.resolve(pariArchive);
  const gpCandidates = [
    path.join(root, "gp"),
    path.join(root, "src/test/64/gp"),
    path.join(root, "src/test/32/gp"),
  ];
  const gp = gpCandidates.find((candidate) => fs.existsSync(candidate));
  const libraryCandidates = [
    path.join(root, "Olinux-x86_64/libpari.so"),
    path.join(root, "Olinux-x86_64/libpari.so.8"),
    path.join(root, "Olinux-x86_64/libpari.so.2.17.4"),
  ];
  const library = libraryCandidates.find((candidate) => fs.existsSync(candidate));
  let version = null;
  if (gp !== undefined) {
    const result = spawnSync(gp, ["--version"], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    version = result.status === 0 && output !== "" ? output.split("\n")[0].trim() : null;
  }
  return {
    expectedVersion: "2.17.4",
    root,
    archive: { path: archive, ...fileIdentity(archive) },
    buch2: {
      path: path.join(root, "src/basemath/buch2.c"),
      ...fileIdentity(path.join(root, "src/basemath/buch2.c")),
    },
    gp: gp === undefined ? { status: "absent" } : { path: gp, ...fileIdentity(gp), version },
    library: library === undefined ? { status: "absent" } : { path: library, ...fileIdentity(library) },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const commit = run("git", ["rev-parse", `${options.commit}^{commit}`]).trim();
  const tree = run("git", ["rev-parse", `${commit}^{tree}`]).trim();
  const sourceGroups = {};
  for (const [name, paths] of Object.entries(SOURCE_GROUPS)) {
    sourceGroups[name] = { paths, ...committedGroup(commit, paths) };
  }
  const manifest = {
    schema: "sagejs.pari-class-group/reproducibility-freeze-v1",
    semantics: {
      deterministic: "No timestamp, timing, hostname, or mutable working-tree content is included.",
      qualification: false,
      qualificationReason:
        "Identity capture is not a clean build, performance run, resource high-water measurement, or timing-host certification.",
    },
    git: { commit, tree },
    sources: sourceGroups,
    toolchain: {
      node: executableIdentity(process.execPath),
      python3: executableIdentity("python3"),
      clang: executableIdentity("clang"),
      cc: executableIdentity("cc"),
      pnpm: executableIdentity("pnpm"),
    },
    pari: pariIdentity(options.pariRoot, options.pariArchive),
    artifacts: options.artifactRoots.map(artifactGroup),
  };
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main();
