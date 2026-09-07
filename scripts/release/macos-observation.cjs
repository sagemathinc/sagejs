"use strict";

const { verifyControlArtifact, readJsonZip } = require("./control-artifact.cjs");
const { validateRequest } = require("./macos-installer.cjs");
const { identity } = require("./artifact-set.cjs");
const checks = ["trusted-installer-identity", "gatekeeper-install", "stapled-notarization", "package-metadata", "exact-payload", "developer-id-executable-signatures"];
const contract = Object.freeze({ workflow: ".github/workflows/release-macos-inspection.yml", jobName: "Inspect selected macOS installer v1",
  requiredSteps: ["Inspect exact selected macOS artifact", "Retain native inspection"], artifactPrefix: "sagejs-macos-inspection-attempt-" });

// expected.request must come from independent full publication preparation;
// expected team and verifier digest come from reviewed control policy. A caller
// cannot derive any of those expectations from the observation being accepted.
function authenticateMacosObservation(options, expected, api) {
  const selected = structuredClone(validateRequest(expected?.request));
  if (!/^[A-Z0-9]{10}$/.test(expected.teamId ?? "") || !/^[a-f0-9]{64}$/.test(expected.verifierSha256 ?? "")) throw new Error("independent macOS signer/verifier policy required");
  const accepted = verifyControlArtifact(options, contract, (bytes) => {
    const observation = readJsonZip(bytes, "macos-observation.json");
    if (observation?.schema !== "sagejs.macos-installer-observation/v1" || observation.status !== "passed" ||
        observation.teamId !== expected.teamId || observation.verifierSha256 !== expected.verifierSha256 ||
        observation.host?.platform !== "darwin" || !/^\d+\.\d+(?:\.\d+)?$/.test(observation.host.version ?? "") ||
        identity(validateRequest(observation.request)) !== identity(selected) ||
        !Array.isArray(observation.checks) || observation.checks.length !== checks.length ||
        checks.some((check) => observation.checks.filter((item) => item === check).length !== 1)) throw new Error("native macOS observation differs from selected product or required policy/checks");
    return observation;
  }, api);
  return { observation: accepted.value, authentication: { schema: "sagejs.macos-observation-authentication/v1", ...accepted.authentication,
    manifestDigest: selected.productIdentity.manifestDigest, installerSha256: selected.installer.sha256,
    authority: "authenticated macOS installer observation only; full selected-product acceptance and promotion policy still required" } };
}
module.exports = { authenticateMacosObservation, contract, checks };
