#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: false
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "../../..");
const bundle = JSON.parse(readFileSync(
  join(root, "website/numerical-computing/evidence.json"),
  "utf8",
));

test(
  "every public example executes independently in a fresh Sage.js cell",
  { timeout: 120_000 },
  async () => {
    const { createSage } = require(join(root, "dist/tools/kernel.js"));
    const session = await createSage();
    try {
      for (let index = 0; index < bundle.stories.length; index += 1) {
        if (index > 0) await session.reset();
        const story = bundle.stories[index];
        let displayed;
        try {
          displayed = await session.evaluate(story.canonical_python, {
            timeout: 30_000,
          });
        } catch (error) {
          error.message = `${story.id}: ${error.message}`;
          throw error;
        }
        assert.notEqual(
          displayed.repr,
          "undefined",
          `${story.id} displayed undefined`,
        );
        assert.equal(
          (await session.evaluate("result.success")).repr,
          "True",
          `${story.id} did not produce a successful result`,
        );
      }
    } finally {
      await session.close().catch(() => {});
    }
  },
);
