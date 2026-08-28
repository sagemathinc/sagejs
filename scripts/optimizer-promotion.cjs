#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  createPromotionReceipt,
  defaultPromotionPolicy,
  validatePromotionReceipt,
  validateBrowserReceipt,
} = require("../tools/optimizer-development/promotion.cjs");
const {
  SCHEMAS,
  validateBySchema,
} = require("../tools/optimizer-development/schemas.cjs");
const {
  canonicalCompilerIdentity,
} = require("../tools/optimizer-development/identity.cjs");
const { sha256 } = require("../tools/optimizer-development/common.cjs");
const {
  inspectBuildReceipt,
  receiptRelativePath,
  workspaceFingerprint,
} = require("./build-receipt.cjs");
const {
  validateProductionReceipt,
} = require("../packages/flint-wasm/scripts/production-receipt.cjs");

const repositoryRoot = path.resolve(__dirname, "..");

function git(args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function currentCheckout(candidateRevision = null) {
  const local = {
    commit: git(["rev-parse", "HEAD"]),
    tree: git(["rev-parse", "HEAD^{tree}"]),
    workspaceId: workspaceFingerprint(repositoryRoot),
    clean: git(["status", "--porcelain=v1", "--untracked-files=all"]) === "",
  };
  if (candidateRevision === null) return local;
  return {
    ...candidateRevision,
    ...local,
  };
}

function digestPath(filename, root = filename) {
  const hash = createHash("sha256");
  function visit(current) {
    const status = fs.lstatSync(current);
    const relative = path.relative(root, current).replaceAll("\\", "/") || ".";
    hash.update(relative);
    hash.update("\0");
    if (status.isDirectory()) {
      hash.update("directory\0");
      for (const name of fs.readdirSync(current).sort()) visit(path.join(current, name));
    } else if (status.isFile()) {
      hash.update("file\0");
      hash.update(fs.readFileSync(current));
      hash.update("\0");
    } else {
      throw new Error(`build output witness is not a regular file or directory: ${current}`);
    }
  }
  visit(filename);
  return hash.digest("hex");
}

function currentBuildBinding() {
  const status = inspectBuildReceipt(repositoryRoot);
  if (!status.current) return { available: false, reason: status.reason };
  const filename = path.join(repositoryRoot, receiptRelativePath);
  const receiptBytes = fs.readFileSync(filename);
  const receipt = JSON.parse(receiptBytes);
  const outputs = receipt.outputs.map((name) => ({
    path: name,
    digest: digestPath(path.join(repositoryRoot, name)),
  }));
  return {
    available: true,
    value: {
      workspaceId: workspaceFingerprint(repositoryRoot),
      receiptDigest: createHash("sha256").update(receiptBytes).digest("hex"),
      outputsDigest: createHash("sha256").update(canonicalJson(outputs)).digest("hex"),
    },
  };
}

function currentArtifactBinding() {
  const packageRoot = path.join(repositoryRoot, "packages", "flint-wasm");
  const outputDirectory = path.join(packageRoot, "dist");
  const result = validateProductionReceipt({ packageRoot, outputDirectory });
  if (!result.valid) return { available: false, reason: result.reason };
  const receiptFilename = path.join(outputDirectory, "build-receipt.json");
  return {
    available: true,
    value: {
      id: result.identity,
      sourceCommit: result.receipt.source.gitCommit,
      sourceClosureId: `sha256:${result.receipt.source.closure.sha256}`,
      manifestDigest: result.receipt.productionManifestSha256,
      receiptDigest: createHash("sha256").update(fs.readFileSync(receiptFilename)).digest("hex"),
    },
  };
}

function options(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
      values.push(argv[index + 1]);
    }
  }
  return values;
}

function verifyCurrentProfile(profile) {
  for (const file of profile.sourceBundle.files) {
    const filename = path.join(repositoryRoot, file.path);
    const bytes = fs.readFileSync(filename);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.digest) {
      throw new Error(`candidate profile source bundle is stale at ${file.path}`);
    }
  }
  const { optimizerCatalog } = require(
    "../dist/tools/python/optimizer/catalog.js"
  );
  const compiler = canonicalCompilerIdentity({
    root: repositoryRoot,
    irSchema: profile.compiler.irSchema,
    optimizerCatalog,
    optionsDigest: profile.compiler.optionsDigest,
  });
  if (compiler.id !== profile.compiler.id) {
    throw new Error(
      `candidate profile compiler is stale: expected ${compiler.id}; got ${profile.compiler.id}`,
    );
  }
}

function validatedInputsFromSpecifications(specifications, checkout) {
  if (specifications.length === 0) return undefined;
  const fields = [
    "campaignIds", "sourceBundleIds", "compilerIds", "artifactIds", "profileIds",
    "workloadIds", "correctnessEvidenceIds", "adversarialEvidenceIds", "routeEvidenceIds",
    "resourceEvidenceIds", "platformEvidenceIds", "neighboringWorkloadIds",
    "losingCandidateEvidenceIds", "dashboardIds", "compilerDecisionIds",
  ];
  const result = Object.fromEntries(fields.map((field) => [field, []]));
  const evidenceCategories = {
    correctness: "correctnessEvidenceIds",
    adversarial: "adversarialEvidenceIds",
    route: "routeEvidenceIds",
    resource: "resourceEvidenceIds",
    platform: "platformEvidenceIds",
    "losing-candidate": "losingCandidateEvidenceIds",
  };
  function add(field, ...ids) {
    result[field].push(...ids);
  }
  for (const specification of specifications) {
    const separator = specification.indexOf("=");
    if (separator <= 0 || separator === specification.length - 1) {
      throw new Error("--validated-input must be CATEGORY=FILE");
    }
    const category = specification.slice(0, separator);
    const document = readJson(specification.slice(separator + 1));
    let validated;
    if (document.schema === "sagejs.optimizer-browser-receipt/v1") {
      validated = validateBrowserReceipt(document, {
        current_checkout: {
          commit: checkout.commit,
          tree: checkout.tree,
          workspace_id: `sha256:${checkout.workspaceId}`,
          clean: checkout.clean,
        },
      }).receipt;
    } else {
      validated = validateBySchema(document);
    }
    if (category === "campaign") {
      if (validated.schema !== SCHEMAS.campaign) throw new Error("campaign input has wrong schema");
      add("campaignIds", validated.id);
    } else if (category === "workload" || category === "neighboring-workload") {
      if (validated.schema !== SCHEMAS.workload) throw new Error(`${category} input has wrong schema`);
      add(category === "workload" ? "workloadIds" : "neighboringWorkloadIds", validated.id);
    } else if (category === "candidate-profile" || category === "baseline-profile") {
      if (validated.schema !== SCHEMAS.profile) throw new Error(`${category} input has wrong schema`);
      if (category === "candidate-profile") verifyCurrentProfile(validated);
      add("profileIds", validated.id);
      add("workloadIds", validated.workload.id);
      add("sourceBundleIds", validated.sourceBundle.id);
      add("compilerIds", validated.compiler.id);
      add("artifactIds", validated.artifact.id);
    } else if (category === "dossier") {
      if (validated.schema !== SCHEMAS.dossier) throw new Error("dossier input has wrong schema");
      add("dashboardIds", validated.evidence.dashboardId);
      add("compilerDecisionIds", validated.currentIr.decisionId);
      add("profileIds", ...validated.evidence.profileIds);
    } else if (Object.hasOwn(evidenceCategories, category)) {
      add(evidenceCategories[category], validated.id);
    } else if (category === "artifact" &&
        validated.schema === "sagejs.optimizer-browser-receipt/v1") {
      add("artifactIds", validated.artifact.id);
    } else {
      throw new Error(`unsupported --validated-input category ${category}`);
    }
  }
  return Object.fromEntries(Object.entries(result).map(([field, ids]) => [
    field,
    [...new Set(ids)].sort(),
  ]));
}

function localContext(browserFilenames = [], candidateRevision = null,
  validatedInputSpecifications = []) {
  const localCheckout = currentCheckout();
  const build = currentBuildBinding();
  const artifact = currentArtifactBinding();
  const browserReceipts = browserFilenames.map((filename) => {
    const receipt = readJson(filename);
    return validateBrowserReceipt(receipt, {
      current_checkout: {
        commit: localCheckout.commit,
        tree: localCheckout.tree,
        workspace_id: `sha256:${localCheckout.workspaceId}`,
        clean: localCheckout.clean,
      },
    }).receipt;
  });
  const validatedInputs = validatedInputsFromSpecifications(
    validatedInputSpecifications,
    localCheckout,
  );
  return {
    context: {
      ...(candidateRevision === null
        ? {}
        : { currentCheckout: currentCheckout(candidateRevision) }),
      ...(build.available ? { currentBuild: build.value } : {}),
      ...(artifact.available ? { currentArtifact: artifact.value } : {}),
      validatedBrowserReceiptIds: browserReceipts.map((receipt) => receipt.id),
      ...(validatedInputs === undefined ? {} : { validatedInputs }),
    },
    availability: {
      candidateRevision: candidateRevision === null
        ? "unavailable: validated candidate revision was not supplied"
        : "available",
      build: build.available ? "available" : build.reason,
      artifact: artifact.available ? "available" : artifact.reason,
    },
  };
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.resolve(filename), "utf8"));
}

function pretty(value) {
  return `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  if (index + 1 >= args.length) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

function usage() {
  return `usage:
  optimizer-promotion.cjs current-binding [--json]
  optimizer-promotion.cjs create --evidence FILE --output FILE [--policy FILE]
      [--browser-receipt FILE ...]
      [--validated-input CATEGORY=FILE ...]
  optimizer-promotion.cjs validate FILE [--json] [--historical]
      [--browser-receipt FILE ...]
      [--validated-input CATEGORY=FILE ...]

create and validate bind to the exact checkout, authenticated build and Wasm
artifact when current, plus each independently validated browser receipt.
Validated inputs are accepted only as documents that pass their executable
schema validator; CATEGORY selects their reviewed role in the promotion.
--historical omits those authorities and therefore only validates an already
inconclusive historical decision.
`;
}

function main(argv = process.argv.slice(2)) {
  const [command, positional] = argv;
  if (command === "current-binding") {
    const local = localContext(
      options(argv, "--browser-receipt"),
      null,
      options(argv, "--validated-input"),
    );
    process.stdout.write(argv.includes("--json") ? pretty(local) :
      `${currentCheckout().commit} ${currentCheckout().workspaceId} ` +
      `clean=${currentCheckout().clean} build=${local.availability.build} ` +
      `artifact=${local.availability.artifact}\n`);
    return 0;
  }
  if (command === "create") {
    const evidenceFilename = option(argv, "--evidence");
    const outputFilename = option(argv, "--output");
    if (!evidenceFilename || !outputFilename) throw new Error(usage());
    const policyFilename = option(argv, "--policy");
    const evidenceDocument = readJson(evidenceFilename);
    const draft = evidenceDocument.draft ?? evidenceDocument;
    const policy = policyFilename
      ? readJson(policyFilename)
      : draft.policy ?? defaultPromotionPolicy();
    const local = localContext(
      options(argv, "--browser-receipt"),
      draft.candidate,
      options(argv, "--validated-input"),
    );
    const receipt = createPromotionReceipt({ ...draft, policy }, local.context);
    fs.writeFileSync(path.resolve(outputFilename), pretty(receipt));
    process.stdout.write(`${receipt.decision.status}: ${receipt.id}\n`);
    return receipt.decision.status === "accepted" ? 0 :
      receipt.decision.status === "inconclusive" ? 2 : 1;
  }
  if (command === "validate") {
    if (!positional || positional.startsWith("--")) throw new Error(usage());
    const receipt = readJson(positional);
    const context = argv.includes("--historical")
      ? {}
      : localContext(
        options(argv, "--browser-receipt"),
        receipt.candidate,
        options(argv, "--validated-input"),
      ).context;
    const result = validatePromotionReceipt(receipt, context);
    if (argv.includes("--json")) process.stdout.write(pretty({
      valid: true,
      id: result.id,
      decision: result.decision,
    }));
    else process.stdout.write(
      `${result.decision.status}: ${result.id}` +
      (result.decision.reasons.length ? ` (${result.decision.reasons.join(", ")})` : "") + "\n",
    );
    return result.decision.status === "accepted" ? 0 :
      result.decision.status === "inconclusive" ? 2 : 1;
  }
  throw new Error(usage());
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  currentArtifactBinding,
  currentBuildBinding,
  currentCheckout,
  digestPath,
  localContext,
  main,
  pretty,
  validatedInputsFromSpecifications,
  verifyCurrentProfile,
};
