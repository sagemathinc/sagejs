"use strict";

module.exports = {
  sourcePath: "native-kernel-input.sage",
  cacheRoot: ".native-kernel-cache",
  signatures: {
    multiply_loop: {
      arguments: ["ComplexField", "uint64"],
      returns: "ComplexNumber",
    },
    real_multiply_loop: {
      arguments: ["RealField", "uint64"],
      returns: "RealNumber",
    },
  },
};
