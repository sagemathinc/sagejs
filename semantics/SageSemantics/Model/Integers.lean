import SageSemantics.Js.Value

/-!
# The exact-integer algorithms, as Sage.js writes them

Each definition follows one function of the runtime, branch for branch and in
the same order, with the source it follows named above it.  Where a branch
leaves the integer fragment -- a coercion into a Sage parent, a `__add__` on a
user class -- the model stops at `unsupported` rather than guessing.  A theorem
that reached one of those would fail to prove, which is the point: it would
mean the fragment was drawn wrongly.
-/

namespace SageSemantics

/-- What a runtime function returns, including the two ways it can decline: by
raising, or by being outside the fragment modeled here. -/
inductive Result where
  | ok (value : JsValue)
  /-- `raise TypeError(...)` -/
  | typeError (message : String)
  /-- a branch that leaves the exact-integer fragment -/
  | unsupported (reason : String)
  deriving DecidableEq, Repr

/-- `is_exact_integer` (`algebra.py:22`). -/
def isExactInteger (value : JsValue) : Bool :=
  match value with
  | .bigint _ => true
  | .num double => double.isSafeInteger
  | _ => false

/-- `normalize_integer` (`algebra.py:28`): the canonical form, where a bigint
small enough to be a number becomes one. -/
def normalizeInteger (value : JsValue) : Result :=
  match value with
  | .num double =>
    if double.isSafeInteger then .ok (.num double)
    else .typeError "expected an exact integer"
  | .bigint value =>
    if minSafeInteger ≤ value && value ≤ maxSafeInteger then
      .ok (.num (numberOfBigInt value))
    else
      .ok (.bigint value)
  | _ => .typeError "expected an exact integer"

/-- `_builtins_exact_integer_primitive` (`builtins.py:604`).  A boolean counts:
Python's `True` is `1`, and the arithmetic paths rely on it. -/
def exactIntegerPrimitive (value : JsValue) : Bool :=
  match value with
  | .bool _ => true
  | .bigint _ => true
  | .num double => double.isSafeInteger
  | _ => false

/--
`_builtins_is_python_float` (`builtins.py:756`).

Note what this means together with `exactIntegerPrimitive`: a `number` that is
not a safe integer *is a float*.  There is no third possibility, so a stray
out-of-range `number` does not become a wrong integer -- it stops being an
integer at all.
-/
def isPythonFloat (value : JsValue) : Bool :=
  match value with
  | .num double => !double.isSafeInteger
  | .boxedFloat _ => true
  | _ => false

/-- `ρσ_float_result` (`builtins.py:803`): an integral result keeps its float
identity by being boxed. -/
def floatResult : Num → JsValue
  | .ofInt value => .boxedFloat (.ofInt value)
  | .nonIntegral => .num .nonIntegral

/-- Whether a double lies within the safe-integer window, as the runtime tests
it with `<=` and `>=` against the two constants. -/
def withinSafeWindow : Num → Bool
  | .ofInt value => minSafeInteger ≤ value && value ≤ maxSafeInteger
  | .nonIntegral => false

/-- `BigInt(...)` on a value the caller has already established is an exact
integer primitive. -/
def bigintOf (value : JsValue) : Option Int := value.toBigInt

/--
`ρσ_operator_add_exact` (`builtins.py:918`).

The shape worth watching is the first branch: two numbers are added as
doubles, and the exact answer is recovered in BigInt *only* when both operands
were safe integers.  Whether that is enough is what `addExact_sound` settles.
-/
def operatorAddExact (left right : JsValue) : Result :=
  let leftType := left.pythonJstype
  let rightType := right.pythonJstype
  if leftType = rightType && (leftType = "number" || leftType = "bigint" || leftType = "string") then
    let result := nativeAdd left right
    if leftType ≠ "number" then
      .ok result
    else if isPythonFloat left || isPythonFloat right then
      .ok (floatResult result.toDouble)
    else if result = .num (.ofInt 0) then
      .ok (.num (.ofInt 0))
    else if withinSafeWindow result.toDouble then
      .ok result
    else
      match left.toDouble.isSafeInteger && right.toDouble.isSafeInteger,
            bigintOf left, bigintOf right with
      | true, some leftValue, some rightValue => .ok (.bigint (leftValue + rightValue))
      | _, _, _ => .ok result
  else if (leftType = "bigint" || rightType = "bigint")
      && exactIntegerPrimitive left && exactIntegerPrimitive right then
    match bigintOf left, bigintOf right with
    | some leftValue, some rightValue => .ok (.bigint (leftValue + rightValue))
    | _, _ => .unsupported "bigint operand without an integer value"
  else if left = .obj || right = .obj then
    -- `is_math_element`, `__add__`, `__radd__` and `concat` all live here; the
    -- integer fragment never reaches them.
    .unsupported "object operand"
  else if (leftType = "string" || rightType = "string") && leftType ≠ rightType then
    .typeError "can only concatenate str to str"
  else if leftType = "object" || rightType = "object" then
    .typeError "unsupported operand type(s) for +"
  else if leftType ≠ "number" || rightType ≠ "number" then
    -- Where a boolean operand lands: `true + 1` is `2`, a number.
    .ok (nativeAdd left right)
  else
    let result := nativeAdd left right
    if isPythonFloat left || isPythonFloat right then
      .ok (floatResult result.toDouble)
    else if withinSafeWindow result.toDouble then
      .ok result
    else
      match left.toDouble.isSafeInteger && right.toDouble.isSafeInteger,
            bigintOf left, bigintOf right with
      | true, some leftValue, some rightValue => .ok (.bigint (leftValue + rightValue))
      | _, _, _ => .ok result

end SageSemantics
