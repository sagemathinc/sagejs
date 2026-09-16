"""PARI 2.17.4 add_rel_i state machine over resident integer buffers.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Generator objects are represented by caller-owned nonzero identifiers; this
does not construct, clone or evaluate the underlying field elements.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_prepared_set_fact(
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
    count: int,
    subfactor: IntegerBuffer,
    extra: IntegerBuffer,
    extra_count: int,
    relation: IntegerBuffer,
) -> int:
    """Translate set_fact, retaining its hint even after cancellation.

    Repeated factor entries overwrite rather than accumulate. Extra powers
    accumulate in subfactor order. -1 extra_count represents a NULL vector.
    """
    size = int(len(relation))
    if count < 0 or count > len(indices) or count > len(exponents):
        raise ValueError("invalid factor entry count")
    if extra_count < -1 or extra_count > len(extra) or extra_count > len(subfactor):
        raise ValueError("invalid extra exponent count")
    for cell in range(size):
        relation[cell] = 0
    nz = size + 1
    for entry in range(count):
        ideal = indices[entry]
        if ideal < 1 or ideal > size:
            raise ValueError("factor ideal out of range")
        if ideal < nz:
            nz = ideal
        relation[ideal - 1] = exponents[entry]
    for entry in range(extra_count):
        if extra[entry] != 0:
            ideal = subfactor[entry]
            if ideal < 1 or ideal > size:
                raise ValueError("subfactor ideal out of range")
            relation[ideal - 1] += extra[entry]
            if ideal < nz:
                nz = ideal
    return nz


@native
def pari_prepared_insert_fact(
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
    count: int,
    subfactor: IntegerBuffer,
    extra: IntegerBuffer,
    extra_count: int,
    generator: int,
    random_relation: int,
    state: IntegerBuffer,
    basis: IntegerBuffer,
    records: IntegerBuffer,
    hashes: IntegerBuffer,
    metadata: IntegerBuffer,
    relation: IntegerBuffer,
    scratch: IntegerBuffer,
) -> tuple[int, int, int]:
    """Connect factor-vector assembly to insertion without automorphism images."""
    nz = pari_prepared_set_fact(
        indices, exponents, count, subfactor, extra, extra_count, relation
    )
    status, appended = pari_prepared_add_relation(
        relation,
        nz,
        generator,
        0,
        0,
        random_relation,
        state,
        basis,
        records,
        hashes,
        metadata,
        scratch,
    )
    return status, appended, nz


@native
def pari_prepared_initialize_relations(
    additional: int,
    primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    complete: IntegerBuffer,
    ramification: IntegerBuffer,
    state: IntegerBuffer,
    basis: IntegerBuffer,
    records: IntegerBuffer,
    hashes: IntegerBuffer,
    metadata: IntegerBuffer,
    relation: IntegerBuffer,
    scratch: IntegerBuffer,
) -> int:
    """Initialize a fresh cache and build complete-prime-group relations.

    Input groups are active FB order; offsets index the active ideal vector.
    state extends add_rel_i's four slots with checkpoint and target offsets.
    The caller allocates PARI's 10*(KC+additional)+50 record capacity.
    Initial generators are the rational primes themselves, not opaque IDs.
    """
    size = int(len(relation))
    groups = len(primes)
    capacity = 10 * (size + additional) + 50
    if additional < 0 or len(state) < 6 or len(basis) < size * size:
        raise ValueError("invalid initial relation state")
    if len(offsets) != groups or len(counts) != groups or len(complete) != groups:
        raise ValueError("invalid initial prime groups")
    if len(ramification) != size or len(scratch) < size:
        raise ValueError("invalid initial ideal data")
    if (
        len(records) < capacity * size
        or len(hashes) < capacity
        or len(metadata) < capacity * 3
    ):
        raise ValueError("insufficient initial relation allocation")
    for cell in range(size * size):
        basis[cell] = 0
    state[0] = 0
    state[1] = capacity
    state[2] = size
    state[3] = additional
    state[4] = 0
    state[5] = size + additional
    for group in range(groups):
        if complete[group] != 0:
            start = offsets[group]
            count = counts[group]
            if start < 0 or count < 1 or start + count > size or primes[group] < 2:
                raise ValueError("invalid complete prime group")
            for cell in range(size):
                relation[cell] = 0
            j = count - 1
            while j >= 0:
                relation[start + j] = ramification[start + j]
                j -= 1
            result, appended = pari_prepared_add_relation(
                relation,
                start + 1,
                primes[group],
                0,
                0,
                0,
                state,
                basis,
                records,
                hashes,
                metadata,
                scratch,
            )
    return state[0]


@native
def pari_relation_mod_inverse(value: int) -> int:
    """The relation cache's fixed-modulus Fl_inv."""
    return pari_word_mod_inverse(value, 27449)


@native
def pari_word_mod_inverse(value: int, modulus: int) -> int:
    """Preserve Fl_inv/xgcduu(f=1), including unsigned subtraction wrap."""
    word = 1 << 64
    if modulus < 2 or modulus >= word:
        raise ValueError("modulus is outside the pinned PARI word domain")
    d = modulus
    d1 = value % word
    xv = 0
    xv1 = 1
    swapped = 0
    while d1 > 1:
        d = (d - d1) % word
        if d >= d1:
            quotient = 1 + d // d1
            d %= d1
            xv = (xv + quotient * xv1) % word
        else:
            xv = (xv + xv1) % word
        if d <= 1:
            swapped = 1
            break
        d1 = (d1 - d) % word
        if d1 >= d:
            quotient = 1 + d1 // d
            d1 %= d
            xv1 = (xv1 + quotient * xv) % word
        else:
            xv1 = (xv1 + xv) % word
    if swapped != 0:
        gcd = d1
        if d == 1:
            gcd = 1
        result = modulus - xv % modulus
    else:
        gcd = d
        if d1 == 1:
            gcd = 1
        result = xv1 % modulus
    if gcd != 1 or result == 0:
        raise ZeroDivisionError("noninvertible relation pivot")
    return result


@native
def pari_prepared_add_relation(
    relation: IntegerBuffer,
    nz: int,
    generator: int,
    original: int,
    automorphism: int,
    random_relation: int,
    state: IntegerBuffer,
    basis: IntegerBuffer,
    records: IntegerBuffer,
    hashes: IntegerBuffer,
    metadata: IntegerBuffer,
    scratch: IntegerBuffer,
) -> tuple[int, int]:
    """Return upstream k and whether a record was appended.

    State is [last, capacity, missing, relsup]. Basis is column-major n*n;
    records are consecutive length-n vectors; metadata holds generator id,
    relative original index and automorphism id for each record. nz is the
    upstream one-based first-nonzero hint, not recomputed here.
    """
    n = int(len(relation))
    if len(state) < 4 or nz < 1 or nz > n + 1:
        raise ValueError("invalid relation cache state")
    last = state[0]
    capacity = state[1]
    if last < 0 or capacity < last or len(basis) < n * n or len(scratch) < n:
        raise ValueError("invalid relation cache dimensions")
    if (
        len(records) < capacity * n
        or len(hashes) < capacity
        or len(metadata) < capacity * 3
    ):
        raise ValueError("insufficient relation cache storage")
    k = 0
    if nz != n + 1:
        row = last - 1
        while row >= 0:
            if hashes[row] == nz:
                index = nz - 1
                while index < n and relation[index] == records[row * n + index]:
                    index += 1
                if index == n:
                    return -1, 0
            row -= 1
        if last >= capacity:
            return 0, 0
        if state[2] != 0:
            for copied in range(n):
                scratch[copied] = relation[copied]
            k = n
            while k > 0 and scratch[k - 1] == 0:
                k -= 1
            while k > 0:
                column = (k - 1) * n
                if basis[column + k - 1] != 0:
                    ak = scratch[k - 1]
                    for i in range(k - 1):
                        if basis[column + i] != 0:
                            scratch[i] = (
                                (scratch[i] + ak * (27449 - basis[column + i]))
                                % (1 << 64)
                            ) % 27449
                    scratch[k - 1] = 0
                    while k > 0 and scratch[k - 1] == 0:
                        k -= 1
                else:
                    inverse = pari_relation_mod_inverse(scratch[k - 1])
                    i = k - 2
                    while i >= 0:
                        ai = scratch[i]
                        base = i * n
                        if ai != 0 and basis[base + i] != 0:
                            ai = 27449 - ai
                            for j in range(i):
                                if basis[base + j] != 0:
                                    scratch[j] = (
                                        (scratch[j] + ai * basis[base + j]) % (1 << 64)
                                    ) % 27449
                            scratch[i] = 0
                        i -= 1
                    for i in range(k - 1):
                        if scratch[i] != 0:
                            basis[column + i] = (
                                (scratch[i] * inverse) % (1 << 64)
                            ) % 27449
                    basis[column + k - 1] = 1
                    # Preserve the upstream strict i<n bound (last column excluded).
                    for upper in range(k, n - 1):
                        base = upper * n
                        ck = basis[base + k - 1]
                        if ck != 0:
                            ck = 27449 - ck
                            for j in range(k - 1):
                                if basis[column + j] != 0:
                                    basis[base + j] = (
                                        (basis[base + j] + ck * basis[column + j])
                                        % (1 << 64)
                                    ) % 27449
                            basis[base + k - 1] = 0
                    state[2] -= 1
                    break
        else:
            k = last + 1
    if (
        nz == n + 1
        or k != 0
        or state[3] > 0
        or (generator != 0 and random_relation != 0)
    ):
        if last >= capacity:
            raise ValueError("zero relation exceeds allocated cache")
        if k == 0 and state[3] != 0 and nz < n + 1:
            state[3] -= 1
            k = last + 1 + state[2]
        for copied in range(n):
            records[last * n + copied] = relation[copied]
        hashes[last] = nz
        metadata[last * 3] = generator
        if automorphism != 0:
            metadata[last * 3 + 1] = last + 1 - original
        metadata[last * 3 + 2] = automorphism
        state[0] = last + 1
        return k, 1
    return k, 0
