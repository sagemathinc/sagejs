# Integration requests for numerical domain packages

Domain packages do not need to import MATLAB or Wolfram runtime modules and do
not need to edit a central operation registry. For each public semantic
operation, expose a function returning `OperationAdapter` with:

1. the exact `OperationRef(domain, name, version)` used by the domain's
   structured problem record;
2. MATLAB and Wolfram aliases plus natural argument normalizers;
3. Sage and SciPy emitters, and MATLAB/Wolfram emitters where semantics can be
   preserved;
4. emitted-source parsers where the generated subset is unambiguous; and
5. an executor that invokes the domain's structured operation rather than a
   frontend-specific algorithm.

The integration lane should compose these adapters with
`create_frontend_registry(adapters)`, export the frontend package through the
public `sagejs.numerics` facade, add the fully migrated frontend files to
`pyrightconfig.json`, and route parser-recognized numerical calls to adapter
lowerers. The current TypeScript parser tables need entries for operations
beyond the already integrated `fzero` and `FindRoot` aliases; this lane does
not claim those shared parser files.

Every adapter should add corpus cases proving:

- natural source syntax and result-view conventions;
- canonical intent equality across equivalent source languages;
- successful outward generation or an exact diagnostic code;
- generated-source round trips where the target subset is parseable; and
- source-independent execution through the domain result/evidence record.
