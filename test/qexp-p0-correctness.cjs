// sagejs-test-tier: integration
"use strict";

const test = require("node:test");

const {
  verifySagejsCorpus,
} = require("../bench/modular/qexp-correctness/sagejs-corpus.cjs");

test(
  "pinned q-expansion corpus agrees with SageMath and Magma",
  { timeout: 180_000 },
  async () => {
    await verifySagejsCorpus();
  },
);
