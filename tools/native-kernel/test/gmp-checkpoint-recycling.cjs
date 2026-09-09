// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { GMP_CHECKPOINT_ALLOCATOR_C_SOURCE } = require("../gmp-checkpoint-allocator.cjs");
const { sanitizerCompilerFlag, sanitizerEnvironment } = require("../../../test/helpers/sanitizers.cjs");

test("allocator changes participate in the actual backend cache fingerprint", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../compiler.cjs"), "utf8");
  const start = source.indexOf("function backendFingerprint() {");
  const end = source.indexOf("function toolchainFingerprint() {", start);
  assert.ok(start >= 0 && end > start);
  const allocator = path.join("native", "gmp-checkpoint-allocator.cjs");
  let revision = "first";
  const fingerprint = require("node:vm").runInNewContext(source.slice(start, end) + "\nbackendFingerprint", {
    sha256: value => require("node:crypto").createHash("sha256").update(value).digest("hex"),
    readFileSync: filename => filename === allocator ? revision : filename,
    join: path.join, __dirname: "native", __filename: "compiler.cjs", root: "root",
    declarationFiles: () => [], header: "native.h",
  });
  const before = fingerprint();
  revision = "second";
  assert.notEqual(fingerprint(), before);
});

test("checkpoint recycling retains fixed ownership and explicit capacity guards", () => {
  const source = GMP_CHECKPOINT_ALLOCATOR_C_SOURCE;
  assert.match(source, /size_t free_bins\[sizeof\(size_t\) \* 8\]/);
  assert.match(source, /memset\(checkpoint, 0, sizeof\(\*checkpoint\)\)/);
  assert.match(source, /checkpoint->free_bins\[bin\] = offset \+ 1/);
  assert.match(source, /span > checkpoint->capacity - checkpoint->used/);
  assert.match(source, /checkpoint->soft_limit_exhaustions \+= 1/);
});

const witness = String.raw`
#include <assert.h>
#include <stdio.h>
#include "allocator.c"
static uint64_t seed = UINT64_C(0x7193);
static uint64_t random_word(void) {
    seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; return seed;
}
static void check_size_class(size_t raw) {
    size_t span = 1;
    unsigned bin = 0;
    while (span < raw && span <= SIZE_MAX / 2) { span *= 2; bin++; }
    if (span < raw) span = SIZE_MAX;
    assert(sagejs_native_gmp_reuse_span(raw) == span);
    if (span != SIZE_MAX) assert(sagejs_native_gmp_reuse_bin(span) == bin);
}
int main(void) {
    assert(sagejs_native_gmp_allocator_install());
    // Independent slow reference covers every small request and both sides
    // of every representable power-of-two boundary, including overflow.
    for(size_t raw=0;raw<65536;raw++)check_size_class(raw);
    for(unsigned bit=0;bit<sizeof(size_t)*8;bit++) {
        const size_t power=((size_t)1)<<bit;
        check_size_class(power-1);check_size_class(power);check_size_class(power+1);
    }
    check_size_class(SIZE_MAX);
    for(unsigned i=0;i<100000;i++)check_size_class((size_t)random_word());
    seed = UINT64_C(0x7193);
    sagejs_native_gmp_checkpoint arena = {0};
    assert(sagejs_native_gmp_checkpoint_begin(&arena, 3 * 1024 * 1024));
    unsigned char *first = sagejs_native_gmp_malloc(8192);
    memset(first, 71, 8192); sagejs_native_gmp_free(first, 8192);
    for (int i = 0; i < 10000; i++) {
        unsigned char *p = sagejs_native_gmp_malloc(8192);
        assert(p == first);
        assert((uintptr_t)p % SAGEJS_NATIVE_ALIGNOF(max_align_t) == 0);
        memset(p, 19, 8192); sagejs_native_gmp_free(p, 8192);
    }
    assert(arena.high_water < 32768);
    unsigned char *slots[32] = {0}; size_t lengths[32] = {0};
    for (int round = 0; round < 20000; round++) {
        unsigned j = random_word() % 32;
        size_t next = random_word() % 8193;
        if (slots[j]) {
            for (size_t q=0;q<lengths[j];q++) assert(slots[j][q] == j + 1);
            if (next % 4 == 0) {
                sagejs_native_gmp_free(slots[j], lengths[j]); slots[j]=NULL; lengths[j]=0;
            } else {
                unsigned char *p=sagejs_native_gmp_realloc(slots[j],lengths[j],next);
                for(size_t q=0;q<lengths[j]&&q<next;q++)assert(p[q]==j+1);
                slots[j]=p;lengths[j]=next;memset(p,j+1,next);
            }
        } else {slots[j]=sagejs_native_gmp_malloc(next);lengths[j]=next;memset(slots[j],j+1,next);}
        for(unsigned a=0;a<32;a++)if(slots[a])for(unsigned b=a+1;b<32;b++)if(slots[b])assert(slots[a]!=slots[b]);
    }
    for(unsigned j=0;j<32;j++)if(slots[j])sagejs_native_gmp_free(slots[j],lengths[j]);
    mpz_t z;mpz_init(z);
    for(int i=0;i<10000;i++){mpz_set_ui(z,3);mpz_pow_ui(z,z,1+(i%5000));assert(mpz_sgn(z)>0);}
    mpz_clear(z);
    assert(arena.soft_limit_exhaustions==0);assert(arena.upstream_allocations==0);
    assert(arena.requested_bytes > 100 * 1024 * 1024);
    assert(arena.high_water < 1024 * 1024);
    printf("high_water=%zu requested=%llu\n",arena.high_water,(unsigned long long)arena.requested_bytes);
    assert(sagejs_native_gmp_checkpoint_end(&arena));
    // Internal allocator nesting is tested; compiler-level nested arenas
    // remain forbidden by their independent lifetime qualification.
    assert(sagejs_native_gmp_checkpoint_begin(&arena,65536));
    void *outer=sagejs_native_gmp_malloc(256);
    sagejs_native_gmp_checkpoint inner={0};assert(sagejs_native_gmp_checkpoint_begin(&inner,65536));
    sagejs_native_gmp_free(outer,256);
    void *inside=sagejs_native_gmp_malloc(256);assert(inside!=outer);
    sagejs_native_gmp_free(inside,256);assert(sagejs_native_gmp_checkpoint_end(&inner));
    assert(sagejs_native_gmp_malloc(256)==outer);sagejs_native_gmp_free(outer,256);
    sagejs_native_gmp_checkpoint_suspend();
    void *external=sagejs_native_gmp_malloc(256);
    assert(!sagejs_native_gmp_pointer_is_checkpoint_owned(external));
    assert(sagejs_native_gmp_checkpoint_resume());sagejs_native_gmp_free(external,256);
    assert(sagejs_native_gmp_checkpoint_end(&arena));
    // Recycling must not erase a capacity violation already observed.
    assert(sagejs_native_gmp_checkpoint_begin(&arena,64));
    void *too_big=sagejs_native_gmp_malloc(256);assert(arena.soft_limit_exhaustions>0);
    sagejs_native_gmp_free(too_big,256);assert(sagejs_native_gmp_malloc(256)==too_big);
    assert(arena.soft_limit_exhaustions>0);sagejs_native_gmp_free(too_big,256);
    assert(sagejs_native_gmp_checkpoint_end(&arena));
    sagejs_native_gmp_checkpoint_stats stats={0};assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
    assert(stats.soft_limit_exhaustions>0);assert(stats.upstream_allocations==0);
    // A fresh checkpoint must not inherit free-list offsets into unmapped data.
    assert(sagejs_native_gmp_checkpoint_begin(&arena,65536));
    void *fresh=sagejs_native_gmp_malloc(256);memset(fresh,1,256);
    sagejs_native_gmp_free(fresh,256);assert(sagejs_native_gmp_checkpoint_end(&arena));
    puts("checkpoint recycling passed");
}
`;

test("GMP-freed checkpoint blocks recycle under randomized ASan/UBSan schedules", {
  skip: process.platform === "win32" ? "Unix sanitizer harness; Windows qualification remains required" : false,
}, (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-gmp-recycling-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "allocator.c"), GMP_CHECKPOINT_ALLOCATOR_C_SOURCE);
  fs.writeFileSync(path.join(directory, "witness.c"), witness);
  const prefix = process.env.SAGEJS_FLINT_PREFIX || path.resolve(__dirname, "../../../packages/flint/.native/prefix");
  const library = path.join(prefix, "lib/libgmp.a");
  const dependencies = fs.existsSync(library) ? ["-I" + path.join(prefix, "include"), library] : ["-lgmp"];
  const built = spawnSync(process.env.CC || "cc", ["-O1", "-g", "-fno-omit-frame-pointer", sanitizerCompilerFlag(),
    path.join(directory, "witness.c"), ...dependencies, "-o", path.join(directory, "witness")], { encoding: "utf8", timeout: 120000 });
  assert.equal(built.status, 0, built.stderr || String(built.error));
  const run = spawnSync(path.join(directory, "witness"), [], { encoding: "utf8", env: sanitizerEnvironment(), timeout: 120000 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  assert.match(run.stdout, /checkpoint recycling passed/);
});
