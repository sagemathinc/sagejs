/-!
# The JavaScript value fragment that the exact-integer path runs in

Sage.js stores a Python integer as *either* a JavaScript `number` or a
`bigint`, and decides which by magnitude.  Everything interesting about that
choice happens at `2^53`, where a `number` stops holding every integer, so the
fragment modeled here is the one those decisions inspect: the storage kind of a
value, whether a `number` is a safe integer, and what `+` does to two of them.

Nothing here is executable arithmetic for its own sake.  A `Num` records the
integer a double holds because that is the only thing the integer path ever
asks of one; a double holding a non-integer answers every predicate on this
path the same way whatever its value, so it is a single opaque constructor.
Dyadic rationals replace it when the float layer arrives.
-/

namespace SageSemantics

/-- `Number.MAX_SAFE_INTEGER`, the largest integer with no double sharing its
representation. -/
def maxSafeInteger : Int := 9007199254740991

/-- `Number.MIN_SAFE_INTEGER`. -/
def minSafeInteger : Int := -9007199254740991

/-- `2 ^ 53`, one past the last exactly represented integer. -/
def twoPow53 : Nat := 9007199254740992

/--
The spacing of the binary64 grid at a given magnitude.

Doubles land on every integer below `2^53`.  Above it the significand runs
out and only every second integer is representable, then every fourth, and so
on -- which is why an integer sum that crosses `2^53` cannot be trusted to be
the sum.
-/
def gridStep (magnitude : Nat) : Nat :=
  if magnitude < twoPow53 then 1
  else if magnitude < 2 * twoPow53 then 2
  else 2 ^ (Nat.log2 magnitude - 52)

/-- Round an integer to a multiple of `step`, halves going to the even
multiple, which is what binary64 does with a value it cannot hold. -/
def roundHalfEven (value : Int) (step : Nat) : Int :=
  if step ≤ 1 then
    value
  else
    let divisor : Int := (step : Int)
    let quotient := Int.ediv value divisor
    let remainder := Int.emod value divisor
    if 2 * remainder < divisor then
      quotient * divisor
    else if divisor < 2 * remainder then
      (quotient + 1) * divisor
    else if Int.emod quotient 2 = 0 then
      quotient * divisor
    else
      (quotient + 1) * divisor

/-- The double nearest an integer: itself while the integer is small enough to
be held, and a neighbour on the grid once it is not. -/
def roundIntToDouble (value : Int) : Int :=
  roundHalfEven value (gridStep value.natAbs)

/-- Below `2^53` a double holds an integer exactly, so rounding is the
identity.  Every fast path in the integer layer rests on this. -/
theorem roundIntToDouble_eq_self {value : Int} (h : value.natAbs < twoPow53) :
    roundIntToDouble value = value := by
  unfold roundIntToDouble gridStep
  simp [h, roundHalfEven]

/--
A binary64 value, seen from the exact-integer path.

`ofInt` is a double that holds exactly that integer; `nonIntegral` is any
double that does not hold an integer, including the infinities and NaN.  The
integer path never reads the value of the latter -- it only asks whether it is
a safe integer, and the answer is no.
-/
inductive Num where
  /-- a double whose value is exactly this integer -/
  | ofInt (value : Int)
  /-- a double that is not an integer -/
  | nonIntegral
  deriving DecidableEq, Repr

/-- `Number.isSafeInteger`. -/
def Num.isSafeInteger : Num → Bool
  | .ofInt value => minSafeInteger ≤ value && value ≤ maxSafeInteger
  | .nonIntegral => false

/-- Addition of two doubles, which rounds once. -/
def Num.add : Num → Num → Num
  | .ofInt left, .ofInt right => .ofInt (roundIntToDouble (left + right))
  | _, _ => .nonIntegral

/--
The JavaScript values the integer path can hold.

`boxedFloat` is the boxed `Number` that Sage.js uses for a Python float whose
value happens to be integral (`_builtins_box_float`, `builtins.py:787`).  It
matters here because it reports its storage kind as `"number"` while its
`typeof` is `"object"`.
-/
inductive JsValue where
  | num (double : Num)
  | bigint (value : Int)
  | bool (value : Bool)
  | str (value : String)
  | boxedFloat (double : Num)
  /-- anything else: an object the integer path does not handle -/
  | obj
  deriving DecidableEq, Repr

/-- `typeof`. -/
def JsValue.jstype : JsValue → String
  | .num _ => "number"
  | .bigint _ => "bigint"
  | .bool _ => "boolean"
  | .str _ => "string"
  | .boxedFloat _ => "object"
  | .obj => "object"

/-- `ρσ_python_jstype` (`builtins.py:260`): `typeof`, except that a boxed
Python float answers `"number"` so that the arithmetic paths treat it as one. -/
def JsValue.pythonJstype : JsValue → String
  | .boxedFloat _ => "number"
  | value => value.jstype

/-- The double a value contributes to a JavaScript `+`.  A `bigint` never
reaches this: mixing one with a number throws, and the integer path routes
those through its own conversion first. -/
def JsValue.toDouble : JsValue → Num
  | .num double => double
  | .boxedFloat double => double
  | .bool value => .ofInt (if value then 1 else 0)
  | _ => .nonIntegral

/-- `BigInt(value)` where the value is known to be an exact integer. -/
def JsValue.toBigInt : JsValue → Option Int
  | .bigint value => some value
  | .num (.ofInt value) => some value
  | .bool value => some (if value then 1 else 0)
  | _ => none

/-- `Number(value)` on a bigint, which rounds to the nearest double. -/
def numberOfBigInt (value : Int) : Num := .ofInt (roundIntToDouble value)

/-- The `+` of the language, on the fragment the integer path uses it in. -/
def nativeAdd : JsValue → JsValue → JsValue
  | .bigint left, .bigint right => .bigint (left + right)
  | .str left, .str right => .str (left ++ right)
  | left, right => .num (Num.add left.toDouble right.toDouble)

/-- `-` of the language. -/
def nativeSub : JsValue → JsValue → JsValue
  | .bigint left, .bigint right => .bigint (left - right)
  | left, right =>
    .num (Num.add left.toDouble (match right.toDouble with
      | .ofInt value => .ofInt (-value)
      | .nonIntegral => .nonIntegral))

end SageSemantics
