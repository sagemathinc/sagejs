"use strict";

const crypto = require("node:crypto");

// Reverse selected column ancestries through the exact operations already
// performed by hnffinal/hnfadd. Matrices are flat column-major BigInt arrays.

function positiveDivisorFloor(value, divisor) {
  if (divisor <= 0n) throw new Error("ancestry floor divisor is not positive");
  if (value >= 0n) return value / divisor;
  return -((-value + divisor - 1n) / divisor);
}

function authenticatePackedLogCheckpoint(values, expectedSha256) {
  if (!Array.isArray(values) || !/^[0-9a-f]{64}$/.test(expectedSha256))
    throw new Error("invalid packed-log checkpoint owner");
  const canonical = values.map(value => BigInt(value).toString());
  const digest = crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  if (digest !== expectedSha256) throw new Error("packed-log checkpoint hash changed");
  return digest;
}

function embedHnfInputColumn(coefficients, owner) {
  const { totalRows, genuineRows, dependentRows, width, tail, dependent,
    active, trailing, preHnfPermutation, postHnfPermutation } = owner;
  const lig = genuineRows + dependentRows;
  if (totalRows !== lig + tail || coefficients.length !== width + tail)
    throw new Error(`invalid HNF input embedding dimensions: ${JSON.stringify({
      totalRows, genuineRows, dependentRows, lig, width, tail,
      coefficients: coefficients.length, expectedRows: lig + tail,
      expectedCoefficients: width + tail,
    })}`);
  if (dependent.length !== width * dependentRows
      || active.length !== width * genuineRows
      || trailing.length !== lig * tail
      || preHnfPermutation.length !== lig
      || postHnfPermutation.length !== tail)
    throw new Error("short HNF input embedding owner");
  const permutation = [...preHnfPermutation, ...postHnfPermutation];
  const seen = Array(totalRows).fill(false);
  for (const raw of permutation) {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > totalRows || seen[value - 1])
      throw new Error("invalid HNF input embedding permutation");
    seen[value - 1] = true;
  }
  const output = Array(totalRows).fill(0n);
  for (let logical = 0; logical < lig; logical += 1) {
    let value = 0n;
    for (let column = 0; column < width; column += 1)
      value += coefficients[column] * (logical < dependentRows
        ? dependent[column * dependentRows + logical]
        : active[column * genuineRows + logical - dependentRows]);
    for (let column = 0; column < tail; column += 1)
      value += coefficients[width + column] * trailing[column * lig + logical];
    output[Number(preHnfPermutation[logical]) - 1] = value;
  }
  for (let column = 0; column < tail; column += 1)
    output[Number(postHnfPermutation[column]) - 1] = coefficients[width + column];
  return output;
}

function reverseHnfFinal(output, step) {
  const { rows, depRows, columns, tail, fullH, fullDep, trailing,
    transform, diagonal } = step;
  const lig = rows + depRows, zc = columns - rows;
  if (output.length !== columns + tail) throw new Error("wrong hnffinal output width");
  const work = Array(columns).fill(0n), inputTail = output.slice(columns);
  for (let column = 0; column < zc; column += 1) work[column] += output[column];
  let removed = 0, unit = 0, nonunit = 0;
  for (let row = 0; row < rows; row += 1) if (diagonal[row]) removed += 1;
  const newColumns = columns - removed;
  for (let row = 0; row < rows; row += 1) {
    const destination = diagonal[row] ? newColumns + unit++ : zc + nonunit++;
    work[zc + row] += output[destination];
  }
  const b = trailing.slice();
  for (let row = rows - 1; row >= 0; row -= 1) {
    const h = fullH[(zc + row) * rows + row];
    for (let column = 0; column < tail; column += 1) {
      let quotient = b[column * lig + depRows + row];
      if (!diagonal[row]) {
        quotient = positiveDivisorFloor(quotient, h);
      }
      if (!quotient) continue;
      for (let k = 0; k < depRows; k += 1)
        b[column * lig + k] -= quotient * fullDep[(zc + row) * depRows + k];
      for (let k = 0; k < rows; k += 1)
        b[column * lig + depRows + k] -= quotient * fullH[(zc + row) * rows + k];
      work[zc + row] -= quotient * inputTail[column];
    }
  }
  const input = Array(columns + tail).fill(0n);
  for (let source = 0; source < columns; source += 1)
    for (let column = 0; column < columns; column += 1)
      input[source] += transform[column * columns + source] * work[column];
  for (let column = 0; column < tail; column += 1)
    input[columns + column] = inputTail[column];
  return input;
}

function reverseAppend(output, step, raw) {
  const { oldTotal, newColumns, zeroPrefix, hRows, bColumns, perm,
    newRelations, rows } = step;
  const old = Array(oldTotal).fill(0n);
  for (let column = 0; column < zeroPrefix; column += 1) old[column] = output[column];
  const joined = reverseHnfFinal(output.slice(zeroPrefix), step.hnf);
  const lig = rows - bColumns, relationColumns = oldTotal - bColumns;
  for (let column = 0; column < newColumns; column += 1) {
    const coefficient = joined[column];
    raw[oldTotal + column] += coefficient;
    for (let k = 0; k < bColumns; k += 1)
      old[relationColumns + k] -= coefficient
        * newRelations[column * rows + Number(perm[lig + k]) - 1];
  }
  for (let column = 0; column < hRows + bColumns; column += 1)
    old[zeroPrefix + column] += joined[newColumns + column];
  return old;
}

function reverseSchedule(finalWidth, selected, initialStep, appendSteps) {
  return selected.map(selectedColumn => {
    let current = Array(finalWidth).fill(0n); current[selectedColumn] = 1n;
    const raw = Array(finalWidth).fill(0n);
    for (let index = appendSteps.length - 1; index >= 0; index -= 1)
      current = reverseAppend(current, appendSteps[index], raw);
    const cleaned = reverseHnfFinal(current, initialStep.hnf);
    for (let source = 0; source < initialStep.columns; source += 1)
      for (let column = 0; column < initialStep.columns; column += 1)
        raw[source] += initialStep.cleanupTransform[column * initialStep.columns + source]
          * cleaned[column];
    return raw;
  });
}

module.exports = { positiveDivisorFloor, authenticatePackedLogCheckpoint, embedHnfInputColumn,
  reverseHnfFinal, reverseAppend, reverseSchedule };
