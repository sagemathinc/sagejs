// Measure the irreducible cost of calling a host objective from WebAssembly.
//
// This is intentionally independent of a solver.  It separates arithmetic in
// Wasm from the callback transition that every callback-based native solver
// would make for an arbitrary Sage.js objective.

__attribute__((import_module("env"), import_name("objective")))
extern double host_objective(double value);

__attribute__((noinline)) static double local_objective(double value) {
  return value * value + 0.5 * value + 1.0;
}

__attribute__((export_name("run_host_callbacks")))
double run_host_callbacks(int count, double initial) {
  double total = 0.0;
  for (int index = 0; index < count; index += 1) {
    total += host_objective(initial + (double)index * 1.0e-9);
  }
  return total;
}

__attribute__((export_name("run_local_calls")))
double run_local_calls(int count, double initial) {
  double total = 0.0;
  for (int index = 0; index < count; index += 1) {
    total += local_objective(initial + (double)index * 1.0e-9);
  }
  return total;
}
