# Integration handoff

This lane owns only `apps/sagejs-mobile/`. The integration lane should decide
whether the application joins the root pnpm workspace. If it does, add the path
to `pnpm-workspace.yaml`, add root convenience scripts, and regenerate the root
lockfile rather than deleting the app's reproducible standalone lockfile.

Release automation should:

1. Build `packages/flint-wasm` and verify its production manifest/receipt.
2. Run `pnpm --dir apps/sagejs-mobile assets:prepare`.
3. Run mobile type, Jest, contract, and asset verification tests.
4. On macOS, install pods and build Release for generic iOS plus Debug or
   Release for one iPhone and one iPad simulator destination.
5. On Android, build `assembleDebug` and unsigned `assembleRelease`.
6. Archive the mobile asset identity and simulator/build receipts.
7. Require independently validated physical iPhone/iPad receipts before a
   TestFlight release gate may pass.

Do not weaken native pre-build asset verification to make a partial checkout
compile. A mobile build without the exact engine is invalid by design.
