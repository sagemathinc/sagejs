import { ScalarSequenceAccess } from "../ir/scalar-program";

interface Binary64ArrayRepresentationInput {
  readonly sequenceAccesses: readonly ScalarSequenceAccess[];
  readonly stateSlots: readonly number[];
}

export interface Binary64ArrayRepresentationPlan {
  readonly representationId: "representation.binary64-immutable-tuple.v1";
  readonly sequenceStrategy: "transactional-stream";
  readonly sequenceCount: 1;
  readonly sequenceAccessCount: number;
  readonly copiedBytes: 0;
  readonly materializations: number;
  readonly elementMaterializations: 0;
  readonly aliasPolicy: "immutable-source-no-published-writes";
  readonly zeroTripPolicy: "preserve-input-and-loop-target-identity";
}

/** Select a no-copy immutable-tuple representation for one strict reduction. */
export function planBinary64ArrayRepresentation(
  program: Binary64ArrayRepresentationInput,
): Binary64ArrayRepresentationPlan {
  return Object.freeze({
    representationId: "representation.binary64-immutable-tuple.v1",
    sequenceStrategy: "transactional-stream",
    sequenceCount: 1,
    sequenceAccessCount: program.sequenceAccesses.reduce(
      (total, access) => total + access.uses,
      0,
    ),
    copiedBytes: 0,
    materializations: program.stateSlots.length,
    elementMaterializations: 0,
    aliasPolicy: "immutable-source-no-published-writes",
    zeroTripPolicy: "preserve-input-and-loop-target-identity",
  });
}
