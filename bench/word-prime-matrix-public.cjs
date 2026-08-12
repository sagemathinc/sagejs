#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function main() {
  const samples = Number(process.env.SAGEJS_WORD_PRIME_MATRIX_SAMPLES || 5);
  const scale = Number(process.env.SAGEJS_WORD_PRIME_MATRIX_BUDGET_SCALE || 1);
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as runtime
from sagejs_serialization import dumps

_word_prime_field = GF(65537)
_word_prime_matrix = random_matrix(_word_prime_field, 300)
assert _word_prime_matrix._has_nmod_matrix_resource()

def _word_prime_time(operation):
    started = runtime.wall_time()
    result = operation()
    elapsed = (runtime.wall_time() - started) * 1000
    if hasattr(result, '_has_nmod_matrix_resource') and result._has_nmod_matrix_resource():
        result._nmod_storage_cache.resource.close()
    return elapsed

def _word_prime_random(): return random_matrix(_word_prime_field, 300)
def _word_prime_multiply(): return _word_prime_matrix * _word_prime_matrix
def _word_prime_rank():
    source = _word_prime_matrix.__copy__()
    try: return source.rank()
    finally: source._nmod_storage_cache.resource.close()
def _word_prime_rref():
    source = _word_prime_matrix.__copy__()
    result = source.rref()
    source._nmod_storage_cache.resource.close()
    return result
def _word_prime_format(): return _word_prime_matrix.str()
def _word_prime_serialize(): return dumps(_word_prime_matrix)
`);

    const cases = [
      ["random 300x300", "_word_prime_random", 25],
      ["multiply 300x300", "_word_prime_multiply", 100],
      ["rank 300x300", "_word_prime_rank", 35],
      ["RREF 300x300", "_word_prime_rref", 35],
      ["format 300x300", "_word_prime_format", 25],
      ["SagePack 300x300", "_word_prime_serialize", 25],
    ];
    const failures = [];
    console.log(`Word-prime FLINT resources (${samples} warm samples)`);
    for (const [label, functionName, budget] of cases) {
      await session.evaluate(`_word_prime_time(${functionName})`);
      const values = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const result = await session.evaluate(`_word_prime_time(${functionName})`);
        values.push(Number(result.repr));
      }
      const elapsed = median(values);
      const limit = budget * scale;
      console.log(`  ${label.padEnd(22)} ${elapsed.toFixed(2)} ms / ${limit.toFixed(2)} ms`);
      if (!(elapsed >= 0 && elapsed <= limit)) failures.push(label);
    }
    if (failures.length !== 0) {
      throw new Error(`word-prime matrix budget exceeded: ${failures.join(", ")}`);
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
