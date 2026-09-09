"""Experimental exact authorization for another resident search batch."""


def _cubic_can_resume_bounded_search(status: int, output: IntegerBuffer) -> bool:
    """Insufficiency requests search; it never grants a certificate.

    Phase 8 is the final analytic classification, after unit authentication
    and interval refinement. Its reason marker can refer to an earlier unit
    operation and is deliberately not used to identify this exit.
    """
    if status != 0:
        return False
    if output[63] == 43:
        return output[59] == 434
    if output[63] != 8 or output[47] <= 0:
        return False
    return (
        _cubic_classify_analytic_index(output[44], output[45], output[48], output[49])
        == 0
    )
