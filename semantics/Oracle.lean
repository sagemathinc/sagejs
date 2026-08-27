import SageSemantics

/-!
# The model as an oracle

A model that is never run against the thing it models is a claim, not a check.
This executable prints what the model says the runtime must do, for cases the
model itself chooses -- the boundaries its theorems are about -- and
`tools/check-oracle.cjs` runs the same cases through the real runtime and
compares.

Each line is `left <TAB> right <TAB> int|float <TAB> value`, where the kind is
whether the model's abstraction function denotes an integer at all. That
distinction is the point: at these magnitudes a wrong answer does not look
wrong, it stops being an integer.
-/

open SageSemantics

/-- How the runtime stores an integer literal: a number while it is safe, a
bigint once it is not.  This is `normalize_integer`'s rule. -/
def literalValue (value : Int) : JsValue :=
  if minSafeInteger ≤ value && value ≤ maxSafeInteger then
    .num (.ofInt value)
  else
    .bigint value

/-- An operand as it is written in the Python source. -/
inductive Operand where
  | int (value : Int)
  | bool (flag : Bool)

def Operand.toValue : Operand → JsValue
  | .int value => literalValue value
  | .bool flag => .bool flag

def Operand.toPython : Operand → String
  | .int value => toString value
  | .bool flag => if flag then "True" else "False"

/-- `2^53 - 1`, the last integer a double holds without company. -/
def maxSafe : Int := 9007199254740991

/--
The cases the model asks about.

They are the ones its theorems concern: either side of the safe-integer
boundary, in both representations, both signs, and with booleans -- which is
where the addition was found to be wrong.
-/
def vectors : List (Operand × Operand) :=
  let ints : List Int :=
    [0, 1, -1, 2, maxSafe, maxSafe - 1, -maxSafe, maxSafe + 1, maxSafe + 2,
      2 * maxSafe, -(maxSafe + 1), 4503599627370496]
  let bools : List Operand := [.bool true, .bool false]
  let intOperands := ints.map Operand.int
  -- every integer against the boundary values, and every boolean against every
  -- integer in both orders
  (intOperands.flatMap fun left =>
    [Operand.int maxSafe, Operand.int (maxSafe - 1), Operand.int 1,
      Operand.int (maxSafe + 1)].map fun right => (left, right))
  ++ (bools.flatMap fun flag => intOperands.map fun other => (flag, other))
  ++ (bools.flatMap fun flag => intOperands.map fun other => (other, flag))
  ++ (bools.flatMap fun left => bools.map fun right => (left, right))

def main : IO Unit := do
  for (left, right) in vectors do
    let answer := (operatorAddExact left.toValue right.toValue).denote
    let rendered :=
      match answer with
      | some value => s!"int\t{value}"
      | none => "float\t-"
    IO.println s!"{left.toPython}\t{right.toPython}\t{rendered}"
