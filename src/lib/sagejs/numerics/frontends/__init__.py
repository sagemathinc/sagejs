"""Multilingual adapters for shared Sage.js numerical semantics."""

from .expressions import (
    expression_record,
    expression_semantically_equal,
    render_expression,
)
from .model import (
    FRONTEND_CLASSIFICATIONS,
    FRONTEND_DIAGNOSTIC_CODES,
    FRONTEND_LANGUAGES,
    FRONTEND_SCHEMA_VERSION,
    FrontendDiagnostic,
    NumericalFrontendIntent,
    OperationRef,
    UnsupportedFrontendError,
    canonical_language,
    opaque_callback_record,
)
from .registry import FrontendRegistry, OperationAdapter
from .scalar_root import (
    SCALAR_ROOT,
    create_frontend_registry,
    emit_code,
    execute_scalar_root_intent,
    intent_from_root_problem,
    matlab_fzero_intent,
    parse_code,
    scalar_root_adapter,
    scalar_root_intent,
    wolfram_find_root_intent,
)

__all__ = [
    "FRONTEND_CLASSIFICATIONS",
    "FRONTEND_DIAGNOSTIC_CODES",
    "FRONTEND_LANGUAGES",
    "FRONTEND_SCHEMA_VERSION",
    "SCALAR_ROOT",
    "FrontendDiagnostic",
    "FrontendRegistry",
    "NumericalFrontendIntent",
    "OperationAdapter",
    "OperationRef",
    "UnsupportedFrontendError",
    "canonical_language",
    "create_frontend_registry",
    "emit_code",
    "execute_scalar_root_intent",
    "expression_record",
    "expression_semantically_equal",
    "intent_from_root_problem",
    "matlab_fzero_intent",
    "opaque_callback_record",
    "parse_code",
    "render_expression",
    "scalar_root_adapter",
    "scalar_root_intent",
    "wolfram_find_root_intent",
]
