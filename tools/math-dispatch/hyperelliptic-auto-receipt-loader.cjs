"use strict";

const path = require("node:path");

const policyApi = require("./hyperelliptic-auto-receipt-policy.cjs");

const POLICY_ENV = "SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY";
const ROOT_ENV = "SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_ROOT";
const trustedRuntimes = new WeakSet();

function checkedRoot(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("hyperelliptic receipt-policy root must be a nonempty path");
  }
  return path.resolve(value);
}

function installCheckedInAutoReceiptPolicy({
  root,
  target = globalThis,
  platform,
  environment = process.env,
} = {}) {
  if (target === null || (typeof target !== "object" && typeof target !== "function")) {
    throw new TypeError("hyperelliptic receipt-policy target must be an object");
  }
  if (Object.prototype.hasOwnProperty.call(target, policyApi.RUNTIME_GLOBAL)) {
    const existing = Reflect.get(target, policyApi.RUNTIME_GLOBAL);
    if (
      ((typeof existing === "object" && existing !== null) ||
        typeof existing === "function") &&
      trustedRuntimes.has(existing)
    ) return existing;
    throw new Error("hyperelliptic auto-receipt runtime existed before trusted startup");
  }
  const configured = environment[POLICY_ENV];
  if (configured === "off") return null;
  const resolvedRoot = checkedRoot(environment[ROOT_ENV] ?? root);
  const filename = path.resolve(
    resolvedRoot,
    configured || "architecture/hyperelliptic-auto-receipt-policy.json",
  );
  const raw = policyApi.readJson(filename);
  const verified = policyApi.verifyPolicy(raw, {
    root: resolvedRoot,
    sourceCommit: raw.enabled ? raw.source_bundle.source_commit : null,
  });
  const runtime = policyApi.installAutoReceiptPolicyRuntime(verified, {
    target,
    platform: platform ?? policyApi.hostPlatform(),
  });
  trustedRuntimes.add(runtime);
  return runtime;
}

module.exports = {
  POLICY_ENV,
  ROOT_ENV,
  installCheckedInAutoReceiptPolicy,
};
