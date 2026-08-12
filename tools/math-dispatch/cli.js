"use strict";

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
// This file is copied to dist/tools/math-dispatch by TypeScript. The strict
// implementation remains repository data tooling rather than duplicated
// generated output.
const implementationRoot = require("node:path").join(
  __dirname, "..", "..", "..", "tools", "math-dispatch",
);
const { validateBenchmarkReport } = require(`${implementationRoot}/evidence.cjs`);
const { checkGenerated, loadRegistry, writeGenerated } = require(`${implementationRoot}/registry.cjs`);
const { selectImplementation, traceLine } = require(`${implementationRoot}/selector.cjs`);

function parseJson(value, label) {
  if (!value) return {};
  const text = value.startsWith("@") ? readFileSync(resolve(value.slice(1)), "utf8") : value;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} must be JSON or @FILE: ${error.message}`);
  }
}

function textDecision(decision) {
  const lines = [
    `${decision.family}.${decision.operation} -> ${decision.implementation}`,
    `  representation: ${decision.representation.id} (${decision.representation.reason})`,
    `  profile: ${decision.profile.id} [${decision.profile.origin}] ${decision.profile.fingerprint}`,
    `  rule: ${decision.rule?.id || "explicit override"}`,
    `  declaration: ${decision.declaration_fingerprint}`,
    `  profile set: ${decision.profile_set_fingerprint}`,
    "  candidates:",
  ];
  for (const candidate of decision.candidates) {
    lines.push(`    ${candidate.id}: ${candidate.available ? "available" : `rejected (${candidate.rejection_reasons.join("; ")})`}`);
    if (candidate.conversions.length > 0) lines.push(`      conversions: ${candidate.conversions.join(", ")}`);
  }
  if (decision.fallback_chain.length > 1) lines.push(`  fallback chain: ${decision.fallback_chain.join(" -> ")}`);
  for (const diagnostic of decision.profile.diagnostics) {
    lines.push(`  ignored local profile ${diagnostic.profile}: ${diagnostic.reasons.join("; ")}`);
  }
  return `${lines.join("\n")}\n`;
}

async function runMathDispatchCli(argv, basePath) {
  const [action = "check", subject, ...extra] = argv.files;
  if (extra.length > 0 || !["check", "emit-json", "evidence", "explain", "generate"].includes(action)) {
    throw new Error("usage: sagejs math <check|emit-json|evidence|explain|generate> [subject]");
  }
  const registry = await loadRegistry({ root: basePath });
  if (action === "generate") {
    for (const path of writeGenerated(registry)) process.stdout.write(`${path}\n`);
    return;
  }
  if (action === "check") {
    const generated = checkGenerated(registry);
    const report = {
      schema: "sagejs.math-dispatch/check-v1",
      families: [...registry.families.keys()].sort(),
      profiles: registry.profiles.map((item) => item.document.id),
      generated,
      identity: registry.identity,
    };
    process.stdout.write(argv.json ? `${JSON.stringify(report, null, 2)}\n` :
      `Checked ${report.families.length} dispatch family declaration(s), ` +
      `${report.profiles.length} profile(s), deterministic JSON, and strict selection schemas.\n`);
    return;
  }
  if (action === "emit-json") {
    if (!subject) throw new Error("sagejs math emit-json requires a family id or profiles");
    const document = subject === "profiles"
      ? registry.profileSetDocument : registry.families.get(subject)?.document;
    if (!document) throw new Error(`unknown dispatch declaration ${subject}`);
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return;
  }
  if (action === "evidence") {
    if (!subject) throw new Error("sagejs math evidence requires a report file");
    const accepted = validateBenchmarkReport(
      JSON.parse(readFileSync(resolve(subject), "utf8")), registry, { filename: subject },
    );
    process.stdout.write(argv.json ? `${JSON.stringify(accepted, null, 2)}\n` :
      `Accepted benchmark evidence ${accepted.fingerprint}.\n`);
    return;
  }
  if (!subject || !subject.includes(".")) {
    throw new Error("sagejs math explain requires FAMILY.OPERATION");
  }
  const split = subject.lastIndexOf(".");
  const decision = selectImplementation(registry, {
    family: subject.slice(0, split),
    operation: subject.slice(split + 1),
    features: parseJson(argv.features, "--features"),
    capabilities: (argv.capabilities || "").split(",").filter(Boolean),
    build: parseJson(argv.build, "--build"),
    algorithm: argv.algorithm || null,
  });
  process.stdout.write(argv.json ? `${JSON.stringify(decision, null, 2)}\n` : textDecision(decision));
  if (argv.trace) process.stderr.write(`${traceLine(decision)}\n`);
}

module.exports = { parseJson, runMathDispatchCli, textDecision };
