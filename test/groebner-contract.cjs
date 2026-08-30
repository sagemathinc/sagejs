// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const moduleRoot = path.join(root, "src", "lib");
const contractProgram = String.raw`
import json
import sys
sys.path.insert(0, ${JSON.stringify(moduleRoot)})
from sagejs.polynomial_algorithms.groebner_contract import *

def p(*terms):
    return tuple(terms)

prime = GroebnerRing(2, "degrevlex", 5)
generators = (
    p((1, (2, 0)), (-1, (0, 1))),
    p((1, (1, 1)), (-1, (0, 0))),
)
basis, transform = groebner_basis_reference(generators, prime)
proof = verify_groebner_certificate(generators, basis, transform, prime)
assert proof.valid, proof.descriptor()
assert all(not normal_form(value, basis, prime) for value in generators)
assert leading_ideal(basis, prime) == tuple(value[0][1] for value in basis)

rational = GroebnerRing(2, "degrevlex", 0)
generators_q = (
    p(((1, 2), (2, 0)), ((1, 3), (0, 1))),
    p(((2, 5), (1, 1)), ((-1, 7), (0, 0))),
)
basis_q, transform_q = groebner_basis_reference(generators_q, rational)
proof_q = verify_groebner_certificate(
    generators_q, basis_q, transform_q, rational
)
assert proof_q.valid, proof_q.descriptor()

zero_basis, zero_transform = groebner_basis_reference((tuple(), tuple()), prime)
assert zero_basis == tuple() and zero_transform == tuple()
unit_basis, unit_transform = groebner_basis_reference(
    (p((1, (0, 0))), generators[0]), prime
)
assert unit_basis == (p((1, (0, 0))),)
assert verify_groebner_certificate(
    (p((1, (0, 0))), generators[0]), unit_basis, unit_transform, prime
).valid

bad = list(list(row) for row in transform)
bad[0][0] = tuple()
assert not verify_groebner_certificate(generators, basis, bad, prime).valid
assert REFERENCE_CAPABILITY["proof"] == "deterministic-exact"
assert MSOLVE_F4_CAPABILITY["orders"] == ["degrevlex"]
assert prime.descriptor()["abi"] == PACKED_ABI

with open(${JSON.stringify(path.join(__dirname, "fixtures", "groebner-basis-oracles-v1.json"))}) as handle:
    corpus = json.load(handle)
for case in corpus["cases"]:
    if case["kind"] != "basis":
        continue
    descriptor = case["ring"]
    ring = GroebnerRing(
        descriptor["variables"],
        descriptor["order"],
        descriptor["characteristic"],
    )
    def packed_polynomial(value):
        return tuple(
            (
                tuple(coefficient)
                if descriptor["domain"] == "QQ"
                else coefficient,
                tuple(exponents),
            )
            for coefficient, exponents in value
        )
    case_generators = tuple(
        packed_polynomial(value) for value in case["generators"]
    )
    case_basis, case_transform = groebner_basis_reference(
        case_generators, ring
    )
    expected = tuple(packed_polynomial(value) for value in case["basis"])
    assert case_basis == expected, case["id"]
    assert verify_groebner_certificate(
        case_generators, case_basis, case_transform, ring
    ).valid, case["id"]
print("groebner contract ok")
`;

test("the exact Groebner contract works unchanged in CPython", () => {
  const result = spawnSync("/usr/bin/python3", ["-I", "-c", contractProgram], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /groebner contract ok/);
});

test("the versioned Groebner oracle corpus is structurally complete", () => {
  const corpus = JSON.parse(readFileSync(
    path.join(__dirname, "fixtures", "groebner-basis-oracles-v1.json"),
    "utf8",
  ));
  assert.equal(corpus.schema, "sagejs.groebner-oracles/v1");
  assert.ok(corpus.cases.length >= 10);
  for (const entry of corpus.cases) {
    assert.ok(entry.id);
    assert.ok(entry.ring);
    assert.ok(entry.kind === "basis" || entry.kind === "rejection");
    assert.ok(Array.isArray(entry.sources) && entry.sources.length >= 2);
    if (entry.kind === "basis") assert.ok(Array.isArray(entry.basis));
  }
});
