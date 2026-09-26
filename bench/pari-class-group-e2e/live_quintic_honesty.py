"""Live successful `be_honest` corridor for the frozen row-21 quintic.

This host-level root owns only the outer `buch2.c:2800-2865` schedule.  Prime
ideals are rebuilt from neutral factor-base descriptors and the prepared number
field multiplication table; the supplied collector is the existing no-cache
Fincke--Pohst translation.  The selected corridor has no retries, hence it
does not read or advance the supplied RNG state.
"""


def _multiplication_matrix(basis_table, generator, n):
    """Translate `zk_multable`/`zk_ei_mul` for an integral basis."""
    if len(basis_table) != n * n * n or len(generator) != n:
        raise ValueError("invalid prepared number-field data")
    out = [0] * (n * n)
    for k in range(n):
        out[k * n] = generator[k]
    for i in range(1, n):
        for k in range(n):
            value = 0
            for j in range(n):
                value += basis_table[(i * n + j) * n + k] * generator[j]
            out[k * n + i] = value
    return out


def _prime_modulus_hnf(original, n, prime):
    """Translate `FpM_echelon`, `FpM_hnfend`, and `ZM_hnfmodprime`."""
    work = [value % prime for value in original]
    output = [0] * (n * n)
    pivots = [-1] * n
    for i in range(n):
        output[i * n + i] = prime
    remaining = n
    for row in range(n - 1, -1, -1):
        column = remaining - 1
        while column >= 0 and work[row * n + column] == 0:
            column -= 1
        if column < 0:
            continue
        destination = remaining - 1
        pivot = work[row * n + column]
        if column != destination:
            for i in range(n):
                a = i * n + destination
                b = i * n + column
                work[a], work[b] = work[b], work[a]
        if pivot != 1:
            inverse = pow(pivot, -1, prime)
            for i in range(row):
                work[i * n + destination] = work[i * n + destination] * inverse % prime
        work[row * n + destination] = 1
        for j in range(destination - 1, -1, -1):
            multiplier = work[row * n + j]
            if multiplier:
                for i in range(n):
                    work[i * n + j] -= multiplier * work[i * n + destination]
                for i in range(row):
                    work[i * n + j] %= prime
        pivots[destination] = row
        remaining -= 1
    if remaining == 0:
        return [1 if i == j else 0 for i in range(n) for j in range(n)]
    for j in range(remaining, n):
        for i in range(n):
            output[i * n + pivots[j]] = work[i * n + j]
    for i in range(n - 1, -1, -1):
        if output[i * n + i] == 1:
            for j in range(i + 1, n):
                multiplier = output[i * n + j]
                if multiplier:
                    for k in range(n):
                        output[k * n + j] -= multiplier * output[k * n + i]
                    for k in range(i):
                        output[k * n + j] %= prime
        else:
            for j in range(i + 1, n):
                output[i * n + j] %= prime
    return output


def _prime_ideal_hnf(basis_table, descriptor, n):
    prime = descriptor["p"]
    if descriptor["inert"]:
        return [prime if i == j else 0 for i in range(n) for j in range(n)]
    generator = tuple(map(int, descriptor["generator"]))
    multiplication = _multiplication_matrix(basis_table, generator, n)
    return _prime_modulus_hnf(multiplication, n, prime)


def live_quintic_honesty(nf, factor_base, kcz, kcz2, subfb, rng, collect):
    """Execute the immediate-success unequal-bound honesty suffix.

    `nf` contains a degree and integral-basis multiplication table.  The raw
    factor base is a list in `F.FB` order; every entry contains its `F.LV`
    prime descriptors.  `collect(ideal, norm, probe_index)` must invoke the
    actual no-cache collector and return its status.  A zero status is outside
    this selected no-retry corridor and is rejected before state publication.
    """
    n = int(nf["degree"])
    basis_table = tuple(map(int, nf["basis_table"]))
    groups = factor_base["groups"]
    if n != 5 or len(groups) < kcz2 or not (0 <= kcz < kcz2):
        raise ValueError("invalid row-21 honesty owner state")
    # These owners are deliberately snapshotted: the successful source path
    # restores KCZ and performs no random draw or subfactor operation.
    rng_snapshot = tuple(rng)
    subfb_snapshot = tuple(subfb)
    initial_kcz = int(kcz)
    probes = []
    transient_kcz = initial_kcz
    for iz in range(initial_kcz, int(kcz2)):
        group = groups[iz]
        ideals = group["ideals"]
        effective = len(ideals)
        if effective and int(ideals[-1]["e"]) == 1:
            effective -= 1
        if effective == 0:
            continue
        for j in range(effective):
            descriptor = ideals[j]
            ideal = _prime_ideal_hnf(basis_table, descriptor, n)
            norm = int(descriptor["p"]) ** int(descriptor["f"])
            status = int(collect(ideal, norm, len(probes)))
            probes.append(
                {
                    "iz": iz + 1,
                    "p": int(group["p"]),
                    "j": j + 1,
                    "norm": norm,
                    "ideal": ideal,
                    "status": status,
                }
            )
            if status != 1:
                raise ValueError(
                    "collector left the selected immediate-success corridor"
                )
        transient_kcz += 1
    if tuple(rng) != rng_snapshot or tuple(subfb) != subfb_snapshot:
        raise ValueError("honesty child mutated borrowed RNG or subfactor state")
    return {
        "success": 1,
        "initial_kcz": initial_kcz,
        "transient_kcz": transient_kcz,
        "final_kcz": initial_kcz,
        "rng": list(rng_snapshot),
        "subfb": list(subfb_snapshot),
        "probes": probes,
    }
