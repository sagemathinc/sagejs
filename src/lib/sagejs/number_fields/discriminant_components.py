"""Certified lazy decomposition of number-field discriminant components.

This module is the ordinary-Python reference layer for maximal-order factor
discovery.  In particular, it never promotes a probable prime or an opaque
coprime component to a prime.  Modular polynomial arithmetic returns a factor
of the modulus whenever an attempted inversion encounters a zero divisor.

The prefactorization strategy follows the implementation in Hecke's
BSD-2-Clause `MaxOrd/MaxOrd.jl`: perfect-power reduction, polynomial gcd over
composite residue rings, coprime-base refinement, and branch-local restarts.
The representation and certificate format here are Sage.js-specific.
"""

from __future__ import annotations

from typing import Any

PROVEN_PRIME = "proven-prime"
PROBABLE_PRIME = "probable-prime-awaiting-proof"
COMPOSITE = "composite"
UNRESOLVED = "unresolved-coprime-component"


class CertificationError(ArithmeticError):
    """Raised when bounded work cannot produce the requested proof."""


def integer_gcd(left: int, right: int) -> int:
    """Return the nonnegative greatest common divisor."""
    a = abs(int(left))
    b = abs(int(right))
    while b:
        a, b = b, a % b
    return a


def integer_lcm(left: int, right: int) -> int:
    """Return the nonnegative least common multiple."""
    if left == 0 or right == 0:
        return 0
    return abs((int(left) // integer_gcd(left, right)) * int(right))


def _modular_inverse(value: int, modulus: int) -> int:
    """Return an inverse using exact Euclid arithmetic on every host."""
    old_remainder = int(value) % int(modulus)
    remainder = int(modulus)
    old_coefficient = 1
    coefficient = 0
    while remainder:
        quotient = old_remainder // remainder
        old_remainder, remainder = remainder, old_remainder - quotient * remainder
        old_coefficient, coefficient = (
            coefficient,
            old_coefficient - quotient * coefficient,
        )
    if old_remainder != 1:
        raise ValueError("base is not invertible for the given modulus")
    return old_coefficient % int(modulus)


def _integer_nth_root(value: int, exponent: int) -> int:
    """Return `floor(value^(1/exponent))` using integer arithmetic only."""
    if value < 0 or exponent < 1:
        raise ValueError("an integer root needs a nonnegative value and exponent")
    if value < 2 or exponent == 1:
        return value
    low = 1
    high = 1 << ((value.bit_length() + exponent - 1) // exponent)
    while low <= high:
        middle = (low + high) // 2
        power = middle**exponent
        if power == value:
            return middle
        if power < value:
            low = middle + 1
        else:
            high = middle - 1
    return high


def perfect_power_data(value: int) -> tuple[int, int]:
    """Return `(base, exponent)` with maximal exponent and exact witness.

    Non-powers return `(value, 1)`.  For negative inputs only odd exponents
    are considered.  The maximal-exponent convention makes the result stable
    across factor-discovery order.
    """
    number = int(value)
    if number in (-1, 0, 1):
        return number, 1
    base = abs(number)
    total_exponent = 1
    # It is enough to extract prime exponents: every exponent greater than
    # one has a prime divisor.  Repeating each extraction recovers its full
    # valuation, so `total_exponent` is maximal without trying every integer
    # up to the bit length.  Negative integers can only have odd exponents.
    for exponent in _small_primes(base.bit_length()):
        if number < 0 and exponent == 2:
            continue
        while base > 1:
            root = _integer_nth_root(base, exponent)
            if root**exponent != base:
                break
            base = root
            total_exponent *= exponent
    return (-base if number < 0 else base), total_exponent


def _small_primes(bound: int) -> list[int]:
    """Return the primes at most `bound` by a compact deterministic sieve."""
    if bound < 2:
        return []
    composite = [False for _index in range(bound + 1)]
    answer = []
    for candidate in range(2, bound + 1):
        if composite[candidate]:
            continue
        answer.append(candidate)
        if candidate * candidate <= bound:
            multiple = candidate * candidate
            while multiple <= bound:
                composite[multiple] = True
                multiple += candidate
    return answer


_MR64_BASES = [2, 325, 9375, 28178, 450775, 9780504, 1795265022]
_PROBABLE_BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]


def _miller_rabin_witness(number: int, base: int) -> bool:
    """Return whether `base` proves `number` composite."""
    # A theorem base may be larger than n (and occasionally a multiple of n).
    # The zero residue is uninformative, not a compositeness witness.
    if base % number == 0:
        return False
    odd = number - 1
    shifts = 0
    while odd % 2 == 0:
        odd //= 2
        shifts += 1
    value = pow(base % number, odd, number)
    if value == 1 or value == number - 1:
        return False
    for _index in range(shifts - 1):
        value = value * value % number
        if value == number - 1:
            return False
    return True


def primality_status(number: int) -> tuple[str, dict[str, Any]]:
    """Classify an integer without making an unproved primality claim.

    The seven-base Miller--Rabin theorem is deterministic below `2^64`.
    Larger survivors are deliberately only probable primes until a recursive
    Pocklington certificate is constructed.
    """
    value = int(number)
    if value < 2:
        return COMPOSITE, {"kind": "less-than-two", "value": value}
    for prime in _small_primes(47):
        if value == prime:
            return PROVEN_PRIME, {"kind": "trial-prime", "prime": value}
        if value % prime == 0:
            return COMPOSITE, {"kind": "factor", "factor": prime}
    bases = _MR64_BASES if value < 1 << 64 else _PROBABLE_BASES
    for base in bases:
        if _miller_rabin_witness(value, base):
            return COMPOSITE, {"kind": "miller-rabin-witness", "base": base}
    if value < 1 << 64:
        return PROVEN_PRIME, {
            "kind": "deterministic-miller-rabin-64",
            "prime": value,
            "bases": list(_MR64_BASES),
        }
    return PROBABLE_PRIME, {
        "kind": "strong-probable-prime",
        "value": value,
        "bases": list(_PROBABLE_BASES),
    }


def _pollard_rho_factor(number: int, work_limit: int) -> int | None:
    """Return a deterministic nontrivial factor within a bounded budget."""
    if number % 2 == 0:
        return 2
    steps = 0
    constant = 1
    while constant <= 32 and steps < work_limit:
        slow = 2 + constant
        fast = slow
        divisor = 1
        while divisor == 1 and steps < work_limit:
            slow = (slow * slow + constant) % number
            fast = (fast * fast + constant) % number
            fast = (fast * fast + constant) % number
            divisor = integer_gcd(slow - fast, number)
            steps += 1
        if divisor != 1 and divisor != number:
            return divisor
        constant += 1
    return None


def bounded_factor(
    number: int, trial_bound: int = 1000, rho_steps: int = 20000
) -> int | None:
    """Find one factor without requesting a complete integer factorization."""
    value = abs(int(number))
    if value < 4:
        return None
    for prime in _small_primes(max(2, int(trial_bound))):
        if value % prime == 0:
            return prime if value != prime else None
    base, exponent = perfect_power_data(value)
    if exponent > 1 and abs(base) not in (1, value):
        return abs(base)
    # Rho is useful for modest accidental composites, but spending its whole
    # budget on the enormous residual component of a bad primitive generator
    # delays the local Buchmann--Lenstra branch without useful evidence.
    if value.bit_length() > 192:
        return None
    return _pollard_rho_factor(value, max(0, int(rho_steps)))


def prime_proof_budget(
    *,
    trial_divisions: int = 2000,
    rho_steps: int = 20000,
    witness_trials: int = 256,
    max_recursion_depth: int = 32,
    rho_bit_limit: int = 192,
) -> dict[str, int]:
    """Return an explicit resource budget for one resumable proof call.

    Trial division is the completeness path: repeated resumes eventually
    factor every required `n-1`.  Deterministic Pollard rho is only an
    acceleration and is skipped above `rho_bit_limit`.  No exhausted budget is
    interpreted as mathematical evidence.  The three work counters charge one
    trial remainder, rho iteration, or candidate-witness modular test;
    deterministic screening and checkpoint verification are deliberately
    outside these logical counters and are not wall-clock limits.
    """
    answer = {
        "trial_divisions": int(trial_divisions),
        "rho_steps": int(rho_steps),
        "witness_trials": int(witness_trials),
        "max_recursion_depth": int(max_recursion_depth),
        "rho_bit_limit": int(rho_bit_limit),
    }
    for name in answer:
        if answer[name] < 0:
            raise ValueError("a prime-proof resource budget must be nonnegative")
    if answer["max_recursion_depth"] < 1:
        raise ValueError("a prime-proof recursion depth must be positive")
    return answer


def _new_factor_job(value: int, exponent: int = 1) -> dict[str, Any]:
    number = int(value)
    power = int(exponent)
    if number < 2 or power < 1:
        raise ValueError(
            "a factor job needs a value at least two and positive exponent"
        )
    return {
        "value": number,
        "exponent": power,
        "trial_divisor": 2,
        "rho": {"constant": 1, "slow": 3 % number, "fast": 3 % number},
        "subproof": None,
    }


def new_prime_proof_state(number: int) -> dict[str, Any]:
    """Return a JSON-safe checkpoint for a deterministic proof of `number`."""
    value = int(number)
    is_less_than_two = value < 2
    return {
        "schema": "sagejs.number-fields/prime-proof-state-v1",
        "prime": value,
        "status": "composite" if is_less_than_two else "active",
        "certified_factors": [],
        "pending": [] if value < 3 else [_new_factor_job(value - 1)],
        "witness_search": [],
        "certificate": None,
        "composite_evidence": (
            {"kind": "less-than-two", "value": value} if is_less_than_two else None
        ),
        "exhaustion": None,
        "last_resume": None,
        "work": {
            "resumes": 0,
            "trial_divisions": 0,
            "rho_steps": 0,
            "witness_trials": 0,
        },
    }


def _certified_factor_product(state: dict[str, Any]) -> int:
    product = 1
    for entry in state.get("certified_factors", []):
        product *= int(entry["prime"]) ** int(entry["exponent"])
    return product


def _check_composite_evidence(number: int, evidence: dict[str, Any]) -> bool:
    value = int(number)
    if evidence.get("kind") == "fermat-witness":
        base = int(evidence.get("base", 0))
        return 1 < base < value and pow(base, value - 1, value) != 1
    classification, _unused = primality_status(value)
    return classification == COMPOSITE


def _plain_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _check_prime_proof_state(
    state: Any,
    check_nested: bool,
    ancestors: list[dict[str, Any]],
    depth: int,
) -> bool:
    if not isinstance(state, dict) or depth > 128:
        return False
    for ancestor in ancestors:
        if state is ancestor:
            return False
    if state.get("schema") != "sagejs.number-fields/prime-proof-state-v1":
        return False
    if not _plain_integer(state.get("prime")):
        return False
    prime = state["prime"]
    status = state.get("status")
    if status not in (
        "active",
        "resource-exhausted",
        "complete",
        "composite",
    ):
        return False
    if prime < 2 and status != "composite":
        return False
    certified_factors = state.get("certified_factors")
    pending = state.get("pending")
    witness_search = state.get("witness_search")
    if not isinstance(certified_factors, list) or not isinstance(pending, list):
        return False
    if not isinstance(witness_search, list):
        return False
    maximum_exponent = max(1, abs(prime - 1).bit_length())
    seen = []
    certified_product = 1
    for entry in certified_factors:
        if not isinstance(entry, dict):
            return False
        if not _plain_integer(entry.get("prime")) or not _plain_integer(
            entry.get("exponent")
        ):
            return False
        factor = entry["prime"]
        exponent = entry["exponent"]
        certificate = entry.get("certificate", {})
        if factor < 2 or exponent < 1 or exponent > maximum_exponent or factor in seen:
            return False
        if not isinstance(certificate, dict) or certificate.get("prime") != factor:
            return False
        if not check_prime_certificate(certificate):
            return False
        seen.append(factor)
        certified_product *= factor**exponent
    pending_product = 1
    next_ancestors = ancestors + [state]
    for job in pending:
        if not isinstance(job, dict):
            return False
        if not all(
            _plain_integer(job.get(name))
            for name in ("value", "exponent", "trial_divisor")
        ):
            return False
        value = job["value"]
        exponent = job["exponent"]
        trial_divisor = job["trial_divisor"]
        if (
            value < 2
            or exponent < 1
            or exponent > maximum_exponent
            or trial_divisor < 2
        ):
            return False
        rho = job.get("rho", {})
        if not isinstance(rho, dict) or not all(
            _plain_integer(rho.get(name)) for name in ("constant", "slow", "fast")
        ):
            return False
        if (
            rho["constant"] < 1
            or rho["slow"] < 0
            or rho["fast"] < 0
            or rho["slow"] >= value
            or rho["fast"] >= value
        ):
            return False
        subproof = job.get("subproof")
        if subproof is not None:
            if not isinstance(subproof, dict) or subproof.get("prime") != value:
                return False
            if check_nested and not _check_prime_proof_state(
                subproof, True, next_ancestors, depth + 1
            ):
                return False
        pending_product *= value**exponent
    witness_factors = []
    for search in witness_search:
        if not isinstance(search, dict):
            return False
        if not _plain_integer(search.get("prime")) or not _plain_integer(
            search.get("next_base")
        ):
            return False
        factor = search["prime"]
        next_base = search["next_base"]
        base = search.get("base")
        if (
            factor not in seen
            or factor in witness_factors
            or next_base < 2
            or (base is not None and not _plain_integer(base))
        ):
            return False
        witness_factors.append(factor)
    if status not in ("complete", "composite"):
        if certified_product * pending_product != prime - 1:
            return False
    work = state.get("work", {})
    if not isinstance(work, dict):
        return False
    for name in ("resumes", "trial_divisions", "rho_steps", "witness_trials"):
        if not _plain_integer(work.get(name)) or work[name] < 0:
            return False
    last_resume = state.get("last_resume")
    if last_resume is not None:
        if not isinstance(last_resume, dict):
            return False
        requested = last_resume.get("requested")
        consumed = last_resume.get("consumed")
        remaining = last_resume.get("remaining")
        limits = last_resume.get("limits")
        if not isinstance(requested, dict):
            return False
        if not isinstance(consumed, dict):
            return False
        if not isinstance(remaining, dict):
            return False
        if not isinstance(limits, dict):
            return False
        for name in ("trial_divisions", "rho_steps", "witness_trials"):
            if not all(
                _plain_integer(record.get(name))
                for record in (requested, consumed, remaining)
            ):
                return False
            if (
                requested[name] < 0
                or consumed[name] < 0
                or remaining[name] < 0
                or requested[name] != consumed[name] + remaining[name]
            ):
                return False
        for name in ("max_recursion_depth", "rho_bit_limit"):
            if not _plain_integer(limits.get(name)) or limits[name] < 0:
                return False
    if status == "complete":
        certificate = state.get("certificate")
        return (
            isinstance(certificate, dict)
            and certificate.get("prime") == prime
            and check_prime_certificate(certificate)
        )
    if status == "composite":
        evidence = state.get("composite_evidence")
        return isinstance(evidence, dict) and _check_composite_evidence(prime, evidence)
    return True


def check_prime_proof_state(state: dict[str, Any], check_nested: bool = True) -> bool:
    """Check exact checkpoint coverage and embedded proofs, failing closed."""
    try:
        return _check_prime_proof_state(state, bool(check_nested), [], 0)
    except (ArithmeticError, TypeError, ValueError, OverflowError, RecursionError):
        return False


def _add_certified_factor(
    state: dict[str, Any], prime: int, exponent: int, certificate: dict[str, Any]
) -> None:
    entries: list[dict[str, Any]] = state["certified_factors"]
    for entry in entries:
        if int(entry["prime"]) == prime:
            if entry["certificate"] != certificate:
                raise ArithmeticError("inconsistent certificates for one prime factor")
            entry["exponent"] = int(entry["exponent"]) + exponent
            return
    entries.append({"prime": prime, "exponent": exponent, "certificate": certificate})
    entries.sort(key=lambda entry: int(entry["prime"]))


def _split_factor_job(
    pending: list[dict[str, Any]], index: int, divisor: int
) -> dict[str, Any]:
    job = pending[index]
    value = int(job["value"])
    factor = integer_gcd(value, int(divisor))
    if factor in (1, value):
        raise ValueError("a factor-job split must be nontrivial")
    exponent = int(job["exponent"])
    children = [
        _new_factor_job(factor, exponent),
        _new_factor_job(value // factor, exponent),
    ]
    children.sort(key=lambda child: int(child["value"]))
    pending[index : index + 1] = children
    return {
        "source": value,
        "divisor": factor,
        "children": [int(child["value"]) for child in children],
    }


def apply_prime_proof_factor_split(
    state: dict[str, Any], composite_value: int, divisor: int
) -> dict[str, Any]:
    """Apply a discovered factor to exactly one pending proof branch."""
    if not check_prime_proof_state(state):
        raise ValueError("cannot split an invalid prime-proof checkpoint")
    target = int(composite_value)
    pending = state["pending"]
    for index in range(len(pending)):
        if int(pending[index]["value"]) == target:
            split = _split_factor_job(pending, index, divisor)
            state["status"] = "active"
            state["exhaustion"] = None
            if not check_prime_proof_state(state):
                raise ArithmeticError("a branch-local proof split lost exact coverage")
            return split
    raise KeyError("the requested prime-proof branch is not pending")


def _resume_rho_factor(
    job: dict[str, Any], resources: dict[str, int], work: dict[str, int]
) -> int | None:
    value = int(job["value"])
    if value.bit_length() > resources["rho_bit_limit"]:
        return None
    rho = job["rho"]
    while resources["rho_steps"] > 0:
        constant = int(rho["constant"])
        slow = (int(rho["slow"]) * int(rho["slow"]) + constant) % value
        fast = (int(rho["fast"]) * int(rho["fast"]) + constant) % value
        fast = (fast * fast + constant) % value
        divisor = integer_gcd(slow - fast, value)
        rho["slow"] = slow
        rho["fast"] = fast
        resources["rho_steps"] -= 1
        work["rho_steps"] += 1
        if divisor not in (1, value):
            return divisor
        if divisor == value:
            constant += 1
            start = (2 + constant) % value
            rho["constant"] = constant
            rho["slow"] = start
            rho["fast"] = start
    return None


def _resume_trial_factor(
    job: dict[str, Any], resources: dict[str, int], work: dict[str, int]
) -> int | None:
    value = int(job["value"])
    divisor = int(job["trial_divisor"])
    while resources["trial_divisions"] > 0 and divisor * divisor <= value:
        resources["trial_divisions"] -= 1
        work["trial_divisions"] += 1
        if value % divisor == 0:
            return divisor
        divisor = 3 if divisor == 2 else divisor + 2
        job["trial_divisor"] = divisor
    return None


def _prepare_witness_search(state: dict[str, Any]) -> None:
    previous = {}
    for entry in state.get("witness_search", []):
        previous[int(entry["prime"])] = entry
    search = []
    for factor in state["certified_factors"]:
        prime = int(factor["prime"])
        old = previous.get(prime)
        search.append(
            {
                "prime": prime,
                "next_base": 2 if old is None else int(old.get("next_base", 2)),
                "base": None if old is None else old.get("base"),
            }
        )
    state["witness_search"] = search


def _resume_pocklington_witnesses(
    state: dict[str, Any], resources: dict[str, int]
) -> dict[str, Any] | None:
    prime = int(state["prime"])
    _prepare_witness_search(state)
    witnesses = []
    for search in state["witness_search"]:
        factor = int(search["prime"])
        base = search.get("base")
        while base is None and resources["witness_trials"] > 0:
            candidate = int(search["next_base"])
            search["next_base"] = candidate + 1
            resources["witness_trials"] -= 1
            state["work"]["witness_trials"] += 1
            fermat = pow(candidate, prime - 1, prime)
            if fermat != 1:
                state["status"] = "composite"
                state["composite_evidence"] = {
                    "kind": "fermat-witness",
                    "base": candidate,
                }
                state["pending"] = []
                return None
            if (
                integer_gcd(
                    pow(candidate, (prime - 1) // factor, prime) - 1,
                    prime,
                )
                == 1
            ):
                base = candidate
                search["base"] = candidate
        if base is None:
            return None
        witnesses.append({"prime": factor, "base": int(base)})
    product = _certified_factor_product(state)
    return {
        "kind": "pocklington",
        "prime": prime,
        "factored_part": product,
        "factors": [dict(entry) for entry in state["certified_factors"]],
        "witnesses": witnesses,
    }


def _resume_prime_proof(
    state: dict[str, Any], resources: dict[str, int], depth: int
) -> None:
    prime = int(state["prime"])
    classification, evidence = primality_status(prime)
    if classification == COMPOSITE:
        state["status"] = "composite"
        state["composite_evidence"] = evidence
        state["pending"] = []
        return
    if classification == PROVEN_PRIME:
        state["status"] = "complete"
        state["certificate"] = evidence
        state["pending"] = []
        return
    if depth >= resources["max_recursion_depth"]:
        state["status"] = "resource-exhausted"
        state["exhaustion"] = {"reason": "recursion-depth", "depth": depth}
        return

    pending = state["pending"]
    index = 0
    while index < len(pending):
        job = pending[index]
        value = int(job["value"])
        exponent = int(job["exponent"])
        job_classification, job_evidence = primality_status(value)
        if job_classification == PROVEN_PRIME:
            _add_certified_factor(state, value, exponent, job_evidence)
            pending.pop(index)
            continue
        base, power = perfect_power_data(value)
        if power > 1:
            pending[index] = _new_factor_job(abs(base), exponent * power)
            continue
        if job_classification == PROBABLE_PRIME:
            subproof = job.get("subproof")
            if subproof is None:
                subproof = new_prime_proof_state(value)
                job["subproof"] = subproof
            # Dovetail recursive proof work with direct factor discovery.  A
            # large strong pseudoprime can otherwise consume every resume in
            # an impossible proof attempt while its parent never tries to
            # split it.  The child receives at most half of each factoring
            # resource, and the exact amount it consumes is deducted from the
            # caller's budget before the direct branch is resumed below.
            child_resources = dict(resources)
            for name in ("trial_divisions", "rho_steps"):
                child_resources[name] = (resources[name] + 1) // 2
            allocated = {
                name: child_resources[name]
                for name in ("trial_divisions", "rho_steps", "witness_trials")
            }
            _resume_prime_proof(subproof, child_resources, depth + 1)
            for name in allocated:
                resources[name] -= allocated[name] - child_resources[name]
            if subproof["status"] == "complete":
                _add_certified_factor(state, value, exponent, subproof["certificate"])
                pending.pop(index)
                continue

        divisor = _resume_trial_factor(job, resources, state["work"])
        if divisor is None:
            divisor = _resume_rho_factor(job, resources, state["work"])
        if divisor is not None:
            _split_factor_job(pending, index, divisor)
            continue
        index += 1

    product = _certified_factor_product(state)
    if product * product > prime:
        certificate = _resume_pocklington_witnesses(state, resources)
        if state["status"] == "composite":
            return
        if certificate is not None and check_prime_certificate(certificate):
            state["status"] = "complete"
            state["certificate"] = certificate
            state["pending"] = []
            return
    state["status"] = "resource-exhausted"
    state["exhaustion"] = {
        "reason": "budget-exhausted",
        "remaining": {
            "trial_divisions": resources["trial_divisions"],
            "rho_steps": resources["rho_steps"],
            "witness_trials": resources["witness_trials"],
        },
        "certified_part": product,
        "pending_values": [int(job["value"]) for job in pending],
    }


def resume_prime_proof(
    state: dict[str, Any], budget: dict[str, int] | None = None
) -> dict[str, Any]:
    """Resume one deterministic proof checkpoint within an explicit budget.

    The checkpoint is updated in place and returned.  `resource-exhausted` is
    resumable evidence of progress, not evidence of primality.  Repeated calls
    with positive trial budgets and a recursion-depth budget large enough for
    the input are complete for prime inputs: deterministic trial division
    eventually finds every required `n-1` factor, proof and factor branches
    are dovetailed, and Pocklington recursion strictly decreases the target.
    Budgets count deterministic logical operations, not wall-clock time.
    """
    if not check_prime_proof_state(state):
        raise ValueError("cannot resume an invalid prime-proof checkpoint")
    if state["status"] in ("complete", "composite"):
        return state
    selected = prime_proof_budget() if budget is None else dict(budget)
    required = prime_proof_budget(
        trial_divisions=0,
        rho_steps=0,
        witness_trials=0,
        max_recursion_depth=1,
        rho_bit_limit=0,
    )
    for name in required:
        if name not in selected:
            raise ValueError("a prime-proof budget is missing " + name)
        selected[name] = int(selected[name])
        if selected[name] < 0:
            raise ValueError("a prime-proof resource budget must be nonnegative")
    if selected["max_recursion_depth"] < 1:
        raise ValueError("a prime-proof recursion depth must be positive")
    counted_resources = ("trial_divisions", "rho_steps", "witness_trials")
    requested = {name: selected[name] for name in counted_resources}
    state["status"] = "active"
    state["exhaustion"] = None
    state["work"]["resumes"] += 1
    _resume_prime_proof(state, selected, 0)
    state["last_resume"] = {
        "requested": requested,
        "consumed": {
            name: requested[name] - selected[name] for name in counted_resources
        },
        "remaining": {name: selected[name] for name in counted_resources},
        "limits": {
            "max_recursion_depth": selected["max_recursion_depth"],
            "rho_bit_limit": selected["rho_bit_limit"],
        },
    }
    if not check_prime_proof_state(state):
        raise ArithmeticError("prime-proof resume produced an invalid checkpoint")
    return state


def prove_prime_resumable(
    number: int,
    budget: dict[str, int] | None = None,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Start or resume a proof and return its complete checkpoint evidence."""
    value = int(number)
    checkpoint = new_prime_proof_state(value) if state is None else state
    if int(checkpoint.get("prime", 0)) != value:
        raise ValueError("a resume checkpoint belongs to another integer")
    return resume_prime_proof(checkpoint, budget)


def prove_prime(number: int, work_limit: int = 200000) -> dict[str, Any] | None:
    """Return a deterministic certificate within a compatibility work bound.

    New callers that need resumable completion should use
    `prove_prime_resumable`.  This wrapper performs one explicitly bounded
    resume and preserves the original certificate-or-`None` contract.
    """
    work = max(0, int(work_limit))
    checkpoint = prove_prime_resumable(
        int(number),
        prime_proof_budget(
            trial_divisions=max(64, work // 32),
            rho_steps=work,
            witness_trials=max(128, work // 256),
            max_recursion_depth=32,
            rho_bit_limit=192,
        ),
    )
    if checkpoint["status"] == "complete":
        return checkpoint["certificate"]
    return None


def _check_prime_certificate(
    certificate: Any, ancestors: list[dict[str, Any]], depth: int
) -> bool:
    if not isinstance(certificate, dict) or depth > 128:
        return False
    for ancestor in ancestors:
        if certificate is ancestor:
            return False
    kind = certificate.get("kind")
    if not _plain_integer(certificate.get("prime")):
        return False
    prime = certificate["prime"]
    if kind == "trial-prime":
        return prime in _small_primes(47)
    if kind == "deterministic-miller-rabin-64":
        if prime < 2 or prime >= 1 << 64:
            return False
        for divisor in _small_primes(47):
            if prime != divisor and prime % divisor == 0:
                return False
        for base in _MR64_BASES:
            if _miller_rabin_witness(prime, base):
                return False
        return True
    if kind != "pocklington":
        return False
    if prime < 3 or prime % 2 == 0:
        return False
    factors = certificate.get("factors", [])
    witnesses = certificate.get("witnesses", [])
    if not isinstance(factors, list) or not isinstance(witnesses, list):
        return False
    maximum_entries = (prime - 1).bit_length()
    if len(factors) > maximum_entries or len(witnesses) > maximum_entries:
        return False
    product = 1
    seen = []
    previous_factor = 1
    next_ancestors = ancestors + [certificate]
    for entry in factors:
        if not isinstance(entry, dict):
            return False
        if not _plain_integer(entry.get("prime")) or not _plain_integer(
            entry.get("exponent")
        ):
            return False
        factor = entry["prime"]
        exponent = entry["exponent"]
        nested = entry.get("certificate")
        if (
            factor <= previous_factor
            or factor >= prime
            or exponent < 1
            or exponent > maximum_entries
            or not _check_prime_certificate(nested, next_ancestors, depth + 1)
        ):
            return False
        if not isinstance(nested, dict) or nested.get("prime") != factor:
            return False
        factor_power = factor**exponent
        if (prime - 1) % factor_power != 0:
            return False
        product *= factor_power
        if product > prime - 1:
            return False
        seen.append(factor)
        previous_factor = factor
    if not _plain_integer(certificate.get("factored_part")):
        return False
    if product != certificate["factored_part"]:
        return False
    if (prime - 1) % product != 0 or product * product <= prime:
        return False
    witnessed = []
    for witness_entry in witnesses:
        if not isinstance(witness_entry, dict):
            return False
        if not _plain_integer(witness_entry.get("prime")) or not _plain_integer(
            witness_entry.get("base")
        ):
            return False
        factor = witness_entry["prime"]
        base = witness_entry["base"]
        if factor not in seen or factor in witnessed or not 1 < base < prime:
            return False
        if pow(base, prime - 1, prime) != 1:
            return False
        if integer_gcd(pow(base, (prime - 1) // factor, prime) - 1, prime) != 1:
            return False
        witnessed.append(factor)
    return witnessed == seen


def check_prime_certificate(certificate: dict[str, Any]) -> bool:
    """Independently check a certificate, returning `False` if malformed."""
    try:
        return _check_prime_certificate(certificate, [], 0)
    except (ArithmeticError, TypeError, ValueError, OverflowError, RecursionError):
        return False


def _strip_polynomial(coefficients: list[int], modulus: int) -> list[int]:
    answer = [int(value) % modulus for value in coefficients]
    while len(answer) > 1 and answer[-1] == 0:
        answer.pop()
    if not answer:
        return [0]
    return answer


def polynomial_derivative(coefficients: list[int]) -> list[int]:
    """Return the formal derivative of low-to-high integer coefficients."""
    if len(coefficients) < 2:
        return [0]
    return [index * int(coefficients[index]) for index in range(1, len(coefficients))]


def _polynomial_coefficients(polynomial: Any) -> list[int]:
    """Normalize a coefficient list or an ordinary Sage-style polynomial."""
    if isinstance(polynomial, list) or isinstance(polynomial, tuple):
        values = list(polynomial)
    else:
        coefficient_list = getattr(polynomial, "list", None)
        if coefficient_list is None:
            raise TypeError(
                "a defining polynomial must provide low-to-high coefficients"
            )
        values = list(coefficient_list())
    if len(values) < 2:
        raise ValueError("a defining polynomial must have positive degree")
    return [int(value) for value in values]


def polynomial_gcd_mod_composite(
    left: list[int], right: list[int], modulus: int
) -> dict[str, Any]:
    """Compute a polynomial gcd or expose a zero divisor of `modulus`.

    The return value has status `gcd` with a monic coefficient list, or status
    `split` with a proper divisor.  No field algorithm is continued after a
    failed inversion.
    """
    q = abs(int(modulus))
    if q < 2:
        raise ValueError("the polynomial modulus must be at least two")
    old = _strip_polynomial(left, q)
    current = _strip_polynomial(right, q)
    while current != [0]:
        divisor = integer_gcd(current[-1], q)
        if divisor != 1:
            if divisor != q:
                return {
                    "status": "split",
                    "divisor": divisor,
                    "reason": "nonunit-leading-coefficient",
                }
            content = 0
            for coefficient in current:
                content = integer_gcd(content, coefficient)
            split = integer_gcd(content, q)
            if split not in (1, q):
                return {"status": "split", "divisor": split, "reason": "content"}
            return {
                "status": "unresolved",
                "reason": "zero-leading-coefficient",
                "polynomial": current,
            }
        inverse = _modular_inverse(current[-1], q)
        remainder = list(old)
        while remainder != [0] and len(remainder) >= len(current):
            shift = len(remainder) - len(current)
            scale = remainder[-1] * inverse % q
            for index in range(len(current)):
                target = index + shift
                remainder[target] = (remainder[target] - scale * current[index]) % q
            remainder = _strip_polynomial(remainder, q)
        old, current = current, remainder
    divisor = integer_gcd(old[-1], q)
    if divisor != 1:
        if divisor != q:
            return {
                "status": "split",
                "divisor": divisor,
                "reason": "gcd-normalization",
            }
        return {"status": "unresolved", "reason": "nonmonic-gcd", "polynomial": old}
    inverse = _modular_inverse(old[-1], q)
    gcd_polynomial = [(coefficient * inverse) % q for coefficient in old]
    return {"status": "gcd", "polynomial": _strip_polynomial(gcd_polynomial, q)}


def _support_split(number: int, divisor: int) -> tuple[int, int]:
    """Split `number` into the part supported on `divisor` and its complement."""
    remaining = abs(int(number))
    probe = abs(int(divisor))
    supported = 1
    common = integer_gcd(remaining, probe)
    while common != 1:
        supported *= common
        remaining //= common
        common = integer_gcd(remaining, probe)
    return supported, remaining


def coprime_decomposition(values: list[int]) -> list[int]:
    """Return deterministic pairwise-coprime support components.

    Multiplicities are intentionally discarded: the result is a coprime base
    for factor discovery, not a factorization identity.
    """
    components = []
    for raw in values:
        value = abs(int(raw))
        base, _exponent = perfect_power_data(value)
        value = abs(base)
        if value > 1:
            components.append(value)
    changed = True
    while changed:
        changed = False
        for left_index in range(len(components)):
            for right_index in range(left_index + 1, len(components)):
                left = components[left_index]
                right = components[right_index]
                common = integer_gcd(left, right)
                if common == 1:
                    continue
                replacements = [common]
                left_rest = left // common
                right_rest = right // common
                if left_rest > 1:
                    replacements.append(left_rest)
                if right_rest > 1:
                    replacements.append(right_rest)
                components = (
                    components[:left_index]
                    + components[left_index + 1 : right_index]
                    + components[right_index + 1 :]
                    + replacements
                )
                changed = True
                break
            if changed:
                break
    unique = []
    for value in sorted(components):
        if value not in unique:
            unique.append(value)
    return unique


class DiscriminantComponent:
    """One exact coprime factor of a discriminant under lazy refinement."""

    def __init__(
        self,
        value: int,
        state: str = UNRESOLVED,
        base: int | None = None,
        exponent: int = 1,
        evidence: dict[str, Any] | None = None,
    ) -> None:
        self.value = abs(int(value))
        self.state = state
        self.base = abs(int(base if base is not None else value))
        self.exponent = int(exponent)
        self.evidence = {} if evidence is None else evidence

    def to_dict(self) -> dict[str, Any]:
        """Return a stable, host-neutral certificate record."""
        return {
            "value": self.value,
            "state": self.state,
            "base": self.base,
            "exponent": self.exponent,
            "evidence": self.evidence,
        }


def _classify_component(
    value: int, prove_large: bool, proof_work: int
) -> DiscriminantComponent:
    base, exponent = perfect_power_data(value)
    base = abs(base)
    state, evidence = primality_status(base)
    if state == PROBABLE_PRIME and prove_large:
        proof = prove_prime(base, proof_work)
        if proof is not None:
            state = PROVEN_PRIME
            evidence = proof
    return DiscriminantComponent(value, state, base, exponent, evidence)


def split_component(
    component: DiscriminantComponent, divisor: int
) -> list[DiscriminantComponent]:
    """Split only the affected branch using a witnessed modulus divisor."""
    factor = integer_gcd(component.value, int(divisor))
    if factor in (1, component.value):
        return [component]
    supported, complement = _support_split(component.value, factor)
    if complement == 1:
        return [component]
    return [
        _classify_component(supported, False, 0),
        _classify_component(complement, False, 0),
    ]


def split_decomposition_component(
    decomposition: dict[str, Any],
    component_value: int,
    divisor: int,
    *,
    reason: str = "dynamic-local-split",
) -> dict[str, Any]:
    """Split one certified decomposition branch and preserve every sibling.

    The return record contains the updated decomposition plus an explicit
    restart contract.  A public maximal-order engine can discard only
    `restart.retired`, enqueue `restart.children`, and retain every value in
    `restart.preserved`; it never factors or restarts the whole residual.
    """
    if not check_decomposition_certificate(decomposition, require_proven=False):
        raise ValueError("cannot split an invalid discriminant decomposition")
    target = abs(int(component_value))
    entries = decomposition.get("components", [])
    matches = []
    for index in range(len(entries)):
        if int(entries[index].get("value", 0)) == target:
            matches.append(index)
    if len(matches) != 1:
        raise KeyError("a branch-local split requires one exact component value")
    index = matches[0]
    entry = entries[index]
    component = DiscriminantComponent(
        int(entry["value"]),
        str(entry["state"]),
        int(entry["base"]),
        int(entry["exponent"]),
        dict(entry.get("evidence", {})),
    )
    children = split_component(component, int(divisor))
    if len(children) == 1:
        raise ValueError("the discovered divisor does not split this component support")
    child_entries = [child.to_dict() for child in children]
    child_entries.sort(key=lambda child: int(child["value"]))
    updated_entries = [dict(value) for value in entries]
    updated_entries[index : index + 1] = child_entries
    updated_entries.sort(key=lambda value: int(value["value"]))
    preserved = []
    for value in entries:
        if int(value["value"]) != target:
            preserved.append(int(value["value"]))
    event = {
        "kind": "branch-local-component-split",
        "parent": target,
        "divisor": integer_gcd(target, int(divisor)),
        "reason": str(reason),
        "children": [int(child["value"]) for child in child_entries],
        "preserved": sorted(preserved),
    }
    updated = {
        "version": int(decomposition["version"]),
        "original": int(decomposition["original"]),
        "components": updated_entries,
        "events": list(decomposition.get("events", [])) + [event],
        "certified": all(
            child.get("state") == PROVEN_PRIME for child in updated_entries
        ),
    }
    if not check_decomposition_certificate(updated, require_proven=False):
        raise ArithmeticError("a branch-local component split lost exact coverage")
    return {
        "decomposition": updated,
        "restart": {
            "retired": target,
            "children": child_entries,
            "preserved": sorted(preserved),
            "event": event,
        },
    }


def certify_decomposition_component(
    decomposition: dict[str, Any],
    component_value: int,
    certificate: dict[str, Any],
) -> dict[str, Any]:
    """Install an independently checked prime proof on one existing branch."""
    if not check_decomposition_certificate(decomposition, require_proven=False):
        raise ValueError("cannot certify an invalid discriminant decomposition")
    if not check_prime_certificate(certificate):
        raise ValueError("the supplied prime certificate is invalid")
    target = abs(int(component_value))
    updated_entries = [dict(entry) for entry in decomposition.get("components", [])]
    matches = [
        index
        for index in range(len(updated_entries))
        if int(updated_entries[index].get("value", 0)) == target
    ]
    if len(matches) != 1:
        raise KeyError("component certification requires one exact branch value")
    entry = updated_entries[matches[0]]
    if int(entry.get("base", 0)) != int(certificate.get("prime", 0)):
        raise ValueError("the prime certificate does not prove this component base")
    entry["state"] = PROVEN_PRIME
    entry["evidence"] = certificate
    event = {
        "kind": "branch-local-prime-certificate",
        "component": target,
        "prime": int(entry["base"]),
    }
    updated = {
        "version": int(decomposition["version"]),
        "original": int(decomposition["original"]),
        "components": updated_entries,
        "events": list(decomposition.get("events", [])) + [event],
        "certified": all(
            component.get("state") == PROVEN_PRIME for component in updated_entries
        ),
    }
    if not check_decomposition_certificate(updated, require_proven=False):
        raise ArithmeticError("branch-local certification corrupted the decomposition")
    return updated


def prefactorization_hints(
    polynomial: list[int], components: list[DiscriminantComponent]
) -> tuple[list[DiscriminantComponent], list[dict[str, Any]]]:
    """Refine components by Hecke-style gcds modulo composite integers."""
    derivative = polynomial_derivative(polynomial)
    pending = list(components)
    final: list[DiscriminantComponent] = []
    events: list[dict[str, Any]] = []
    while pending:
        component = pending.pop(0)
        if component.state == PROVEN_PRIME:
            final.append(component)
            continue
        result = polynomial_gcd_mod_composite(polynomial, derivative, component.base)
        if result["status"] == "split":
            divisor = int(result["divisor"])
            branches = split_component(component, divisor)
            if len(branches) > 1:
                events.append(
                    {
                        "kind": "modular-inversion-split",
                        "parent": component.value,
                        "divisor": divisor,
                        "reason": result["reason"],
                        "children": [branch.value for branch in branches],
                    }
                )
                pending = branches + pending
                continue
        final.append(component)
    final.sort(key=lambda item: item.value)
    return final, events


def decompose_discriminant(
    polynomial: Any,
    discriminant: int,
    *,
    hints: list[int] | None = None,
    trace: Any = None,
    small_prime_bound: int = 1000,
    rho_steps: int = 20000,
    prove_large_primes: bool = True,
    proof_work: int = 200000,
) -> dict[str, Any]:
    """Build a bounded, certified decomposition without full factorization.

    The component values always multiply exactly to `abs(discriminant)` and
    are pairwise coprime.  A caller that requires a global proof must reject a
    certificate containing any state other than `proven-prime`.
    """
    original = abs(int(discriminant))
    if original == 0:
        raise ValueError("a zero discriminant does not define a number field")
    remaining = original
    components = []
    events = []
    for prime in _small_primes(max(2, int(small_prime_bound))):
        if remaining % prime != 0:
            continue
        power = 1
        exponent = 0
        while remaining % prime == 0:
            remaining //= prime
            power *= prime
            exponent += 1
        proof = prove_prime(prime, 0)
        components.append(
            DiscriminantComponent(power, PROVEN_PRIME, prime, exponent, proof)
        )
        events.append({"kind": "small-prime", "prime": prime, "exponent": exponent})
    if remaining > 1:
        components.append(
            _classify_component(remaining, prove_large_primes, proof_work)
        )

    supplied_hints = [] if hints is None else list(hints)
    for hint in supplied_hints:
        next_components = []
        for component in components:
            branches = split_component(component, int(hint))
            if len(branches) > 1:
                events.append(
                    {
                        "kind": "factor-hint-split",
                        "parent": component.value,
                        "divisor": integer_gcd(component.value, int(hint)),
                        "children": [branch.value for branch in branches],
                    }
                )
            next_components.extend(branches)
        components = next_components

    if polynomial is not None:
        components, polynomial_events = prefactorization_hints(
            _polynomial_coefficients(polynomial), components
        )
        events.extend(polynomial_events)

    changed = True
    while changed:
        changed = False
        next_components = []
        for component in components:
            if component.state != COMPOSITE:
                next_components.append(component)
                continue
            factor = bounded_factor(component.base, small_prime_bound, rho_steps)
            if factor is None:
                next_components.append(component)
                continue
            branches = split_component(component, factor)
            if len(branches) == 1:
                next_components.append(component)
                continue
            events.append(
                {
                    "kind": "bounded-composite-split",
                    "parent": component.value,
                    "divisor": factor,
                    "children": [branch.value for branch in branches],
                }
            )
            next_components.extend(branches)
            changed = True
        components = next_components

    components.sort(key=lambda item: item.value)
    certificate = {
        "version": 1,
        "original": original,
        "components": [component.to_dict() for component in components],
        "events": events,
        "certified": all(component.state == PROVEN_PRIME for component in components),
    }
    if not check_decomposition_certificate(certificate, require_proven=False):
        raise ArithmeticError("internal discriminant decomposition certificate failed")
    if trace is not None:
        for event in events:
            _emit_trace(trace, "discriminant-decomposition", event["kind"], event)
    return certificate


def check_decomposition_certificate(
    certificate: dict[str, Any], require_proven: bool = True
) -> bool:
    """Independently verify exact coverage, coprimality, powers, and proofs."""
    if int(certificate.get("version", 0)) != 1:
        return False
    original = int(certificate.get("original", 0))
    if original < 1:
        return False
    product = 1
    seen_values = []
    all_proven = True
    for entry in certificate.get("components", []):
        value = int(entry.get("value", 0))
        base = int(entry.get("base", 0))
        exponent = int(entry.get("exponent", 0))
        state = entry.get("state")
        if value < 2 or base < 2 or exponent < 1 or base**exponent != value:
            return False
        for previous in seen_values:
            if integer_gcd(previous, value) != 1:
                return False
        seen_values.append(value)
        product *= value
        if state == PROVEN_PRIME:
            proof = entry.get("evidence", {})
            if int(proof.get("prime", 0)) != base or not check_prime_certificate(proof):
                return False
        elif state == PROBABLE_PRIME:
            status, _evidence = primality_status(base)
            if status not in (PROBABLE_PRIME, PROVEN_PRIME):
                return False
            all_proven = False
        elif state == COMPOSITE:
            status, _evidence = primality_status(base)
            if status != COMPOSITE:
                return False
            all_proven = False
        elif state == UNRESOLVED:
            all_proven = False
        else:
            return False
    if product != original:
        return False
    if bool(certificate.get("certified", False)) != all_proven:
        return False
    return all_proven or not require_proven


def require_certified_decomposition(certificate: dict[str, Any]) -> None:
    """Fail closed unless every component has an independently checked proof."""
    if not check_decomposition_certificate(certificate, require_proven=True):
        unresolved = []
        for component in certificate.get("components", []):
            if component.get("state") != PROVEN_PRIME:
                unresolved.append(str(component.get("value")))
        detail = ", ".join(unresolved) if unresolved else "invalid certificate"
        raise CertificationError("discriminant components are not certified: " + detail)


def _adapter_operation(adapter: Any, name: str) -> Any:
    if isinstance(adapter, dict):
        operation = adapter.get(name)
    else:
        operation = getattr(adapter, name, None)
    if operation is None:
        raise TypeError("the Buchmann--Lenstra adapter does not provide " + name)
    return operation


def _emit_trace(trace: Any, stage: str, state: str, details: dict[str, Any]) -> None:
    emitter = getattr(trace, "emit", None)
    if emitter is not None:
        emitter(stage, state, details)
    else:
        trace({"stage": stage, "state": state, "details": details})


def _bl_event(
    events: list[dict[str, Any]], trace: Any, stage: str, details: dict[str, Any]
) -> None:
    event = {"sequence": len(events), "stage": stage, "details": details}
    events.append(event)
    if trace is not None:
        _emit_trace(trace, "buchmann-lenstra", stage, event)


def _bl_split_result(
    order: Any,
    component: DiscriminantComponent,
    divisor: int,
    stage: str,
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    factor = integer_gcd(component.value, divisor)
    branches = split_component(component, factor)
    if len(branches) == 1:
        return {
            "state": "certification-error",
            "order": order,
            "component": component.to_dict(),
            "events": events,
            "message": stage + " returned a non-splitting divisor",
        }
    return {
        "state": "split",
        "order": order,
        "component": component.to_dict(),
        "split": {
            "source": component.value,
            "divisor": factor,
            "children": [branch.to_dict() for branch in branches],
            "stage": stage,
        },
        "events": events,
    }


def buchmann_lenstra_cycle(
    order: Any,
    component: DiscriminantComponent,
    adapter: Any,
    *,
    trace: Any = None,
    max_steps: int = 128,
) -> dict[str, Any]:
    """Run the readable Buchmann--Lenstra unresolved-component cycle.

    This is an executable algorithm, not certificate plumbing.  Its adapter
    contains only the order/ideal primitives that depend on Sage.js's current
    representation:

    - `degree(order)` and `discriminant(order)`;
    - `q_radical(order, q) -> {ideal, divisor, trivial}`;
    - `multiplier_ring(order, ideal)` and `orders_equal(left, right)`;
    - `colon_freeness_obstruction(order, ideal, q)`;
    - `ideal_multiply`, `ideal_add_integer`, and `ideals_equal`;
    - `relation_freeness_obstruction(left, right, q)`.

    Every obstruction is gcd-checked before it can split a branch.  A stable
    cycle that neither certifies nor splits returns `resource-error`; it never
    treats `q` as prime.  This follows Hecke's BSD-2-Clause `_cycleBL` and
    `_cycleBL2` stages while keeping host objects outside certificate records.
    """
    if not isinstance(component, DiscriminantComponent):
        raise TypeError("the Buchmann--Lenstra component has the wrong type")
    if component.state == PROVEN_PRIME:
        return {
            "state": "not-applicable",
            "order": order,
            "component": component.to_dict(),
            "events": [],
            "message": "a proven-prime component belongs in a prime-local solver",
        }
    limit = int(max_steps)
    if limit < 1:
        raise ValueError("the Buchmann--Lenstra step bound must be positive")
    degree = int(_adapter_operation(adapter, "degree")(order))
    if degree < 1:
        raise ValueError("an order must have positive degree")
    discriminant = _adapter_operation(adapter, "discriminant")
    q_radical = _adapter_operation(adapter, "q_radical")
    multiplier_ring = _adapter_operation(adapter, "multiplier_ring")
    orders_equal = _adapter_operation(adapter, "orders_equal")
    colon_obstruction = _adapter_operation(adapter, "colon_freeness_obstruction")
    ideal_multiply = _adapter_operation(adapter, "ideal_multiply")
    ideal_add_integer = _adapter_operation(adapter, "ideal_add_integer")
    ideals_equal = _adapter_operation(adapter, "ideals_equal")
    relation_obstruction = _adapter_operation(adapter, "relation_freeness_obstruction")

    q = component.base
    current = order
    events: list[dict[str, Any]] = []
    steps = 0
    while steps < limit:
        q = integer_gcd(q, abs(int(discriminant(current))))
        _bl_event(events, trace, "component-reduction", {"q": q})
        if q == 1:
            return {
                "state": "complete",
                "order": current,
                "component": component.to_dict(),
                "events": events,
                "evidence": {"kind": "buchmann-lenstra", "component_removed": True},
            }

        radical = q_radical(current, q)
        steps += 1
        divisor = integer_gcd(q, int(radical.get("divisor", 1)))
        _bl_event(
            events,
            trace,
            "q-radical",
            {
                "q": q,
                "divisor": divisor,
                "trivial": bool(radical.get("trivial", False)),
            },
        )
        if divisor not in (1, q):
            return _bl_split_result(current, component, divisor, "q-radical", events)
        if bool(radical.get("trivial", False)):
            return {
                "state": "complete",
                "order": current,
                "component": component.to_dict(),
                "events": events,
                "evidence": {"kind": "buchmann-lenstra", "trivial_radical": True},
            }
        ideal = radical.get("ideal")
        if ideal is None:
            return {
                "state": "certification-error",
                "order": current,
                "component": component.to_dict(),
                "events": events,
                "message": "q-radical returned no ideal",
            }

        enlarged = multiplier_ring(current, ideal)
        _bl_event(
            events,
            trace,
            "multiplier-ring",
            {"enlarged": not orders_equal(enlarged, current)},
        )
        if not orders_equal(enlarged, current):
            current = enlarged
            continue

        divisor = integer_gcd(q, int(colon_obstruction(current, ideal, q)))
        _bl_event(events, trace, "colon-freeness", {"divisor": divisor})
        if divisor not in (1, q):
            return _bl_split_result(
                current, component, divisor, "colon-freeness", events
            )

        ideal_one = ideal
        ideal_two = ideal_multiply(ideal, ideal)
        ideal_three = ideal_multiply(ideal_two, ideal)
        height = 2
        while height <= degree and steps < limit:
            left = ideal_multiply(
                ideal_add_integer(ideal_one, q),
                ideal_add_integer(ideal_three, q),
            )
            middle = ideal_add_integer(ideal_two, q)
            right = ideal_multiply(middle, middle)
            steps += 1
            equal = bool(ideals_equal(left, right))
            _bl_event(
                events,
                trace,
                "power-freeness",
                {"height": height, "equal": equal},
            )
            if not equal:
                divisor = integer_gcd(q, int(relation_obstruction(left, right, q)))
                if divisor not in (1, q):
                    return _bl_split_result(
                        current,
                        component,
                        divisor,
                        "power-freeness",
                        events,
                    )
                root = _integer_nth_root(q, height)
                return {
                    "state": "resource-error",
                    "order": current,
                    "component": component.to_dict(),
                    "events": events,
                    "message": (
                        "stable Buchmann--Lenstra component needs prime-power refinement"
                        if root**height == q
                        else "stable Buchmann--Lenstra component needs further factor discovery"
                    ),
                    "perfect_power": (
                        {"base": root, "exponent": height}
                        if root**height == q
                        else None
                    ),
                }
            height += 1
            ideal_one, ideal_two, ideal_three = (
                ideal_two,
                ideal_three,
                ideal_multiply(ideal_three, ideal),
            )
        return {
            "state": "resource-error",
            "order": current,
            "component": component.to_dict(),
            "events": events,
            "message": "Buchmann--Lenstra freeness cycle exhausted its certified bound",
        }
    return {
        "state": "resource-error",
        "order": current,
        "component": component.to_dict(),
        "events": events,
        "message": "Buchmann--Lenstra multiplier cycle exhausted its certified bound",
    }


__all__ = [
    "COMPOSITE",
    "PROBABLE_PRIME",
    "PROVEN_PRIME",
    "UNRESOLVED",
    "CertificationError",
    "DiscriminantComponent",
    "apply_prime_proof_factor_split",
    "bounded_factor",
    "buchmann_lenstra_cycle",
    "certify_decomposition_component",
    "check_decomposition_certificate",
    "check_prime_certificate",
    "check_prime_proof_state",
    "coprime_decomposition",
    "decompose_discriminant",
    "integer_gcd",
    "integer_lcm",
    "perfect_power_data",
    "polynomial_derivative",
    "polynomial_gcd_mod_composite",
    "prefactorization_hints",
    "prime_proof_budget",
    "primality_status",
    "prove_prime",
    "prove_prime_resumable",
    "require_certified_decomposition",
    "resume_prime_proof",
    "split_component",
    "split_decomposition_component",
    "new_prime_proof_state",
]
