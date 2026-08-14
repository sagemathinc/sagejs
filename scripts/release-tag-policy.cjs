#!/usr/bin/env node
"use strict";

const { version } = require("../package.json");

const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;
const RELEASE_CANDIDATE =
  /^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)-rc\.([1-9][0-9]*)$/;

function classifyReleaseEvent({ eventName, refName, refType, releaseVersion }) {
  if (!VERSION.test(releaseVersion || "")) {
    throw new Error(`invalid package release version ${JSON.stringify(releaseVersion)}`);
  }
  if (eventName !== "push" || refType !== "tag") {
    return { candidate: false, publish: false };
  }
  const releaseTag = `v${releaseVersion}`;
  if (refName === releaseTag) return { candidate: true, publish: true };
  if (
    RELEASE_CANDIDATE.test(refName || "") &&
    refName.replace(/-rc\.[1-9][0-9]*$/, "") === releaseTag
  ) {
    return { candidate: true, publish: false };
  }
  throw new Error(
    `unsupported Sage.js tag ${refName}; expected ${releaseTag} or ${releaseTag}-rc.N`,
  );
}

if (require.main === module) {
  try {
    const policy = classifyReleaseEvent({
      eventName: process.env.EVENT_NAME,
      refName: process.env.REF_NAME,
      refType: process.env.REF_TYPE,
      releaseVersion: version,
    });
    process.stdout.write(`candidate=${policy.candidate}\npublish=${policy.publish}\n`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { classifyReleaseEvent };
