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
    matrixSolve,
    matrixInverse,
  });
}
