"use strict";

const { deepFreeze, fingerprint } = require("./common.cjs");

function dispatchRuntimeIdentity(registry) {
  return deepFreeze({
    schema: "sagejs.math-dispatch/runtime-identity-v1",
    family_fingerprints: registry.identity.family_fingerprints,
    profile_set_fingerprint: registry.identity.profile_set_fingerprint,
  });
}

function specializedDispatchInputs(decision) {
  return deepFreeze({
    schema: "sagejs.math-dispatch/specialization-inputs-v1",
    declaration_fingerprint: decision.declaration_fingerprint,
    profile_set_fingerprint: decision.profile_set_fingerprint,
    selected_profile_fingerprint: decision.profile.fingerprint,
    implementation: decision.implementation,
    fingerprint: fingerprint({
      declaration_fingerprint: decision.declaration_fingerprint,
      profile_set_fingerprint: decision.profile_set_fingerprint,
      selected_profile_fingerprint: decision.profile.fingerprint,
      implementation: decision.implementation,
    }),
  });
}

module.exports = { dispatchRuntimeIdentity, specializedDispatchInputs };
