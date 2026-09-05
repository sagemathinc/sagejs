"""Private bounded binary64 expression-machine core.

The selected Python body is the dynamic oracle and source for native lowering.
This is not yet a public evaluator or an enabled solver backend. Programs use
parallel opcode/operand arrays and prior-result references; loops and host calls
are impossible. Buffers must be non-aliasing and exclusively owned by the caller.
Status 0 succeeds, 1 rejects program/storage, 2 rejects the real domain, and 3
rejects a nonfinite value. Output is unchanged on failure; discard scratch.
"""

from math import sqrt

from sagejs.native import Float64Buffer, UInt64Buffer, native, uint64


@native
def evaluate_program(
    opcodes: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    constants: Float64Buffer,
    inputs: Float64Buffer,
    scratch: Float64Buffer,
    output: Float64Buffer,
    count: uint64,
) -> float:
    """Evaluate finite real instructions without callbacks or result allocation.

    Opcodes: 0 constant, 1 input, 2 negation, 3 absolute value, 4 square root,
    5 addition, 6 subtraction, 7 multiplication, 8 division. Operand references
    for arithmetic must precede their instruction. No algebraic reassociation
    is performed. The caller also enforces its stricter per-job work budget.
    """
    if count < 1:
        return 1.0
    if count > 1000000:
        return 1.0
    if count > len(opcodes):
        return 1.0
    if count > len(left):
        return 1.0
    if count > len(right):
        return 1.0
    if count > len(scratch):
        return 1.0
    if len(output) < 1:
        return 1.0
    maximum = 1.7976931348623157e308
    for index in range(count):
        operation = opcodes[index]
        first = left[index]
        second = right[index]
        value = 0.0
        if operation == 0:
            if first >= len(constants):
                return 1.0
            value = constants[first]
        elif operation == 1:
            if first >= len(inputs):
                return 1.0
            value = inputs[first]
        elif operation <= 8:
            if first >= index:
                return 1.0
            lhs = scratch[first]
            if operation == 2:
                value = -lhs
            elif operation == 3:
                value = abs(lhs)
            elif operation == 4:
                if lhs < 0.0:
                    return 2.0
                value = sqrt(lhs)
            else:
                if second >= index:
                    return 1.0
                rhs = scratch[second]
                if operation == 5:
                    value = lhs + rhs
                elif operation == 6:
                    value = lhs - rhs
                elif operation == 7:
                    value = lhs * rhs
                else:
                    if rhs == 0.0:
                        return 2.0
                    value = lhs / rhs
        else:
            return 1.0
        if value != value:
            return 3.0
        if abs(value) > maximum:
            return 3.0
        scratch[index] = value
    output[0] = scratch[count - 1]
    return 0.0
