"use strict";

const { generatedOperation } = require("./provenance.cjs");

/*
 * Name-independent loop idioms for source-transparent prime-field kernels.
 *
 * These transforms inspect data flow in the lowered body.  They do not know
 * function names, local-variable spellings, or which mathematical algorithm
 * contains the loop.  The resulting operations retain explicit buffer,
 * index, range, and modulus operands so the C backend can select a safe
 * modular implementation once per loop instead of once per scalar.
 */

function binary(operation, kind, left, right) {
  return operation?.kind === "source.uint64.binary" &&
    operation.operation === kind && operation.left === left &&
    operation.right === right;
}

function copy(operation, source) {
  return operation?.kind === "source.copy" &&
    operation.type === "uint64" && operation.source === source;
}

function matchRowSubmul(loop) {
  const body = loop.body;
  if (body.length !== 12) return null;
  const [targetMul, targetAdd, targetCopy, sourceMul, sourceAdd,
    sourceCopy, sourceGet, multiply, productCopy, targetGet,
    subtract, targetSet] = body;
  if (targetMul?.kind !== "source.uint64.binary" ||
      targetMul.operation !== "*" ||
      !binary(targetAdd, "+", targetMul.target, loop.index) ||
      !copy(targetCopy, targetAdd.target) ||
      sourceMul?.kind !== "source.uint64.binary" ||
      sourceMul.operation !== "*" ||
      sourceMul.right !== targetMul.right ||
      !binary(sourceAdd, "+", sourceMul.target, loop.index) ||
      !copy(sourceCopy, sourceAdd.target) ||
      sourceGet?.kind !== "source.buffer.get" ||
      sourceGet.index !== sourceCopy.target ||
      multiply?.kind !== "source.prime.mul" ||
      productCopy?.kind !== "source.copy" ||
      productCopy.source !== multiply.target ||
      targetGet?.kind !== "source.buffer.get" ||
      targetGet.buffer !== sourceGet.buffer ||
      targetGet.index !== targetCopy.target ||
      subtract?.kind !== "source.prime.sub" ||
      subtract.left !== targetGet.target ||
      subtract.right !== productCopy.target ||
      subtract.modulus !== multiply.modulus ||
      targetSet?.kind !== "source.buffer.set" ||
      targetSet.buffer !== sourceGet.buffer ||
      targetSet.index !== targetCopy.target ||
      targetSet.value !== subtract.target) {
    return null;
  }
  const factor = multiply.left === sourceGet.target
    ? multiply.right
    : multiply.right === sourceGet.target
      ? multiply.left
      : null;
  if (factor === null) return null;
  return generatedOperation(loop, {
    kind: "source.prime.row_submul",
    buffer: sourceGet.buffer,
    targetRow: targetMul.left,
    sourceRow: sourceMul.left,
    stride: targetMul.right,
    start: loop.start,
    stop: loop.stop,
    factor,
    modulus: multiply.modulus,
    modulusType: multiply.modulusType,
  });
}

function matchDotAccumulate(loop) {
  const body = loop.body;
  if (body.length !== 10) return null;
  const [leftMul, leftAdd, leftGet, rightMul, rightAdd, rightGet,
    multiply, productCopy, accumulate, accumulatorCopy] = body;
  if (leftMul?.kind !== "source.uint64.binary" ||
      leftMul.operation !== "*" ||
      !binary(leftAdd, "+", leftMul.target, loop.index) ||
      leftGet?.kind !== "source.buffer.get" ||
      leftGet.index !== leftAdd.target ||
      !binary(rightMul, "*", loop.index, rightMul?.right) ||
      !binary(rightAdd, "+", rightMul.target, rightAdd?.right) ||
      rightGet?.kind !== "source.buffer.get" ||
      rightGet.index !== rightAdd.target ||
      multiply?.kind !== "source.prime.mul" ||
      !((multiply.left === leftGet.target &&
          multiply.right === rightGet.target) ||
        (multiply.left === rightGet.target &&
          multiply.right === leftGet.target)) ||
      !copy(productCopy, multiply.target) ||
      !["source.prime.add", "source.prime.sub"].includes(accumulate?.kind) ||
      accumulate.right !== productCopy.target ||
      accumulate.modulus !== multiply.modulus ||
      !copy(accumulatorCopy, accumulate.target) ||
      accumulate.left !== accumulatorCopy.target) {
    return null;
  }
  return generatedOperation(loop, {
    kind: "source.prime.dot_accumulate",
    leftBuffer: leftGet.buffer,
    rightBuffer: rightGet.buffer,
    leftRow: leftMul.left,
    inner: leftMul.right,
    rightColumns: rightMul.right,
    column: rightAdd.right,
    start: loop.start,
    stop: loop.stop,
    accumulator: accumulatorCopy.target,
    modulus: multiply.modulus,
    modulusType: multiply.modulusType,
    operation: accumulate.kind === "source.prime.sub" ? "sub" : "add",
  });
}

function matchPanelUpdate(loop) {
  if (loop.body?.length !== 1) return null;
  const columns = loop.body[0];
  if (columns?.kind !== "source.loop.range" || columns.body?.length !== 7) {
    return null;
  }
  const [rowMultiply, indexAdd, indexCopy, targetGet, valueCopy,
    dot, targetSet] = columns.body;
  if (rowMultiply?.kind !== "source.uint64.binary" ||
      rowMultiply.operation !== "*" || rowMultiply.left !== loop.index ||
      !binary(indexAdd, "+", rowMultiply.target, columns.index) ||
      !copy(indexCopy, indexAdd.target) ||
      targetGet?.kind !== "source.buffer.get" ||
      targetGet.index !== indexCopy.target ||
      !copy(valueCopy, targetGet.target) ||
      dot?.kind !== "source.prime.dot_accumulate" ||
      dot.operation !== "sub" || dot.accumulator !== valueCopy.target ||
      dot.leftBuffer !== targetGet.buffer ||
      dot.rightBuffer !== targetGet.buffer ||
      dot.leftRow !== loop.index || dot.inner !== rowMultiply.right ||
      dot.rightColumns !== rowMultiply.right || dot.column !== columns.index ||
      dot.stop !== loop.start || columns.start !== loop.start ||
      targetSet?.kind !== "source.buffer.set" ||
      targetSet.buffer !== targetGet.buffer ||
      targetSet.index !== indexCopy.target || targetSet.value !== valueCopy.target) {
    return null;
  }
  return generatedOperation(loop, {
    kind: "source.prime.panel_update",
    buffer: targetGet.buffer,
    rowsStart: loop.start,
    rowsStop: loop.stop,
    columnsStart: columns.start,
    columnsStop: columns.stop,
    panelStart: dot.start,
    panelStop: dot.stop,
    stride: rowMultiply.right,
    modulus: dot.modulus,
    modulusType: dot.modulusType,
  });
}

function optimizeStatements(statements, counts) {
  return statements.map((statement) => {
    const current = { ...statement };
    if (Array.isArray(current.body))
      current.body = optimizeStatements(current.body, counts);
    if (Array.isArray(current.alternative))
      current.alternative = optimizeStatements(current.alternative, counts);
    if (current.kind !== "source.loop.range") return current;
    const panelUpdate = matchPanelUpdate(current);
    if (panelUpdate !== null) {
      counts.panelUpdate += 1;
      return panelUpdate;
    }
    const rowSubmul = matchRowSubmul(current);
    if (rowSubmul !== null) {
      counts.rowSubmul += 1;
      return rowSubmul;
    }
    const dot = matchDotAccumulate(current);
    if (dot !== null) {
      counts.dotAccumulate += 1;
      return dot;
    }
    return current;
  });
}

function optimizePrimeSourceBody(body) {
  const counts = { rowSubmul: 0, dotAccumulate: 0, panelUpdate: 0 };
  return {
    body: optimizeStatements(body, counts),
    optimizations: counts,
  };
}

module.exports = { optimizePrimeSourceBody };
