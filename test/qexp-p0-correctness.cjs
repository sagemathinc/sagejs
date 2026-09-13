// sagejs-test-tier: integration
"use strict";

const test = require("node:test");

const {
  verifySagejsCorpus,
} = require("../bench/modular/qexp-correctness/sagejs-corpus.cjs");

test(
  "pinned q-expansion corpus agrees with SageMath, Magma, and PARI",
  { timeout: 180_000 },
  async () => {
    await verifySagejsCorpus();
  },
);
