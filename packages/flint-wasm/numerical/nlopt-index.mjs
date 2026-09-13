import productionManifest from "../../../src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json" with { type: "json" };

export {
  createNloptBackend,
  createNloptBackendSync,
  NloptCapabilityError,
} from "../../../src/lib/sagejs/numerics/optimization/backends/nlopt/index.mjs";

export const nloptArtifactReceipt = Object.freeze({
  schema: "sagejs.wasm-artifact-integrity/v1",
  algorithm: "sha256",
  filename: productionManifest.artifact.filename,
  bytes: productionManifest.artifact.bytes,
  sha256: productionManifest.artifact.sha256,
});
