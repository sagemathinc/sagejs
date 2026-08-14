"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  REMOTE_MAIN_REF,
} = require("../scripts/release-source-policy.cjs");

const SCRIPT = resolve(__dirname, "../scripts/release-source-policy.cjs");

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(repository, contents, message) {
  writeFileSync(join(repository, "source.txt"), `${contents}\n`);
  git(repository, "add", "source.txt");
  git(repository, "commit", "-m", message);
  return git(repository, "rev-parse", "HEAD");
}

function repositoryFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sagejs-release-source-policy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin.git");
  const repository = join(root, "repository");
  git(root, "init", "--bare", "--initial-branch=main", origin);
  git(root, "init", "--initial-branch=main", repository);
  git(repository, "config", "user.name", "Sage.js Release Policy Test");
  git(repository, "config", "user.email", "release-policy@example.invalid");
  git(repository, "remote", "add", "origin", origin);
  const older = commit(repository, "older", "older merged source");
  const tip = commit(repository, "tip", "current main source");
  git(repository, "push", "--set-upstream", "origin", "main");
  return { older, repository, tip };
}

function runPolicy(repository, { ref, sha }) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: repository,
    encoding: "utf8",
    env: {
      ...process.env,
      EVENT_NAME: "push",
      GITHUB_REF: ref,
      GITHUB_SHA: sha,
      REF_TYPE: "tag",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function output(result) {
  return `${result.stdout || ""}${result.stderr || ""}`;
}

test("an annotated tag at the main tip passes", (t) => {
  const { repository, tip } = repositoryFixture(t);
  git(repository, "tag", "-a", "v0.2.0-rc.1", "-m", "release candidate");
  git(repository, "update-ref", "-d", "refs/remotes/origin/main");

  const result = runPolicy(repository, {
    ref: "refs/tags/v0.2.0-rc.1",
    sha: tip,
  });

  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /release source accepted/);
  assert.equal(git(repository, "rev-parse", REMOTE_MAIN_REF), tip);
});

test("a lightweight tag fails closed", (t) => {
  const { repository, tip } = repositoryFixture(t);
  git(repository, "tag", "v0.2.0-rc.1");

  const result = runPolicy(repository, {
    ref: "refs/tags/v0.2.0-rc.1",
    sha: tip,
  });

  assert.notEqual(result.status, 0, output(result));
  assert.match(result.stderr, /must be an annotated tag, got commit/);
});

test("an annotated tag on an unmerged side branch fails closed", (t) => {
  const { older, repository } = repositoryFixture(t);
  git(repository, "checkout", "-b", "unmerged", older);
  const side = commit(repository, "side", "unmerged release source");
  git(repository, "tag", "-a", "v0.2.0-rc.1", "-m", "unmerged candidate");

  const result = runPolicy(repository, {
    ref: "refs/tags/v0.2.0-rc.1",
    sha: side,
  });

  assert.notEqual(result.status, 0, output(result));
  assert.match(result.stderr, /is not an ancestor of origin\/main/);
});

test("a workflow SHA different from the tag target fails closed", (t) => {
  const { older, repository } = repositoryFixture(t);
  git(repository, "tag", "-a", "v0.2.0-rc.1", "-m", "release candidate");

  const result = runPolicy(repository, {
    ref: "refs/tags/v0.2.0-rc.1",
    sha: older,
  });

  assert.notEqual(result.status, 0, output(result));
  assert.match(result.stderr, /peels to .* not GITHUB_SHA/);
});

test("an annotated tag on an older merged ancestor passes", (t) => {
  const { older, repository, tip } = repositoryFixture(t);
  git(repository, "tag", "-a", "v0.2.0-rc.1", "-m", "older merged candidate", older);

  const result = runPolicy(repository, {
    ref: "refs/tags/v0.2.0-rc.1",
    sha: older,
  });

  assert.equal(result.status, 0, output(result));
  assert.equal(git(repository, "rev-parse", REMOTE_MAIN_REF), tip);
});
