"use strict";

const { createHash } = require("node:crypto");
const { generateHostCore, NATIVE_ABI_VERSION } = require("./c-backend.cjs");
const { HOST_ABI_VERSION } = require("./core-abi.cjs");

const PORTABLE_IDENTITY_SCHEMA = "sagejs.native-portable-kernel/v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function tupleElementTypes(type) {
  const match = /^Tuple\[(.*)\]$/.exec(type);
  return match === null ? null : match[1].split(",");
}

function functionAbi(fn) {
  return {
    name: fn.name,
    kernelKind: fn.kernelKind,
    parameters: fn.params.map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
    })),
    returnType: fn.returnType,
    results: tupleElementTypes(fn.returnType) ?? [fn.returnType],
    foreignDependencies: [...(fn.foreignDependencies ?? [])].sort(),
    foreignResources: [...(fn.foreignResources ?? [])].sort(),
  };
}

function portableKernelIdentity({ ir, sourceHash, logicalSource }) {
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) {
    throw new TypeError(`invalid portable kernel source hash ${sourceHash}`);
  }
  const canonicalCore = generateHostCore(ir);
  const foreignDeclarations = (ir.foreignLibraries ?? [])
    .map((library) => ({
      id: library.id,
      declarationHash: library.declarationHash,
      declarationIdentity: library.declarationIdentity,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const abi = {
    schema: "sagejs.native-portable-abi/v1",
    nativeAbi: NATIVE_ABI_VERSION,
    hostAbi: HOST_ABI_VERSION,
    irVersion: ir.version,
    records: (ir.records ?? []).map((record) => ({
      name: record.name,
      fields: record.fields.map((field) => ({
        name: field.name,
        type: field.type,
      })),
    })),
    functions: ir.functions.map(functionAbi),
    foreignDeclarations,
  };
  const abiHash = sha256(JSON.stringify(abi));
  const functionDeclarations = Object.fromEntries(abi.functions.map((fn) => [
    fn.name,
    sha256(JSON.stringify(fn)),
  ]));
  const coreHash = sha256(canonicalCore.source);
  const oracleIdentity = sha256(JSON.stringify({
    logicalSource,
    sourceHash,
    functions: ir.functions.map((fn) => ({
      name: fn.name,
      start: fn.provenance?.start?.offset,
      end: fn.provenance?.end?.offset,
    })),
  }));
  const identity = {
    schema: PORTABLE_IDENTITY_SCHEMA,
    logicalSource,
    sourceHash,
    abiHash,
    coreHash,
    oracleIdentity,
    foreignDeclarations,
  };
  const identityHash = sha256(JSON.stringify(identity));
  return Object.freeze({
    ...identity,
    identityHash,
    moduleIdentity: identityHash.slice(0, 16),
    abi,
    functionDeclarations,
    canonicalCore,
  });
}

module.exports = {
  PORTABLE_IDENTITY_SCHEMA,
  functionAbi,
  portableKernelIdentity,
  sha256,
  tupleElementTypes,
};
