#!/usr/bin/env node
"use strict";

const productTagPattern = /^v(\d+)\.(\d+)\.(\d+)(?:\+release\.(\d+))?$/;

function parseProductTag(tagName) {
  const match = productTagPattern.exec(tagName);
  if (match === null) return undefined;
  return {
    candidate: match[4] === undefined ? undefined : Number(match[4]),
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    tagName,
  };
}

function compareProductTags(left, right) {
  for (const field of ["major", "minor", "patch"]) {
    const difference = left[field] - right[field];
    if (difference !== 0) return difference;
  }
  if (left.candidate === undefined && right.candidate !== undefined) return 1;
  if (left.candidate !== undefined && right.candidate === undefined) return -1;
  if (left.candidate !== undefined) {
    const candidateDifference = left.candidate - right.candidate;
    if (candidateDifference !== 0) return candidateDifference;
  }
  return left.tagName.localeCompare(right.tagName);
}

function selectLatestProductRelease(releases) {
  const candidates = releases
    .flat(Infinity)
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => parseProductTag(release.tag_name))
    .filter((release) => release !== undefined)
    .sort(compareProductTags);
  return candidates.at(-1)?.tagName;
}

async function selectLatestProductReleaseFromGitHub(
  repository,
  token,
  fetchImplementation = fetch,
) {
  const releases = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchImplementation(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "sagejs-release-policy",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub release query failed on page ${page}: HTTP ${response.status}`,
      );
    }
    const pageReleases = await response.json();
    releases.push(...pageReleases);
    if (pageReleases.length < 100) break;
  }
  return selectLatestProductRelease(releases);
}

async function readStandardInput() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const repositoryIndex = process.argv.indexOf("--repository");
  let release;
  if (repositoryIndex !== -1) {
    const repository = process.argv[repositoryIndex + 1];
    const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    if (!repository || !token) {
      throw new Error("--repository and GH_TOKEN are required");
    }
    release = await selectLatestProductReleaseFromGitHub(repository, token);
  } else {
    const input = await readStandardInput();
    release = selectLatestProductRelease(JSON.parse(input));
  }
  if (release === undefined) {
    throw new Error("no published Sage.js product release was found");
  }
  process.stdout.write(`${release}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseProductTag,
  selectLatestProductRelease,
  selectLatestProductReleaseFromGitHub,
};
