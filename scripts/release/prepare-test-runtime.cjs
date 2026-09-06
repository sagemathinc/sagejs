"use strict";

// The benchmark helper validates an empty, regular history file. Prepare it
// before tests freeze dist; creating it during a test is an input mutation.
require("../../bench/class-unit-groups/run-complex-cubic-frontier.cjs")
  .prepareCandidateDirectEnvironment();
