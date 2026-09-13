#!/usr/bin/env node
"use strict";

// This verifies an operator-controlled persistent host's software signing key.
// It is intentionally not described as hardware or remote attestation: possession
// of this filesystem key authenticates the enrolled host/operator boundary only.

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  formattedJson,
  readJson,
  sha256,
  validateSelection,
} = require("./contracts.cjs");

const selectionPath = path.join(__dirname, "selection-v1.json");

function expectedPrivateKeyPath() {
  return path.join(os.homedir(), ".sagejs", "qualification", "nlopt-rsa.pem");
}

function verifyWindowsPrivateAcl(filename) {
  const command = "$acl = Get-Acl -LiteralPath $env:SAGEJS_OPERATOR_SIGNING_KEY; " +
    "$access = @($acl.Access | ForEach-Object { [PSCustomObject]@{ " +
    "Identity = $_.IdentityReference.Value; Rights = $_.FileSystemRights.ToString(); " +
    "Type = $_.AccessControlType.ToString() } }); " +
    "[PSCustomObject]@{ CurrentIdentity = " +
    "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name; Access = $access } | " +
    "ConvertTo-Json -Compress -Depth 4";
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command", command,
  ], {
    encoding: "utf8",
    env: { ...process.env, SAGEJS_OPERATOR_SIGNING_KEY: filename },
    timeout: 10_000,
  });
  if (result.error || result.status !== 0 || result.stdout.trim() === "") {
    throw new Error(
      `could not verify the Windows operator-signing private-key ACL: ${
        result.error?.message ?? result.stderr.trim() ?? "unknown error"
      }`,
    );
  }
  let acl;
  try { acl = JSON.parse(result.stdout); } catch {
    throw new Error("Windows operator-signing private-key ACL was not structured JSON");
  }
  const access = Array.isArray(acl.Access) ? acl.Access : [acl.Access];
  const localUser = String(acl.CurrentIdentity ?? "").toLowerCase();
  const required = new Set([
    "nt authority\\system", "builtin\\administrators", localUser,
  ]);
  const seen = new Set();
  for (const entry of access) {
    const identity = String(entry.Identity ?? "").toLowerCase();
    if (!required.has(identity) || entry.Type !== "Allow" || entry.Rights !== "FullControl") {
      throw new Error(
        `Windows operator-signing private-key ACL grants an unapproved entry ${identity}`,
      );
    }
    seen.add(identity);
  }
  if (seen.size !== required.size) {
    throw new Error("Windows operator-signing private-key ACL is missing a required owner entry");
  }
  return "windows-acl-system-administrators-owner-full-control-only";
}

function readPrivateKey(filename, { enforcePrivatePermissions = true } = {}) {
  const resolved = path.resolve(filename);
  const status = fs.lstatSync(resolved);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error("operator-signing private key must be a regular non-symbolic-link file");
  }
  let permissions = "not-checked";
  if (enforcePrivatePermissions) {
    if (process.platform === "win32") {
      permissions = verifyWindowsPrivateAcl(resolved);
    } else {
      if ((status.mode & 0o077) !== 0) {
        throw new Error(
          `operator-signing private key permissions must exclude group/other access; got ${(
            status.mode & 0o777
          ).toString(8).padStart(3, "0")}`,
        );
      }
      permissions = (status.mode & 0o777).toString(8).padStart(3, "0");
    }
  }
  return { bytes: fs.readFileSync(resolved), permissions, resolved };
}

function verifyPlatformEnrollment({
  selection,
  selectionSha256,
  platformId,
  privateKeyPath,
  requiredPrivateKeyPath = privateKeyPath,
  enforcePrivatePermissions,
}) {
  validateSelection(selection);
  const selected = selection.portable_platforms[platformId];
  if (selected === undefined) throw new Error(`unknown selected platform ${platformId}`);

  const resolvedPrivateKeyPath = path.resolve(privateKeyPath);
  const resolvedRequiredPath = path.resolve(requiredPrivateKeyPath);
  if (resolvedPrivateKeyPath !== resolvedRequiredPath) {
    throw new Error(
      `operator-signing private key must use the enrolled path ${resolvedRequiredPath}`,
    );
  }

  const keyFile = readPrivateKey(resolvedPrivateKeyPath, { enforcePrivatePermissions });
  let privateKey;
  try {
    privateKey = crypto.createPrivateKey(keyFile.bytes);
  } catch {
    throw new Error("operator-signing private key is not a valid private key");
  }
  const publicKey = crypto.createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeySpkiSha256 = sha256(publicKey.export({ type: "spki", format: "der" }));
  const expected = selected.operator_signing;
  if (publicKey.asymmetricKeyType !== "rsa" ||
      publicKey.asymmetricKeyDetails?.modulusLength < 3072 ||
      publicKeySpkiSha256 !== expected.public_key_spki_sha256 ||
      publicKeyPem !== expected.public_key_pem) {
    throw new Error(
      `${platformId} installed private key does not derive the selected operator-signing public key`,
    );
  }
  return {
    schema: "sagejs.numerical-nlopt-platform-enrollment-verification/v1",
    platform_id: platformId,
    host_alias: selected.host_alias,
    selection_sha256: selectionSha256,
    operator_signing: {
      model: "operator-controlled-persistent-host-software-key",
      algorithm: expected.algorithm,
      public_key_spki_sha256: publicKeySpkiSha256,
      private_key_path: resolvedPrivateKeyPath,
      private_key_permissions: keyFile.permissions,
    },
    status: "verified",
  };
}

function usage() {
  return `Usage: node ${path.relative(process.cwd(), __filename)} --platform-id ID

Derives the public key directly from the private key at:
  ${expectedPrivateKeyPath()}

and verifies it against the source-current selection. This proves possession of
the enrolled operator-controlled host key; it is not hardware/remote attestation.
`;
}

function parseArguments(argv) {
  const options = { platformId: null, help: false };
  for (let index = 0; index < argv.length; ++index) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--platform-id") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--platform-id requires a value");
      if (options.platformId !== null) throw new Error("--platform-id may appear only once");
      options.platformId = value;
    } else throw new Error(`unknown argument ${argument}`);
  }
  if (!options.help && options.platformId === null) {
    throw new Error("--platform-id is required");
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const selectionRecord = readJson(selectionPath, "qualification selection");
  const privateKeyPath = expectedPrivateKeyPath();
  const result = verifyPlatformEnrollment({
    selection: selectionRecord.value,
    selectionSha256: selectionRecord.sha256,
    platformId: options.platformId,
    privateKeyPath,
    requiredPrivateKeyPath: privateKeyPath,
  });
  process.stdout.write(formattedJson(result));
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { expectedPrivateKeyPath, parseArguments, verifyPlatformEnrollment };
