# 0.8.0 numerical evidence transport repair

Product source remains `722b1f49e72e6383a12144929e2253a57bfe348b`.
Control branch: `fix/release-evidence-closure`. No product has been rebuilt or
published by this change.

Native qualification run `34385761734`, attempt 2, passed all platform producers,
macOS signing and signed-package numerical checks. Its final numerical gate
failed because the browser/supplemental upload omitted the NLopt build report.
The aggregate native acceptance correctly failed as a consequence.

Reconstructing the original candidate's gate with its original CI observations
and hash-matching local NLopt generated inputs passed all 16 required rows and
supplemental checks. This is a diagnosis, **not CI acceptance or publication
authority**. Full-runtime report identity:
`f999368de344fe550bd7723afd79b13f05380f2cebc8570fb00c4cf6c0e27b92`.
Supplemental report identity:
`1225268c3735da72e4f037c7795656f08f152bd33a9975dfb765ad049bc5ae45`.

## Corrected boundary

Retain NLopt generated inputs in the producer upload. After final gate
authentication, retain the complete generated support inputs in the raw evidence
artifact: SEA binding, numerical adapter output, CMINPACK build and NLopt build.
The publisher projects only these allowlisted support roots into a source-only
consumer and includes them in reconstruction checkpoint inputs. It still runs
the candidate's numerical verifier; it never builds missing bytes. An initialized
consumer permits only `dist/numerical`, not unrelated producer output in `dist`.
Symlinks, hardlinks, traversal and arbitrary source-file projections are rejected.

These changes increase evidence retention, not SEA/npm/browser payload sizes or
runtime startup cost. All support roots are required; incomplete evidence fails.
The workflow API review hashes cover the new helper and changed consumers.

Focused validation: 50 transport, extraction, handoff, preparation, retry and
support tests pass. The inventory check passes. These fixture tests do not
qualify mathematical products or grant publication authority.

## Remaining current-candidate recovery

The original failed aggregate cannot be called successful, and a retry executes
its original workflow, which still omits the inputs. The current artifact-set
contract requires that aggregate and same-run evidence artifacts. This commit
does not relax that contract.

To reuse the already signed products, a separately authenticated control recovery
must bind the original successful producer jobs and immutable artifact IDs,
reconstruct with the original candidate verifier, preserve the complete support
closure, and explicitly bind the recovered evidence's new run/source in the
handoff. It must not forge old-run artifacts, substitute mathematical observations,
or accept a local passing report as CI authority. No new tag should be created
until that recovery is implemented and validated, or a fresh complete candidate
qualification passes under the corrected workflow.

## Bounded recovery implementation

The handoff workflow now has an explicit `recover_numerical_evidence` input.
It verifies all nine original producer jobs in one terminal native attempt,
downloads and hashes the six original numerical/root inputs, and restores only
their checked ZIP layouts in a separate frozen candidate checkout. It regenerates
only omitted NLopt support, whose bytes must match the original observations;
it does not rebuild distribution products. The original candidate verifier runs
twice and authenticates the reconstructed gate against the public products.

The v2 artifact-set manifest binds original product artifacts to the original
producer runs and recovered gate/raw artifacts to the handoff control run.
Consumers authenticate that same successful handoff attempt, all four recovery
steps and the original producer identities. The original failed aggregate remains
explicitly failed; no failed gate is relabeled. Normal v1 capture remains available
and continues requiring successful aggregate jobs. Recovery uploads never overwrite
artifacts; if retention succeeded but a later step fails, use a new control run.
The signed products remain unchanged. No tag or publication is implied by capture.

## Real handoff and consumer trial

Handoff `34420653216` attempt 1 passed at control
`06a67da0b8a3f4deedaa1b1a16912d959fccdc15`. Its manifest artifact is
`10131050691`; independent authentication passed. macOS inspection
`34421557294` passed with observation artifact `10131125460`.

Read-only publication trial `34421756793` reconstructed and authenticated the
numerical gate, then exposed a second consumer bug: it expected full artifact
metadata inside compact capability bindings. Real collectors keep only name and
path-digest pairs there; the full metadata lives in the gate-bound raw receipt.
The checker now authenticates that receipt's canonical path and bytes and
cross-checks its artifact digest against the compact manifest before using its
content digest and size. No evidence is rewritten or supplemented with invented
metadata. Fixtures now reproduce this compact-manifest/raw-receipt separation.
Missing, duplicate, relocated, tampered and mismatched receipts fail.

Direct checks of all four real npm tarballs and their packaged SEA executables
pass after the correction. The broader release and focused numerical tests pass:
253 passed, two skipped, zero failures. The signed products and frozen source
remain unchanged; end-to-end publication verification still needs completion.
