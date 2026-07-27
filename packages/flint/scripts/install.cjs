"use strict";

// Defining an install script prevents node-gyp from implicitly compiling every
// package that contains binding.gyp. Native builds are explicit until this
// package ships platform-specific prebuilt binaries.
process.stdout.write(
  "@sagemath/sagejs-flint: native build deferred; run pnpm build explicitly\n"
);
