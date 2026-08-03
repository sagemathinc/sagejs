/** Lazy serialization registration owned by the linear-algebra package. */

import {
  registerCodec,
  sageLinearAlgebraElementCodec,
  sageLinearAlgebraParentCodec,
} from "../serialization";

let registered = false;

export function registerLinearAlgebraCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(sageLinearAlgebraParentCodec);
  registerCodec(sageLinearAlgebraElementCodec);
}
