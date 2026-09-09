// sagejs-test-tier: unit
"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {instrument}=require('../bench/class-unit-groups/diagnose-cubic-exclusive-clock-build.cjs');
test('diagnostic wrappers preserve calls and require exact foreign boundaries',()=>{
  for(const declaration of ['', 'int ']){
    const core=`static int fmpz_native_certified_complex_cubic_class_group_v1(int arg)
{
  int sagejs_ffi_analysis_result = sagejs_number_field_analyze_resource(arg);
  return fmpz_native__cubic_relation_prefix_has_archimedean_unit(arg);
}
static int fmpz_native__cubic_relation_prefix_has_archimedean_unit(int arg)
{
  ${declaration}sagejs_ffi_h_result = sagejs_fmpz_matrix_hnf_transform_prefix(arg);
  ${declaration}sagejs_ffi_l_result = sagejs_fmpz_matrix_lll_transform_prefix(arg);
  return 1;
}
static int fmpz_native_end(int arg)
{
  return arg;
}
`;
    const result=instrument(core);
    assert(result.names.includes('foreign_recovery_hnf'));
    assert(result.names.includes('foreign_recovery_lll'));
    for(const name of ['sagejs_number_field_analyze_resource','sagejs_fmpz_matrix_hnf_transform_prefix','sagejs_fmpz_matrix_lll_transform_prefix']){
      assert.equal(result.core.split(name+'(').length,2);
      assert.throws(()=>instrument(core.replace(name,'unrecognized_call')));
    }
    assert.match(result.core,/if\(children>duration\)abort\(\)/);
  }
});
