#include <stdint.h>

typedef struct {
    uint32_t buffer;
    uint32_t length;
} wasi_iovec_t;

__attribute__((import_module("wasi_snapshot_preview1"), import_name("clock_time_get")))
extern uint32_t wasi_clock_time_get(uint32_t, uint64_t, uint32_t);
__attribute__((import_module("wasi_snapshot_preview1"), import_name("fd_close")))
extern uint32_t wasi_fd_close(uint32_t);
__attribute__((import_module("wasi_snapshot_preview1"), import_name("fd_read")))
extern uint32_t wasi_fd_read(uint32_t, uint32_t, uint32_t, uint32_t);
__attribute__((import_module("wasi_snapshot_preview1"), import_name("fd_seek")))
extern uint32_t wasi_fd_seek(uint32_t, int64_t, uint32_t, uint32_t);
__attribute__((import_module("wasi_snapshot_preview1"), import_name("fd_write")))
extern uint32_t wasi_fd_write(uint32_t, uint32_t, uint32_t, uint32_t);
__attribute__((import_module("wasi_snapshot_preview1"), import_name("path_open")))
extern uint32_t wasi_path_open(
    uint32_t, uint32_t, uint32_t, uint32_t, uint32_t,
    uint64_t, uint64_t, uint32_t, uint32_t
);
__attribute__((import_module("wasi_snapshot_preview1"), import_name("path_unlink_file")))
extern uint32_t wasi_path_unlink_file(uint32_t, uint32_t, uint32_t);

static char probe_path[] = "tmp/sagejs-wasi-probe";
static char expected[] = "sagejs-wasi-preview1";
static char observed[sizeof(expected)];
static wasi_iovec_t write_vector;
static wasi_iovec_t read_vector;
static uint32_t descriptor;
static uint32_t transferred;
static uint64_t position;
static uint64_t timestamp;

__attribute__((export_name("_initialize")))
void initialize(void) {}

__attribute__((export_name("sagejs_wasi_probe")))
uint32_t sagejs_wasi_probe(void) {
    const uint64_t rights =
        (UINT64_C(1) << 1) | (UINT64_C(1) << 2) | (UINT64_C(1) << 3) |
        (UINT64_C(1) << 5) | (UINT64_C(1) << 6);
    uint32_t error = wasi_clock_time_get(1, 1, (uint32_t)(uintptr_t)&timestamp);
    if (error || timestamp == 0) return 10 + error;
    error = wasi_path_open(
        3, 0, (uint32_t)(uintptr_t)probe_path, sizeof(probe_path) - 1,
        1 | 8, rights, 0, 0, (uint32_t)(uintptr_t)&descriptor
    );
    if (error) return 100 + error;
    write_vector.buffer = (uint32_t)(uintptr_t)expected;
    write_vector.length = sizeof(expected);
    error = wasi_fd_write(
        descriptor, (uint32_t)(uintptr_t)&write_vector, 1,
        (uint32_t)(uintptr_t)&transferred
    );
    if (error || transferred != sizeof(expected)) return 200 + error;
    error = wasi_fd_seek(descriptor, 0, 0, (uint32_t)(uintptr_t)&position);
    if (error || position != 0) return 300 + error;
    read_vector.buffer = (uint32_t)(uintptr_t)observed;
    read_vector.length = sizeof(observed);
    error = wasi_fd_read(
        descriptor, (uint32_t)(uintptr_t)&read_vector, 1,
        (uint32_t)(uintptr_t)&transferred
    );
    if (error || transferred != sizeof(expected)) return 400 + error;
    for (uint32_t index = 0; index < sizeof(expected); index += 1) {
        if (expected[index] != observed[index]) return 500 + index;
    }
    error = wasi_path_unlink_file(
        3, (uint32_t)(uintptr_t)probe_path, sizeof(probe_path) - 1
    );
    if (error) return 600 + error;
    error = wasi_fd_close(descriptor);
    if (error) return 700 + error;
    return 0;
}
