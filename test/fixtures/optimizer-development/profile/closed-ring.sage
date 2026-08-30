from sagejs.compiler import optimize

R = Zmod(1009)

@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="adaptive",
    guard_failure="error",
)
def recurrence(count, value, multiplier, increment):
    for step in range(count):
        value = value*multiplier + increment
    return value

answer = recurrence(5_000_000, R(1), R(37), R(11))
print(answer)
