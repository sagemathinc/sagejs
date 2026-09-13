#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { createSage } = require("../../../dist/tools/kernel.js");

const ROOT = path.resolve(__dirname, "../../..");
const PINNED = JSON.parse(
  fs.readFileSync(path.join(__dirname, "pinned-corpus.json"), "utf8"),
);

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function decodedString(repr) {
  assert.ok(
    (repr.startsWith("'") && repr.endsWith("'")) ||
      (repr.startsWith('"') && repr.endsWith('"')),
    `expected a string repr, got ${repr}`,
  );
  return repr.slice(1, -1);
}

async function evaluateString(session, source) {
  return decodedString((await session.evaluate(source)).repr);
}

async function verifySagejsCorpus() {
  const session = await createSage();
  const observations = {
    schema: PINNED.schema,
    source: "Sage.js exact q-expansion engines",
    trivial_character: [],
  };
  try {
    await session.evaluate(
      [
        "def _qexp_corpus_matrix(forms, precision, K=QQ):",
        "    rows = [[form[n] for n in range(precision)] for form in forms]",
        "    if len(rows) == 0:",
        "        return matrix(K,0,precision)",
        "    return matrix(K,rows).row_space().basis_matrix()",
        "def _qexp_corpus_encode(value):",
        "    return ';'.join([','.join([str(x) for x in row]) for row in value.rows()])",
      ].join("\n"),
    );

    for (const expected of PINNED.trivial_character) {
      const prefix = `_qexp_${expected.level}_${expected.weight}`;
      await session.evaluate(
        [
          `${prefix}_space=CuspForms(${expected.level},${expected.weight},prec=${expected.precision})`,
          `${prefix}_formula=${prefix}_space.formula_subspace(prec=${expected.precision})`,
          `${prefix}_ambient=_qexp_corpus_matrix(${prefix}_space.q_expansion_basis(${expected.precision},algorithm='modular_symbols'),${expected.precision})`,
        ].join("\n"),
      );
      const ambientEncoding = await evaluateString(
        session,
        `_qexp_corpus_encode(${prefix}_ambient)`,
      );
      const formulaEncoding = await evaluateString(
        session,
        `_qexp_corpus_encode(${prefix}_formula.coefficient_matrix())`,
      );
      const dimensions = (
        await session.evaluate(
          `[${prefix}_ambient.nrows(),${prefix}_formula.dimension(),${prefix}_formula.missing_dimension(),${prefix}_formula.ambient_comparison().verify()]`,
        )
      ).repr;
      const observation = {
        id: expected.id,
        ambient_sha256: sha256(ambientEncoding),
        formula_sha256: sha256(formulaEncoding),
        dimensions,
      };
      assert.equal(observation.ambient_sha256, expected.ambient_sha256);
      assert.equal(observation.formula_sha256, expected.formula_sha256);
      assert.equal(
        dimensions,
        `[${expected.ambient_dimension}, ${expected.formula_dimension}, ${
          expected.ambient_dimension - expected.formula_dimension
        }, True]`,
      );
      observations.trivial_character.push(observation);
    }

    const character = PINNED.nontrivial_character;
    await session.evaluate(
      [
        `_qexp_character=DirichletGroup(${character.modulus}).gen()^3`,
        `_qexp_character_space=ModularSymbols(_qexp_character,${character.weight},sign=1).cuspidal_submodule()`,
        `_qexp_character_matrix=_qexp_corpus_matrix(_qexp_character_space.q_expansion_basis(${character.precision}),${character.precision},_qexp_character_space.base_ring())`,
      ].join("\n"),
    );
    const characterEncoding = await evaluateString(
      session,
      "_qexp_corpus_encode(_qexp_character_matrix)",
    );
    observations.nontrivial_character = {
      id: character.id,
      basis_sha256: sha256(characterEncoding),
      invariants: (
        await session.evaluate(
          "[_qexp_character.conrey_number(),_qexp_character_space.dimension()]",
        )
      ).repr,
    };
    assert.equal(
      observations.nontrivial_character.basis_sha256,
      character.basis_sha256,
    );
    assert.equal(
      observations.nontrivial_character.invariants,
      `[${character.conrey_number}, ${character.dimension}]`,
    );

    observations.old_new = [];
    for (const oldNew of PINNED.old_new) {
      const prefix = `_qexp_oldnew_${oldNew.level}_${oldNew.weight}`;
      await session.evaluate(
        [
          `${prefix}_space=CuspForms(${oldNew.level},${oldNew.weight},prec=${oldNew.precision})`,
          `${prefix}_old=${prefix}_space.old_subspace()`,
          `${prefix}_new=${prefix}_space.new_subspace()`,
          `${prefix}_symbols=ModularSymbols(${oldNew.level},${oldNew.weight},sign=1).cuspidal_submodule()`,
          `${prefix}_ambient_matrix=_qexp_corpus_matrix(${prefix}_space.q_expansion_basis(${oldNew.precision},algorithm='modular_symbols'),${oldNew.precision})`,
          `${prefix}_old_matrix=_qexp_corpus_matrix(${prefix}_old.q_expansion_basis(${oldNew.precision}),${oldNew.precision})`,
          `${prefix}_new_matrix=_qexp_corpus_matrix(${prefix}_new.q_expansion_basis(${oldNew.precision}),${oldNew.precision})`,
        ].join("\n"),
      );
      const observation = {
        id: oldNew.id,
        ambient_sha256: sha256(
          await evaluateString(
            session,
            `_qexp_corpus_encode(${prefix}_ambient_matrix)`,
          ),
        ),
        old_sha256: sha256(
          await evaluateString(
            session,
            `_qexp_corpus_encode(${prefix}_old_matrix)`,
          ),
        ),
        new_sha256: sha256(
          await evaluateString(
            session,
            `_qexp_corpus_encode(${prefix}_new_matrix)`,
          ),
        ),
        dimensions: (
          await session.evaluate(
            `[${prefix}_space.dimension(),${prefix}_old.dimension(),${prefix}_new.dimension(),${oldNew.precision}>${prefix}_space.sturm_bound()]`,
          )
        ).repr,
        hecke_characteristic_polynomials: {},
      };
      assert.equal(observation.ambient_sha256, oldNew.ambient_sha256);
      assert.equal(observation.old_sha256, oldNew.old_sha256);
      assert.equal(observation.new_sha256, oldNew.new_sha256);
      assert.equal(
        observation.dimensions,
        `[${oldNew.ambient_dimension}, ${oldNew.old_dimension}, ${oldNew.new_dimension}, True]`,
      );
      for (const [index, polynomial] of Object.entries(
        oldNew.hecke_characteristic_polynomials,
      )) {
        const actual = await evaluateString(
          session,
          `str(${prefix}_symbols.hecke_matrix(${index}).charpoly())`,
        );
        observation.hecke_characteristic_polynomials[index] = actual;
        assert.equal(actual, polynomial);
      }
      observations.old_new.push(observation);
    }

    const coefficientField = PINNED.coefficient_field;
    await session.evaluate(
      [
        `_qexp_newform=Newforms(${coefficientField.level},${coefficientField.weight},names='a',prec=${coefficientField.precision})[0]`,
        `_qexp_newform_basis=_qexp_corpus_matrix(CuspForms(${coefficientField.level},${coefficientField.weight}).new_subspace().q_expansion_basis(${coefficientField.precision}),${coefficientField.precision})`,
      ].join("\n"),
    );
    observations.coefficient_field = {
      id: coefficientField.id,
      invariants: (
        await session.evaluate(
          "[_qexp_newform.coefficient_field().degree(),str(_qexp_newform.defining_polynomial())]",
        )
      ).repr,
      hecke_characteristic_polynomials: {},
      basis_sha256: sha256(
        await evaluateString(
          session,
          "_qexp_corpus_encode(_qexp_newform_basis)",
        ),
      ),
    };
    assert.equal(
      observations.coefficient_field.basis_sha256,
      coefficientField.basis_sha256,
    );
    assert.equal(
      observations.coefficient_field.invariants,
      `[${coefficientField.field_degree}, '${coefficientField.defining_polynomial}']`,
    );
    for (const [prime, polynomial] of Object.entries(
      coefficientField.hecke_characteristic_polynomials,
    )) {
      const actual = await evaluateString(
        session,
        `str(_qexp_newform.hecke_constituent().hecke_matrix(${prime}).charpoly())`,
      );
      observations.coefficient_field.hecke_characteristic_polynomials[prime] =
        actual;
      assert.equal(actual, polynomial);
    }

    const higherField = PINNED.higher_coefficient_field;
    await session.evaluate(
      [
        `_qexp_higher_newform=Newforms(${higherField.level},${higherField.weight},names='b',prec=${higherField.precision})[0]`,
        `_qexp_higher_basis=_qexp_corpus_matrix(CuspForms(${higherField.level},${higherField.weight}).new_subspace().q_expansion_basis(${higherField.precision}),${higherField.precision})`,
      ].join("\n"),
    );
    observations.higher_coefficient_field = {
      id: higherField.id,
      invariants: (
        await session.evaluate(
          "[_qexp_higher_newform.coefficient_field().degree(),str(_qexp_higher_newform.defining_polynomial())]",
        )
      ).repr,
      hecke_characteristic_polynomials: {},
      basis_sha256: sha256(
        await evaluateString(session, "_qexp_corpus_encode(_qexp_higher_basis)"),
      ),
    };
    assert.equal(
      observations.higher_coefficient_field.basis_sha256,
      higherField.basis_sha256,
    );
    assert.equal(
      observations.higher_coefficient_field.invariants,
      `[${higherField.field_degree}, '${higherField.defining_polynomial}']`,
    );
    for (const [prime, polynomial] of Object.entries(
      higherField.hecke_characteristic_polynomials,
    )) {
      const actual = await evaluateString(
        session,
        `str(_qexp_higher_newform.hecke_constituent().hecke_matrix(${prime}).charpoly())`,
      );
      observations.higher_coefficient_field.hecke_characteristic_polynomials[
        prime
      ] = actual;
      assert.equal(actual, polynomial);
    }

    observations.beyond_sturm_recurrences = (
      await session.evaluate(
        [
          "_qexp_delta=ModularForms(1,12,prec=12).delta().q_expansion(12)",
          "_qexp_chi_basis=_qexp_character_space.q_expansion_basis(16)[0]",
          "[_qexp_delta[4]==_qexp_delta[2]^2-2^11,",
          " _qexp_delta[9]==_qexp_delta[3]^2-3^11,",
          " _qexp_chi_basis[4]==_qexp_chi_basis[2]^2-_qexp_character(2)*2^2]",
        ].join("\n"),
      )
    ).repr;
    assert.equal(observations.beyond_sturm_recurrences, "[True, True, True]");
    return observations;
  } finally {
    await session.close();
  }
}

if (require.main === module) {
  verifySagejsCorpus()
    .then((observations) => {
      process.stdout.write(`${JSON.stringify(observations, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error}\n`);
      process.exitCode = 1;
    });
}

module.exports = { PINNED, ROOT, verifySagejsCorpus };
