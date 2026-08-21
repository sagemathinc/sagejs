const WORD_MAX = 0xffffffffn;
const NULL_EXPONENT = 0xffffffff;

const REQUIRED_EXPORTS = Object.freeze([
  "memory",
  "sagejs_wasm_dirichlet_group_begin",
  "sagejs_wasm_dirichlet_group_clear",
  "sagejs_wasm_dirichlet_group_modulus",
  "sagejs_wasm_dirichlet_group_size",
  "sagejs_wasm_dirichlet_group_exponent",
  "sagejs_wasm_dirichlet_group_number_primitive",
  "sagejs_wasm_dirichlet_group_component_count",
  "sagejs_wasm_dirichlet_group_component_order",
  "sagejs_wasm_dirichlet_group_generator",
  "sagejs_wasm_dirichlet_character_begin",
  "sagejs_wasm_dirichlet_character_conrey_number",
  "sagejs_wasm_dirichlet_character_conductor",
  "sagejs_wasm_dirichlet_character_order",
  "sagejs_wasm_dirichlet_character_is_even",
  "sagejs_wasm_dirichlet_character_is_principal",
  "sagejs_wasm_dirichlet_character_is_real",
  "sagejs_wasm_dirichlet_character_is_primitive",
  "sagejs_wasm_dirichlet_character_exponent_compute",
  "sagejs_wasm_dirichlet_character_exponent_value",
  "sagejs_wasm_dirichlet_character_exponents_compute",
  "sagejs_wasm_dirichlet_character_exponents",
  "sagejs_wasm_dirichlet_character_exponent_count",
  "sagejs_wasm_dirichlet_character_max_vector_entries",
]);

function requireBigInt(value, description, { positive = false } = {}) {
  if (typeof value !== "bigint") {
    throw new TypeError(`${description} must be a BigInt`);
  }
  if ((positive ? value <= 0n : value < 0n) || value > WORD_MAX) {
    throw new RangeError(
      `${description} must fit in an unsigned browser FLINT word`,
    );
  }
  return value;
}

function validateExports(exports) {
  for (const name of REQUIRED_EXPORTS) {
    if (name === "memory") {
      if (!(exports.memory instanceof WebAssembly.Memory)) {
        throw new Error("Dirichlet WebAssembly module does not export memory");
      }
    } else if (typeof exports[name] !== "function") {
      throw new Error(`Dirichlet WebAssembly module is missing ${name}`);
    }
  }
}

/**
 * Adapt the production FLINT WebAssembly Dirichlet ABI to the synchronous
 * backend expected by `src/baselib/dirichlet.py`.
 *
 * Groups are immutable JavaScript tokens owned by this backend.  FLINT's
 * stateful structures live only for the duration of one synchronous method,
 * which prevents dangling Wasm pointers and makes cleanup deterministic.
 */
export function createDirichletGroupBackend(instance) {
  const exports = instance?.exports;
  if (exports === undefined || exports === null) {
    throw new TypeError("expected an instantiated Dirichlet WebAssembly module");
  }
  validateExports(exports);

  const groups = new WeakSet();

  function requireGroup(group) {
    if (
      typeof group !== "object" ||
      group === null ||
      !groups.has(group)
    ) {
      throw new TypeError("expected a browser FLINT Dirichlet group");
    }
    return group;
  }

  function withGroup(group, callback) {
    group = requireGroup(group);
    if (exports.sagejs_wasm_dirichlet_group_begin(group.modulus) !== 1) {
      throw new RangeError("FLINT could not initialize this Dirichlet modulus");
    }
    try {
      return callback(group);
    } finally {
      exports.sagejs_wasm_dirichlet_group_clear();
    }
  }

  function withCharacter(group, index, callback) {
    index = requireBigInt(index, "Dirichlet character index");
    return withGroup(group, (ownedGroup) => {
      if (index >= exports.sagejs_wasm_dirichlet_group_size()) {
        throw new RangeError("Dirichlet character index is out of range");
      }
      if (exports.sagejs_wasm_dirichlet_character_begin(index) !== 1) {
        throw new Error("FLINT could not initialize this Dirichlet character");
      }
      return callback(ownedGroup);
    });
  }

  function dirichletGroup(modulus) {
    modulus = requireBigInt(modulus, "Dirichlet modulus", { positive: true });
    const group = Object.freeze({ modulus });
    groups.add(group);
    return group;
  }

  function dirichletGroupData(group) {
    return withGroup(group, () => {
      const componentCount =
        Number(exports.sagejs_wasm_dirichlet_group_component_count()) >>> 0;
      const orders = Array.from(
        { length: componentCount },
        (_, component) =>
          exports.sagejs_wasm_dirichlet_group_component_order(component),
      );
      const generators = Array.from(
        { length: componentCount },
        (_, component) =>
          exports.sagejs_wasm_dirichlet_group_generator(component),
      );
      return {
        modulus: exports.sagejs_wasm_dirichlet_group_modulus(),
        size: exports.sagejs_wasm_dirichlet_group_size(),
        exponent: exports.sagejs_wasm_dirichlet_group_exponent(),
        numberPrimitive:
          exports.sagejs_wasm_dirichlet_group_number_primitive(),
        orders,
        generators,
      };
    });
  }

  function dirichletCharacterData(group, index) {
    return withCharacter(group, index, () => ({
      conreyNumber:
        exports.sagejs_wasm_dirichlet_character_conrey_number(),
      conductor: exports.sagejs_wasm_dirichlet_character_conductor(),
      order: exports.sagejs_wasm_dirichlet_character_order(),
      even: exports.sagejs_wasm_dirichlet_character_is_even() === 1,
      principal:
        exports.sagejs_wasm_dirichlet_character_is_principal() === 1,
      real: exports.sagejs_wasm_dirichlet_character_is_real() === 1,
      primitive:
        exports.sagejs_wasm_dirichlet_character_is_primitive() === 1,
    }));
  }

  function dirichletCharacterExponent(group, index, residue) {
    residue = requireBigInt(residue, "Dirichlet argument");
    return withCharacter(group, index, (ownedGroup) => {
      if (residue >= ownedGroup.modulus) {
        throw new RangeError(
          "Dirichlet argument must be reduced modulo its modulus",
        );
      }
      const status =
        exports.sagejs_wasm_dirichlet_character_exponent_compute(residue);
      if (status === 1) {
        return null;
      }
      if (status === 2) {
        return exports.sagejs_wasm_dirichlet_character_exponent_value();
      }
      throw new Error("FLINT rejected the Dirichlet character argument");
    });
  }

  function dirichletCharacterExponents(group, index) {
    return withCharacter(group, index, () => {
      const status =
        exports.sagejs_wasm_dirichlet_character_exponents_compute();
      if (status === 1) {
        const limit =
          Number(
            exports.sagejs_wasm_dirichlet_character_max_vector_entries(),
          ) >>> 0;
        throw new RangeError(
          `Dirichlet value vector exceeds the ${limit}-entry browser limit`,
        );
      }
      if (status !== 2) {
        throw new Error("FLINT could not compute the Dirichlet value vector");
      }
      const pointer =
        Number(exports.sagejs_wasm_dirichlet_character_exponents()) >>> 0;
      const count =
        Number(exports.sagejs_wasm_dirichlet_character_exponent_count()) >>> 0;
      if (count > 0 && pointer === 0) {
        throw new Error("FLINT returned an invalid Dirichlet value vector");
      }
      const packed = new Uint32Array(
        exports.memory.buffer,
        pointer,
        count,
      );
      return Array.from(packed, (exponent) =>
        exponent === NULL_EXPONENT ? null : BigInt(exponent));
    });
  }

  return Object.freeze({
    dirichletGroup,
    dirichletGroupData,
    dirichletCharacterData,
    dirichletCharacterExponent,
    dirichletCharacterExponents,
    isDirichletGroup(value) {
      return typeof value === "object" && value !== null && groups.has(value);
    },
    dirichletGroupModulus(group) {
      return requireGroup(group).modulus;
    },
  });
}

export const dirichletGroupWasmExports = REQUIRED_EXPORTS;
