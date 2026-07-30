const MATRIX = Symbol("sagejs exact matrix");

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return left;
}

function rational(numerator, denominator = 1n) {
  numerator = BigInt(numerator);
  denominator = BigInt(denominator);
  if (denominator === 0n) {
    throw new RangeError("rational denominator must be nonzero");
  }
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const common = gcd(numerator, denominator);
  return {
    numerator: numerator / common,
    denominator: denominator / common,
  };
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator +
      right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function sub(left, right) {
  return rational(
    left.numerator * right.denominator -
      right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function mul(left, right) {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function div(left, right) {
  if (right.numerator === 0n) {
    throw new RangeError("matrix is singular");
  }
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function neg(value) {
  return {
    numerator: -value.numerator,
    denominator: value.denominator,
  };
}

function isZero(value) {
  return value.numerator === 0n;
}

function dimensions(rows, cols) {
  if (
    !Number.isSafeInteger(rows) ||
    !Number.isSafeInteger(cols) ||
    rows < 0 ||
    cols < 0
  ) {
    throw new RangeError("matrix dimensions must be nonnegative safe integers");
  }
}

function make(kind, rows, cols, entries) {
  dimensions(rows, cols);
  if (entries.length !== rows * cols) {
    throw new RangeError("matrix entry count does not match its dimensions");
  }
  return Object.freeze({
    [MATRIX]: true,
    kind,
    rows,
    cols,
    entries: Object.freeze(entries),
  });
}

function requireMatrix(value) {
  if (value?.[MATRIX] !== true) {
    throw new TypeError("expected a Sage.js exact matrix");
  }
  return value;
}

function requireSameKind(left, right) {
  left = requireMatrix(left);
  right = requireMatrix(right);
  if (left.kind !== right.kind) {
    throw new TypeError("matrix base rings differ");
  }
  return [left, right];
}

function asRational(value, kind) {
  return kind === "ZZ" ? rational(value) : value;
}

function asRationalRows(matrix) {
  const rows = [];
  for (let row = 0; row < matrix.rows; row += 1) {
    const values = [];
    for (let col = 0; col < matrix.cols; col += 1) {
      values.push(
        asRational(matrix.entries[row * matrix.cols + col], matrix.kind),
      );
    }
    rows.push(values);
  }
  return rows;
}

function binary(left, right, operation) {
  [left, right] = requireSameKind(left, right);
  if (left.rows !== right.rows || left.cols !== right.cols) {
    throw new RangeError("matrix dimensions must agree");
  }
  return make(
    left.kind,
    left.rows,
    left.cols,
    left.entries.map((entry, index) => operation(entry, right.entries[index])),
  );
}

function integerDeterminant(matrix) {
  if (matrix.rows !== matrix.cols) {
    throw new RangeError("determinant requires a square matrix");
  }
  const size = matrix.rows;
  if (size === 0) return 1n;
  if (size === 1) return matrix.entries[0];
  const values = [];
  for (let row = 0; row < size; row += 1) {
    values.push(
      matrix.entries.slice(row * size, (row + 1) * size),
    );
  }
  let sign = 1n;
  let previous = 1n;
  for (let pivotColumn = 0; pivotColumn < size - 1; pivotColumn += 1) {
    let pivotRow = pivotColumn;
    while (
      pivotRow < size &&
      values[pivotRow][pivotColumn] === 0n
    ) {
      pivotRow += 1;
    }
    if (pivotRow === size) return 0n;
    if (pivotRow !== pivotColumn) {
      [values[pivotRow], values[pivotColumn]] = [
        values[pivotColumn],
        values[pivotRow],
      ];
      sign = -sign;
    }
    const pivot = values[pivotColumn][pivotColumn];
    for (let row = pivotColumn + 1; row < size; row += 1) {
      for (let col = pivotColumn + 1; col < size; col += 1) {
        values[row][col] =
          (values[row][col] * pivot -
            values[row][pivotColumn] * values[pivotColumn][col]) /
          previous;
      }
      values[row][pivotColumn] = 0n;
    }
    previous = pivot;
  }
  return sign * values[size - 1][size - 1];
}

function floorDivide(numerator, positiveDenominator) {
  let quotient = numerator / positiveDenominator;
  if (
    numerator < 0n &&
    numerator % positiveDenominator !== 0n
  ) {
    quotient -= 1n;
  }
  return quotient;
}

function integerHermiteData(matrix, withTransform = false) {
  if (matrix.kind !== "ZZ") {
    throw new TypeError("Hermite form currently requires an integer matrix");
  }
  const values = [];
  for (let row = 0; row < matrix.rows; row += 1) {
    values.push(
      matrix.entries.slice(row * matrix.cols, (row + 1) * matrix.cols),
    );
  }
  const transform = [];
  if (withTransform) {
    for (let row = 0; row < matrix.rows; row += 1) {
      transform.push(
        Array.from(
          { length: matrix.rows },
          (_, col) => (row === col ? 1n : 0n),
        ),
      );
    }
  }
  let pivotRow = 0;
  for (
    let pivotColumn = 0;
    pivotColumn < matrix.cols && pivotRow < matrix.rows;
    pivotColumn += 1
  ) {
    let candidate = pivotRow;
    while (
      candidate < matrix.rows &&
      values[candidate][pivotColumn] === 0n
    ) {
      candidate += 1;
    }
    if (candidate === matrix.rows) continue;
    if (candidate !== pivotRow) {
      [values[candidate], values[pivotRow]] = [
        values[pivotRow],
        values[candidate],
      ];
      if (withTransform) {
        [transform[candidate], transform[pivotRow]] = [
          transform[pivotRow],
          transform[candidate],
        ];
      }
    }

    while (true) {
      let target = pivotRow + 1;
      while (
        target < matrix.rows &&
        values[target][pivotColumn] === 0n
      ) {
        target += 1;
      }
      if (target === matrix.rows) break;
      const quotient =
        values[target][pivotColumn] / values[pivotRow][pivotColumn];
      for (let col = 0; col < matrix.cols; col += 1) {
        values[target][col] -= quotient * values[pivotRow][col];
      }
      if (withTransform) {
        for (let col = 0; col < matrix.rows; col += 1) {
          transform[target][col] -=
            quotient * transform[pivotRow][col];
        }
      }
      if (values[target][pivotColumn] !== 0n) {
        [values[target], values[pivotRow]] = [
          values[pivotRow],
          values[target],
        ];
        if (withTransform) {
          [transform[target], transform[pivotRow]] = [
            transform[pivotRow],
            transform[target],
          ];
        }
      }
    }

    if (values[pivotRow][pivotColumn] < 0n) {
      for (let col = 0; col < matrix.cols; col += 1) {
        values[pivotRow][col] = -values[pivotRow][col];
      }
      if (withTransform) {
        for (let col = 0; col < matrix.rows; col += 1) {
          transform[pivotRow][col] = -transform[pivotRow][col];
        }
      }
    }
    const pivot = values[pivotRow][pivotColumn];
    for (let row = 0; row < pivotRow; row += 1) {
      const quotient = floorDivide(
        values[row][pivotColumn], pivot);
      for (let col = 0; col < matrix.cols; col += 1) {
        values[row][col] -= quotient * values[pivotRow][col];
      }
      if (withTransform) {
        for (let col = 0; col < matrix.rows; col += 1) {
          transform[row][col] -=
            quotient * transform[pivotRow][col];
        }
      }
    }
    pivotRow += 1;
  }
  return {
    matrix: make("ZZ", matrix.rows, matrix.cols, values.flat()),
    rank: pivotRow,
    transform,
  };
}

function integerHermite(matrix) {
  return integerHermiteData(matrix).matrix;
}

function integerRows(matrix) {
  const rows = [];
  for (let row = 0; row < matrix.rows; row += 1) {
    rows.push(
      matrix.entries.slice(row * matrix.cols, (row + 1) * matrix.cols),
    );
  }
  return rows;
}

function identityRows(size) {
  return Array.from(
    { length: size },
    (_, row) =>
      Array.from(
        { length: size },
        (_, col) => (row === col ? 1n : 0n),
      ),
  );
}

function integerSmith(matrix) {
  matrix = requireMatrix(matrix);
  if (matrix.kind !== "ZZ") {
    throw new TypeError("Smith form currently requires an integer matrix");
  }
  const values = integerRows(matrix);
  const left = identityRows(matrix.rows);
  const right = identityRows(matrix.cols);

  function swapRows(first, second) {
    [values[first], values[second]] = [values[second], values[first]];
    [left[first], left[second]] = [left[second], left[first]];
  }

  function swapColumns(first, second) {
    for (let row = 0; row < matrix.rows; row += 1) {
      [values[row][first], values[row][second]] = [
        values[row][second],
        values[row][first],
      ];
    }
    for (let row = 0; row < matrix.cols; row += 1) {
      [right[row][first], right[row][second]] = [
        right[row][second],
        right[row][first],
      ];
    }
  }

  function addRow(target, source, multiple) {
    for (let col = 0; col < matrix.cols; col += 1) {
      values[target][col] += multiple * values[source][col];
    }
    for (let col = 0; col < matrix.rows; col += 1) {
      left[target][col] += multiple * left[source][col];
    }
  }

  function addColumn(target, source, multiple) {
    for (let row = 0; row < matrix.rows; row += 1) {
      values[row][target] += multiple * values[row][source];
    }
    for (let row = 0; row < matrix.cols; row += 1) {
      right[row][target] += multiple * right[row][source];
    }
  }

  function negateRow(row) {
    for (let col = 0; col < matrix.cols; col += 1) {
      values[row][col] = -values[row][col];
    }
    for (let col = 0; col < matrix.rows; col += 1) {
      left[row][col] = -left[row][col];
    }
  }

  const diagonalLength = Math.min(matrix.rows, matrix.cols);
  for (let pivotIndex = 0; pivotIndex < diagonalLength; pivotIndex += 1) {
    let selectedRow = -1;
    let selectedColumn = -1;
    let selectedMagnitude;
    for (let row = pivotIndex; row < matrix.rows; row += 1) {
      for (let col = pivotIndex; col < matrix.cols; col += 1) {
        const value = values[row][col];
        if (value === 0n) continue;
        const magnitude = value < 0n ? -value : value;
        if (
          selectedMagnitude === undefined ||
          magnitude < selectedMagnitude
        ) {
          selectedRow = row;
          selectedColumn = col;
          selectedMagnitude = magnitude;
        }
      }
    }
    if (selectedRow === -1) break;
    if (selectedRow !== pivotIndex) swapRows(selectedRow, pivotIndex);
    if (selectedColumn !== pivotIndex) {
      swapColumns(selectedColumn, pivotIndex);
    }

    while (true) {
      let reduced = false;
      for (let row = pivotIndex + 1; row < matrix.rows; row += 1) {
        if (values[row][pivotIndex] === 0n) continue;
        const quotient =
          values[row][pivotIndex] / values[pivotIndex][pivotIndex];
        addRow(row, pivotIndex, -quotient);
        if (
          values[row][pivotIndex] !== 0n &&
          (
            values[row][pivotIndex] < 0n
              ? -values[row][pivotIndex]
              : values[row][pivotIndex]
          ) <
            (
              values[pivotIndex][pivotIndex] < 0n
                ? -values[pivotIndex][pivotIndex]
                : values[pivotIndex][pivotIndex]
            )
        ) {
          swapRows(row, pivotIndex);
        }
        reduced = true;
        break;
      }
      if (reduced) continue;

      for (let col = pivotIndex + 1; col < matrix.cols; col += 1) {
        if (values[pivotIndex][col] === 0n) continue;
        const quotient =
          values[pivotIndex][col] / values[pivotIndex][pivotIndex];
        addColumn(col, pivotIndex, -quotient);
        if (
          values[pivotIndex][col] !== 0n &&
          (
            values[pivotIndex][col] < 0n
              ? -values[pivotIndex][col]
              : values[pivotIndex][col]
          ) <
            (
              values[pivotIndex][pivotIndex] < 0n
                ? -values[pivotIndex][pivotIndex]
                : values[pivotIndex][pivotIndex]
            )
        ) {
          swapColumns(col, pivotIndex);
        }
        reduced = true;
        break;
      }
      if (reduced) continue;

      let offendingRow = -1;
      for (let row = pivotIndex + 1; row < matrix.rows; row += 1) {
        for (let col = pivotIndex + 1; col < matrix.cols; col += 1) {
          if (
            values[row][col] % values[pivotIndex][pivotIndex] !== 0n
          ) {
            offendingRow = row;
            break;
          }
        }
        if (offendingRow !== -1) break;
      }
      if (offendingRow === -1) break;
      addRow(pivotIndex, offendingRow, 1n);
    }
    if (values[pivotIndex][pivotIndex] < 0n) {
      negateRow(pivotIndex);
    }
  }

  return [
    make("ZZ", matrix.rows, matrix.cols, values.flat()),
    make("ZZ", matrix.rows, matrix.rows, left.flat()),
    make("ZZ", matrix.cols, matrix.cols, right.flat()),
  ];
}

function echelon(matrix, augmentedColumns = 0) {
  const values = asRationalRows(matrix);
  const coefficientColumns = matrix.cols - augmentedColumns;
  let pivotRow = 0;
  for (
    let pivotColumn = 0;
    pivotColumn < coefficientColumns && pivotRow < matrix.rows;
    pivotColumn += 1
  ) {
    let candidate = pivotRow;
    while (
      candidate < matrix.rows &&
      isZero(values[candidate][pivotColumn])
    ) {
      candidate += 1;
    }
    if (candidate === matrix.rows) continue;
    if (candidate !== pivotRow) {
      [values[candidate], values[pivotRow]] = [
        values[pivotRow],
        values[candidate],
      ];
    }
    const pivot = values[pivotRow][pivotColumn];
    for (let col = pivotColumn; col < matrix.cols; col += 1) {
      values[pivotRow][col] = div(values[pivotRow][col], pivot);
    }
    for (let row = 0; row < matrix.rows; row += 1) {
      if (row === pivotRow || isZero(values[row][pivotColumn])) continue;
      const multiple = values[row][pivotColumn];
      for (let col = pivotColumn; col < matrix.cols; col += 1) {
        values[row][col] = sub(
          values[row][col],
          mul(multiple, values[pivotRow][col]),
        );
      }
    }
    pivotRow += 1;
  }
  return { values, rank: pivotRow };
}

export function createPortableMatrixBackend() {
  function zzMatrix(rows, cols, entries) {
    return make("ZZ", rows, cols, entries.map((entry) => BigInt(entry)));
  }

  function qqMatrix(rows, cols, entries) {
    return make(
      "QQ",
      rows,
      cols,
      entries.map((entry) => rational(entry[0], entry[1])),
    );
  }

  function zzMatrixToQQ(matrix) {
    matrix = requireMatrix(matrix);
    if (matrix.kind !== "ZZ") {
      throw new TypeError("expected an integer matrix");
    }
    return make(
      "QQ",
      matrix.rows,
      matrix.cols,
      matrix.entries.map((entry) => rational(entry)),
    );
  }

  function matrixAdd(left, right) {
    return binary(
      left,
      right,
      left.kind === "ZZ"
        ? (a, b) => a + b
        : add,
    );
  }

  function matrixSub(left, right) {
    return binary(
      left,
      right,
      left.kind === "ZZ"
        ? (a, b) => a - b
        : sub,
    );
  }

  function matrixMul(left, right) {
    [left, right] = requireSameKind(left, right);
    if (left.cols !== right.rows) {
      throw new RangeError("matrix dimensions are incompatible for multiplication");
    }
    const zero = left.kind === "ZZ" ? 0n : rational(0n);
    const entries = [];
    for (let row = 0; row < left.rows; row += 1) {
      for (let col = 0; col < right.cols; col += 1) {
        let total = zero;
        for (let inner = 0; inner < left.cols; inner += 1) {
          const a = left.entries[row * left.cols + inner];
          const b = right.entries[inner * right.cols + col];
          total =
            left.kind === "ZZ"
              ? total + a * b
              : add(total, mul(a, b));
        }
        entries.push(total);
      }
    }
    return make(left.kind, left.rows, right.cols, entries);
  }

  function matrixNeg(matrix) {
    matrix = requireMatrix(matrix);
    return make(
      matrix.kind,
      matrix.rows,
      matrix.cols,
      matrix.entries.map((entry) =>
        matrix.kind === "ZZ" ? -entry : neg(entry),
      ),
    );
  }

  function matrixScalarMul(matrix, numerator, denominator) {
    matrix = requireMatrix(matrix);
    const scalar = rational(numerator, denominator);
    if (matrix.kind === "ZZ" && scalar.denominator !== 1n) {
      throw new TypeError("integer matrices require an integer scalar");
    }
    return make(
      matrix.kind,
      matrix.rows,
      matrix.cols,
      matrix.entries.map((entry) =>
        matrix.kind === "ZZ"
          ? entry * scalar.numerator
          : mul(entry, scalar),
      ),
    );
  }

  function matrixTranspose(matrix) {
    matrix = requireMatrix(matrix);
    const entries = [];
    for (let row = 0; row < matrix.cols; row += 1) {
      for (let col = 0; col < matrix.rows; col += 1) {
        entries.push(matrix.entries[col * matrix.cols + row]);
      }
    }
    return make(matrix.kind, matrix.cols, matrix.rows, entries);
  }

  function matrixEqual(left, right) {
    [left, right] = requireSameKind(left, right);
    if (left.rows !== right.rows || left.cols !== right.cols) return false;
    return left.entries.every((entry, index) => {
      const other = right.entries[index];
      return left.kind === "ZZ"
        ? entry === other
        : entry.numerator === other.numerator &&
            entry.denominator === other.denominator;
    });
  }

  function matrixEntry(matrix, row, col) {
    matrix = requireMatrix(matrix);
    if (
      !Number.isSafeInteger(row) ||
      !Number.isSafeInteger(col) ||
      row < 0 ||
      col < 0 ||
      row >= matrix.rows ||
      col >= matrix.cols
    ) {
      throw new RangeError("matrix index out of range");
    }
    return matrix.entries[row * matrix.cols + col];
  }

  function matrixDet(matrix) {
    matrix = requireMatrix(matrix);
    if (matrix.kind === "ZZ") return integerDeterminant(matrix);
    if (matrix.rows !== matrix.cols) {
      throw new RangeError("determinant requires a square matrix");
    }
    const values = asRationalRows(matrix);
    let answer = rational(1n);
    let sign = 1n;
    for (let col = 0; col < matrix.cols; col += 1) {
      let pivot = col;
      while (pivot < matrix.rows && isZero(values[pivot][col])) pivot += 1;
      if (pivot === matrix.rows) return rational(0n);
      if (pivot !== col) {
        [values[pivot], values[col]] = [values[col], values[pivot]];
        sign = -sign;
      }
      const pivotValue = values[col][col];
      answer = mul(answer, pivotValue);
      for (let row = col + 1; row < matrix.rows; row += 1) {
        if (isZero(values[row][col])) continue;
        const multiple = div(values[row][col], pivotValue);
        for (let inner = col; inner < matrix.cols; inner += 1) {
          values[row][inner] = sub(
            values[row][inner],
            mul(multiple, values[col][inner]),
          );
        }
      }
    }
    return sign < 0n ? neg(answer) : answer;
  }

  function matrixRank(matrix) {
    matrix = requireMatrix(matrix);
    return echelon(matrix).rank;
  }

  function matrixRref(matrix) {
    matrix = requireMatrix(matrix);
    const reduced = echelon(matrix);
    return make(
      "QQ",
      matrix.rows,
      matrix.cols,
      reduced.values.flat(),
    );
  }

  function matrixHermite(matrix) {
    return integerHermite(requireMatrix(matrix));
  }

  function matrixHermiteTransform(matrix) {
    matrix = requireMatrix(matrix);
    const data = integerHermiteData(matrix, true);
    return [
      data.matrix,
      make("ZZ", matrix.rows, matrix.rows, data.transform.flat()),
    ];
  }

  function matrixSmith(matrix) {
    return integerSmith(matrix);
  }

  function matrixRightKernel(matrix) {
    matrix = requireMatrix(matrix);
    if (matrix.kind === "ZZ") {
      const transpose = matrixTranspose(matrix);
      const data = integerHermiteData(transpose, true);
      const nullity = matrix.cols - data.rank;
      const rows = data.transform
        .slice(data.rank)
        .map((row) => row.slice());
      return integerHermite(
        make("ZZ", nullity, matrix.cols, rows.flat()),
      );
    }
    const reduced = echelon(matrix);
    const pivots = [];
    let pivotColumn = 0;
    for (let row = 0; row < reduced.rank; row += 1) {
      while (
        pivotColumn < matrix.cols &&
        isZero(reduced.values[row][pivotColumn])
      ) {
        pivotColumn += 1;
      }
      pivots.push(pivotColumn);
      pivotColumn += 1;
    }
    const rows = [];
    for (let freeColumn = 0; freeColumn < matrix.cols; freeColumn += 1) {
      if (pivots.includes(freeColumn)) continue;
      const row = Array.from(
        { length: matrix.cols },
        () => rational(0n),
      );
      row[freeColumn] = rational(1n);
      for (let index = 0; index < pivots.length; index += 1) {
        row[pivots[index]] = neg(
          reduced.values[index][freeColumn],
        );
      }
      rows.push(row);
    }
    const raw = make(
      "QQ",
      rows.length,
      matrix.cols,
      rows.flat(),
    );
    return matrixRref(raw);
  }

  function matrixCharpoly(matrix) {
    matrix = requireMatrix(matrix);
    if (matrix.rows !== matrix.cols) {
      throw new RangeError(
        "characteristic polynomial requires a square matrix",
      );
    }
    const degree = matrix.rows;
    const exact = matrix.kind === "QQ"
      ? matrix
      : zzMatrixToQQ(matrix);
    let auxiliary = make(
      "QQ",
      degree,
      degree,
      Array.from(
        { length: degree * degree },
        (_, index) =>
          rational(
            Math.floor(index / degree) === index % degree ? 1n : 0n,
          ),
      ),
    );
    const descending = [rational(1n)];
    for (let step = 1; step <= degree; step += 1) {
      const product = matrixMul(exact, auxiliary);
      let trace = rational(0n);
      for (let index = 0; index < degree; index += 1) {
        trace = add(
          trace,
          product.entries[index * degree + index],
        );
      }
      const coefficient = neg(div(trace, rational(BigInt(step))));
      descending.push(coefficient);
      const entries = product.entries.slice();
      for (let index = 0; index < degree; index += 1) {
        const diagonal = index * degree + index;
        entries[diagonal] = add(entries[diagonal], coefficient);
      }
      auxiliary = make("QQ", degree, degree, entries);
    }
    const ascending = descending.reverse();
    if (matrix.kind === "QQ") return ascending;
    return ascending.map((coefficient) => {
      if (coefficient.denominator !== 1n) {
        throw new Error(
          "integer characteristic polynomial was not integral",
        );
      }
      return coefficient.numerator;
    });
  }

  function matrixSolve(left, right) {
    left = requireMatrix(left);
    right = requireMatrix(right);
    if (left.rows !== left.cols || right.rows !== left.rows) {
      throw new RangeError("solve requires a square matrix and compatible right side");
    }
    const rows = left.rows;
    const cols = right.cols;
    const entries = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < left.cols; col += 1) {
        const value = left.entries[row * left.cols + col];
        const exact = asRational(value, left.kind);
        entries.push([exact.numerator, exact.denominator]);
      }
      for (let col = 0; col < cols; col += 1) {
        const value = right.entries[row * right.cols + col];
        const exact = asRational(value, right.kind);
        entries.push([exact.numerator, exact.denominator]);
      }
    }
    const augmented = qqMatrix(rows, left.cols + cols, entries);
    const reduced = echelon(augmented, cols);
    if (reduced.rank !== rows) {
      throw new RangeError("matrix is singular");
    }
    const solution = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        solution.push(reduced.values[row][left.cols + col]);
      }
    }
    return make("QQ", rows, cols, solution);
  }

  function matrixInverse(matrix) {
    matrix = requireMatrix(matrix);
    if (matrix.rows !== matrix.cols) {
      throw new RangeError("inverse requires a square matrix");
    }
    const entries = [];
    for (let row = 0; row < matrix.rows; row += 1) {
      for (let col = 0; col < matrix.cols; col += 1) {
        entries.push(row === col ? 1n : 0n);
      }
    }
    return matrixSolve(matrix, zzMatrix(matrix.rows, matrix.cols, entries));
  }

  return Object.freeze({
    zzMatrix,
    qqMatrix,
    zzMatrixToQQ,
    matrixAdd,
    matrixSub,
    matrixMul,
    matrixNeg,
    matrixScalarMul,
    matrixTranspose,
    matrixEqual,
    matrixEntry,
    matrixDet,
    matrixRank,
    matrixRref,
    matrixHermite,
    matrixHermiteTransform,
    matrixSmith,
    matrixRightKernel,
    matrixCharpoly,
    matrixSolve,
    matrixInverse,
  });
}
