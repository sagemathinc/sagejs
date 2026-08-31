function checkedView(memory, offset, length) {
  if (!Number.isSafeInteger(offset) || offset <= 0 || offset % 8 !== 0 ||
      offset + length * 8 > memory.buffer.byteLength) {
    throw new RangeError("MGH oracle memory region is invalid");
  }
  return new Float64Array(memory.buffer, offset, length);
}

export async function createMghOracle(moduleOrBytes) {
  const module = moduleOrBytes instanceof WebAssembly.Module
    ? moduleOrBytes
    : await WebAssembly.compile(moduleOrBytes);
  if (WebAssembly.Module.imports(module).length !== 0) {
    throw new Error("MGH qualification oracle must not import host functions");
  }
  const instance = await WebAssembly.instantiate(module, {});
  instance.exports._initialize?.();
  const { memory } = instance.exports;

  function problem({ number, variables, residuals, factor }) {
    const xOffset = instance.exports.mgh_alloc(variables * 8);
    const residualOffset = instance.exports.mgh_alloc(residuals * 8);
    const jacobianOffset = instance.exports.mgh_alloc(variables * residuals * 8);
    if (xOffset === 0 || residualOffset === 0 || jacobianOffset === 0) {
      throw new RangeError("MGH qualification oracle allocation failed");
    }
    if (instance.exports.mgh_initial(variables, number, factor, xOffset) !== 1) {
      throw new Error("MGH qualification oracle rejected the initial point");
    }
    const initial = Array.from(checkedView(memory, xOffset, variables));

    function writePoint(point) {
      if (!Array.isArray(point) || point.length !== variables ||
          point.some((value) => !Number.isFinite(value))) {
        throw new RangeError("MGH qualification point is invalid");
      }
      checkedView(memory, xOffset, variables).set(point);
    }

    return Object.freeze({
      initial,
      residual(point) {
        writePoint(point);
        if (instance.exports.mgh_residual(
          residuals, variables, number, xOffset, residualOffset,
        ) !== 1) {
          throw new Error("MGH residual oracle rejected a qualified case");
        }
        return Array.from(checkedView(memory, residualOffset, residuals));
      },
      jacobian(point) {
        writePoint(point);
        if (instance.exports.mgh_jacobian(
          residuals, variables, number, xOffset, jacobianOffset,
        ) !== 1) {
          throw new Error("MGH Jacobian oracle rejected a qualified case");
        }
        const packed = checkedView(memory, jacobianOffset, residuals * variables);
        return Array.from({ length: residuals }, (_, row) =>
          Array.from({ length: variables }, (_, column) =>
            packed[column * residuals + row]),
        );
      },
      dispose() {
        instance.exports.mgh_free(jacobianOffset);
        instance.exports.mgh_free(residualOffset);
        instance.exports.mgh_free(xOffset);
      },
    });
  }

  return Object.freeze({ problem });
}

export function parseMghCases(text) {
  const cases = [];
  for (const line of text.split(/\r?\n/)) {
    const values = line.trim().split(/\s+/).map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isInteger(value))) {
      continue;
    }
    const [number, variables, residuals, tries] = values;
    if (number === 0) break;
    let factor = 1;
    for (let attempt = 0; attempt < tries; attempt += 1) {
      cases.push({ number, variables, residuals, factor, attempt });
      factor *= 10;
    }
  }
  if (cases.length !== 53) {
    throw new Error(`expected 53 upstream MGH cases, found ${cases.length}`);
  }
  return cases;
}

export function parseMghReference(text) {
  const marker = text.lastIndexOf(" nprob   n    m   nfev  njev  info  final L2 norm");
  if (marker < 0) throw new Error("MGH reference summary is missing");
  const records = [];
  const linePattern = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([0-9.eE+-]+)\s*$/gm;
  let match;
  const summary = text.slice(marker);
  while ((match = linePattern.exec(summary)) !== null) {
    records.push({
      number: Number(match[1]),
      variables: Number(match[2]),
      residuals: Number(match[3]),
      residualEvaluations: Number(match[4]),
      jacobianEvaluations: Number(match[5]),
      status: Number(match[6]),
      residualNorm: Number(match[7]),
    });
  }
  if (records.length !== 53) {
    throw new Error(`expected 53 upstream MGH references, found ${records.length}`);
  }
  return records;
}
