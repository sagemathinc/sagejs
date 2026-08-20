# Physical-device feasibility protocol

Run this protocol on one current supported iPhone and one current supported
iPad using a Release configuration built from the exact commit and production
artifact recorded in the receipt. Disconnect Metro, enable airplane mode, and
deny local-network access before the offline tests. Store measured values, not
estimates, in `device-receipts/DEVICE-DATE.json`, then validate it with:

```sh
pnpm device:validate -- device-receipts/DEVICE-DATE.json
```

## Required checks

1. Cold-launch and instantiate the local Wasm engine. Relaunch for warm time.
2. Verify every relative Wasm/module/worker asset loads with no network.
3. Record whether nested workers work; if not, stop release and implement/test
   the sibling topology before recording a pass.
4. Run `factor(2026)` and a computation using FLINT temporary files.
5. Start an infinite loop, interrupt it, and evaluate `2 + 2` in the replacement
   worker. Measure interrupt latency.
6. Increase a representative matrix/allocation workload until reaching the
   practical ceiling without terminating iOS; record the last safe size and
   peak resident memory from Xcode Instruments.
7. Background and foreground while idle and while evaluating. Verify autosave,
   configured interruption, and recovery.
8. Render and share/export a complex plot.
9. Edit/run with an external keyboard using Command+Enter.
10. With VoiceOver, reach the editor, Run, Interrupt, status, output, document
    browser, settings, and share/export controls in a sensible order.
11. Deny network access and repeat cold launch, computation, save/load, and plot.
12. Run the mobile parity corpus in `fixtures/mobile-parity-corpus.json` and
    record every result/timing.
13. Sustain a representative computation for ten minutes; record thermal state
    and whether iOS throttled or terminated the app.

Capture device model, OS, app/runtime sizes, app build, Git commit, artifact
identity, cold/warm startup, peak memory, number-field coefficient batch,
elliptic L-series batch, complex-plot time, interrupt latency, worksheet
save/load time, and thermal observation. Screenshots or Instruments exports may
be referenced by path/hash in the evidence fields; do not place personal device
identifiers in the repository.

Simulator passes are useful but do not satisfy this gate. TestFlight status is
separate and must remain `not-submitted`, `submitted`, `approved`, or `rejected`.
