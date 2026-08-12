"use strict";

const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { basename, dirname, join, relative, resolve } = require("node:path");
const { canonicalJson, deepFreeze, fingerprint } = require("./common.cjs");
const {
  parseDispatchSource,
  validateParsedFamily,
  validateParsedProfile,
} = require("./source-declarations.cjs");

const PROFILE_SET_SCHEMA = "sagejs.math-dispatch/profile-set-v1";

function sourceFiles(root) {
  const dispatch = join(root, "dispatch");
  const profiles = join(dispatch, "profiles");
  const families = existsSync(dispatch) ? readdirSync(dispatch)
    .filter((name) => name.endsWith(".dispatch.py"))
    .sort().map((name) => join(dispatch, name)) : [];
  const profileFiles = existsSync(profiles) ? readdirSync(profiles)
    .filter((name) => name.endsWith(".dispatch.py"))
    .sort().map((name) => join(profiles, name)) : [];
  return { families, profiles: profileFiles };
}

function familyGeneratedPath(root, parsed) {
  return join(root, "dispatch", "generated", basename(parsed.filename).replace(/\.py$/, ".json"));
}

function profileGeneratedPath(root) {
  return join(root, "dispatch", "generated", "profiles.dispatch.json");
}

async function loadRegistry(options = {}) {
  const root = resolve(options.root || join(__dirname, "..", ".."));
  const files = options.files || sourceFiles(root);
  const parsedFamilies = [];
  for (const filename of [...files.families].sort()) {
    parsedFamilies.push(await parseDispatchSource(filename, { root }));
  }
  const families = new Map();
  const familySources = new Map();
  for (const parsed of parsedFamilies) {
    if (parsed.kind !== "family") throw new Error(`${parsed.logicalFilename} must declare a family`);
    const family = validateParsedFamily(parsed);
    if (families.has(family.document.id)) throw new Error(`duplicate dispatch family ${family.document.id}`);
    families.set(family.document.id, family);
    familySources.set(family.document.id, parsed);
  }
  const parsedProfiles = [];
  for (const filename of [...files.profiles].sort()) {
    parsedProfiles.push(await parseDispatchSource(filename, { root }));
  }
  const profiles = [];
  const profileIds = new Set();
  for (const parsed of parsedProfiles) {
    if (parsed.kind !== "profile") throw new Error(`${parsed.logicalFilename} must declare a profile`);
    const profile = validateParsedProfile(parsed, families);
    if (profileIds.has(profile.document.id)) throw new Error(`duplicate dispatch profile ${profile.document.id}`);
    profileIds.add(profile.document.id);
    profiles.push(profile);
  }
  const portable = profiles.filter((profile) => profile.document.kind === "portable");
  if (portable.length !== 1) throw new Error(`dispatch registry requires exactly one portable profile; found ${portable.length}`);
  const profileSetDocument = deepFreeze({
    schema: PROFILE_SET_SCHEMA,
    schema_version: 1,
    profiles: profiles.map((profile) => profile.document),
  });
  const identity = deepFreeze({
    family_fingerprints: Object.fromEntries([...families.entries()].sort()
      .map(([id, family]) => [id, family.fingerprint])),
    profile_set_fingerprint: fingerprint(profileSetDocument),
  });
  return deepFreeze({
    root,
    files,
    families,
    familySources,
    profiles: Object.freeze(profiles),
    parsedProfiles: Object.freeze(parsedProfiles),
    profileSetDocument,
    identity,
  });
}

function generatedDocuments(registry) {
  const documents = [];
  for (const [id, family] of [...registry.families.entries()].sort()) {
    documents.push({
      id,
      filename: familyGeneratedPath(registry.root, registry.familySources.get(id)),
      text: canonicalJson(family.document),
    });
  }
  documents.push({
    id: "profiles",
    filename: profileGeneratedPath(registry.root),
    text: canonicalJson(registry.profileSetDocument),
  });
  return documents;
}

function checkGenerated(registry) {
  const reports = [];
  for (const generated of generatedDocuments(registry)) {
    const actual = existsSync(generated.filename) ? readFileSync(generated.filename, "utf8") : null;
    reports.push({
      id: generated.id,
      path: relative(registry.root, generated.filename),
      matches: actual === generated.text,
      missing: actual === null,
    });
  }
  const failed = reports.filter((report) => !report.matches);
  if (failed.length > 0) {
    throw new Error(
      `stale mathematical dispatch JSON: ${failed.map((item) => item.path).join(", ")}; ` +
      "run sagejs math generate",
    );
  }
  return reports;
}

function writeGenerated(registry) {
  const paths = [];
  for (const generated of generatedDocuments(registry)) {
    mkdirSync(dirname(generated.filename), { recursive: true });
    writeFileSync(generated.filename, generated.text);
    paths.push(relative(registry.root, generated.filename));
  }
  return paths;
}

module.exports = {
  PROFILE_SET_SCHEMA,
  checkGenerated,
  generatedDocuments,
  loadRegistry,
  sourceFiles,
  writeGenerated,
};
