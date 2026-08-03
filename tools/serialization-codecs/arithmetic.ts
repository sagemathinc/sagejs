/** Lazy serialization registration owned by the arithmetic package. */

import {
  registerCodec,
  sageArithmeticElementCodec,
  sageArithmeticParentCodec,
} from "../serialization";

let registered = false;

export function registerArithmeticCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(sageArithmeticParentCodec);
  registerCodec(sageArithmeticElementCodec);
}
