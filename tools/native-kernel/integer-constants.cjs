"use strict";

// Deliberately partial: unknown names, effects, unsupported operators and
// exceptional arithmetic must go through normal lowering, never become a
// guessed constant. Callers supply their own literal and binding policies.
function evaluateIntegerConstant(node, literal, lookup) {
  const value = literal(node);
  if (value !== undefined) return value;
  const kind = node?.constructor?.name;
  if (kind === "AST_SymbolRef") return lookup(node.name);
  if (kind !== "AST_Binary") return undefined;
  const left = evaluateIntegerConstant(node.left, literal, lookup);
  const right = evaluateIntegerConstant(node.right, literal, lookup);
  if (left === undefined || right === undefined) return undefined;
  switch (node.operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "//": {
      if (right === 0n) return undefined;
      const quotient = left / right;
      const remainder = left % right;
      // BigInt division truncates; Python division floors toward -infinity.
      return remainder !== 0n && (left < 0n) !== (right < 0n)
        ? quotient - 1n : quotient;
    }
    case "%": {
      if (right === 0n) return undefined;
      const remainder = left % right;
      return remainder !== 0n && (left < 0n) !== (right < 0n)
        ? remainder + right : remainder;
    }
    case "<<":
      if (right < 0n || right > 65536n) return undefined;
      return left << right;
    case ">>":
      if (right < 0n || right > 65536n) return undefined;
      return left >> right;
    default: return undefined;
  }
}

module.exports = { evaluateIntegerConstant };
