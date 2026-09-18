#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const authentication = require("./prepared_nf_authentication.cjs");
const sage = require("./row16_phase6_sage_prepared_adapter.cjs");
const pari = require("./row16_phase6_pari_prepared_adapter.cjs");

async function main() {
  const prepared=JSON.parse(fs.readFileSync(sage.DEFAULT_INPUT,"utf8"));
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,sage.AUTHORITY);
  const changed=structuredClone(prepared); changed.prep_polynomial[0]=
    String(BigInt(changed.prep_polynomial[0])+1n);
  assert.throws(()=>authentication.authenticatePreparedNf(changed));
  const client=new pari.Client(); const ready=await client.ready(); let reference;
  try { reference=await client.run("1"); } finally { await client.close(); }
  const resident=await sage.prepareResident();
  const first=sage.runResident(resident), second=sage.runResident(resident);
  assert.deepEqual(first.projection,pari.commonProjection(reference));
  assert.deepEqual(second.projection,first.projection);
  assert(BigInt(first.kernelNanoseconds)>0n && BigInt(second.kernelNanoseconds)>0n);
  assert.equal(first.boundary.subprocessInsideClock,false);
  const forged=structuredClone(first.projection); forged.classGroup.classNumber="26";
  assert.notDeepEqual(forged,pari.commonProjection(reference));
  process.stdout.write(`${JSON.stringify({
    schema:"sagejs.pari-class-group/row16-phase6-matched-prepared-check-v1",
    preparedAuthoritySha256:sage.AUTHORITY,preparationNanoseconds:ready.preparationNanoseconds,
    sageKernelNanoseconds:[first.kernelNanoseconds,second.kernelNanoseconds],
    sageResetNanoseconds:[first.resetNanoseconds,second.resetNanoseconds],
    pariKernelNanoseconds:reference.kernelNanoseconds,
    commonProjection:first.projection,boundary:first.boundary,
    freshInputAuthenticated:true,changedPreparedInputRejected:true,
    semanticMutationRejected:true,residentStorageReuse:true,
    qualifiedTiming:false,ratioPublished:false,
    reason:"correct single-process matched-boundary check; no quiet alternating campaign run",
  },null,2)}\n`);
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
