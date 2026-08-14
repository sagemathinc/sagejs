#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");

const REMOTE_MAIN_REF = "refs/remotes/sagejs-release-policy/main";
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function git(args, { cwd = process.cwd(), allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `git ${args[0]} failed with exit ${result.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return {
    status: result.status,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
  };
}

function required(value, name) {
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function validateReleaseSource({
  eventName,
  refType,
  githubRef,
  githubSha,
  cwd = process.cwd(),
}) {
  if (eventName !== "push" || refType !== "tag") {
    return { checked: false };
  }

  const ref = required(githubRef, "GITHUB_REF");
  const sha = required(githubSha, "GITHUB_SHA").toLowerCase();
  if (!ref.startsWith("refs/tags/")) {
    throw new Error(`pushed tag has non-tag GITHUB_REF ${JSON.stringify(ref)}`);
  }
  if (!OBJECT_ID.test(sha)) {
    throw new Error(`invalid GITHUB_SHA ${JSON.stringify(githubSha)}`);
  }

  const refTypeResult = git(["cat-file", "-t", ref], { cwd });
  if (refTypeResult.stdout !== "tag") {
    throw new Error(
      `release ref ${ref} must be an annotated tag, got ${refTypeResult.stdout || "unknown"}`,
    );
  }

  const tagCommit = git(["rev-parse", "--verify", `${ref}^{commit}`], { cwd }).stdout;
  const workflowCommit = git(
    ["rev-parse", "--verify", `${sha}^{commit}`],
    { cwd },
  ).stdout;
  if (workflowCommit !== sha) {
    throw new Error(`GITHUB_SHA ${sha} does not name an exact commit object`);
  }
  if (tagCommit !== sha) {
    throw new Error(
      `release tag ${ref} peels to ${tagCommit}, not GITHUB_SHA ${sha}`,
    );
  }

  git(
    [
      "fetch",
      "--no-tags",
      "--force",
      "--no-write-fetch-head",
      "origin",
      `+refs/heads/main:${REMOTE_MAIN_REF}`,
    ],
    { cwd },
  );
  const mainCommit = git(
    ["rev-parse", "--verify", `${REMOTE_MAIN_REF}^{commit}`],
    { cwd },
  ).stdout;
  const ancestry = git(
    ["merge-base", "--is-ancestor", tagCommit, mainCommit],
    { cwd, allowFailure: true },
  );
  if (ancestry.status !== 0) {
    throw new Error(
      `release tag commit ${tagCommit} is not an ancestor of origin/main ${mainCommit}`,
    );
  }

  return { checked: true, mainCommit, tagCommit };
}

if (require.main === module) {
  try {
    const result = validateReleaseSource({
      eventName: process.env.EVENT_NAME,
      refType: process.env.REF_TYPE,
      githubRef: process.env.GITHUB_REF,
      githubSha: process.env.GITHUB_SHA,
    });
    if (result.checked) {
      process.stdout.write(
        `release source accepted: ${result.tagCommit} is reachable from origin/main ${result.mainCommit}\n`,
      );
    } else {
      process.stdout.write("release source policy is not applicable to this event\n");
    }
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { REMOTE_MAIN_REF, validateReleaseSource };
