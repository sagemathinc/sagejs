"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { pythonExecutable } = require("../tools/python-executable.cjs");

test("inverse-Mellin general zeta reference matches independent oracles", () => {
  const root = join(__dirname, "..");
  const mpmathDirectory = join(root, "src", "lib", "mpmath");
  const source = [
    "import importlib.util, sys, types",
    `mpmath_directory=${JSON.stringify(mpmathDirectory)}`,
    "mpmath_path=mpmath_directory+'/__init__.py'",
    "spec=importlib.util.spec_from_file_location('mpmath',mpmath_path,submodule_search_locations=[mpmath_directory])",
    "mpmath=importlib.util.module_from_spec(spec);sys.modules['mpmath']=mpmath;spec.loader.exec_module(mpmath)",
    "sagejs=types.ModuleType('sagejs');sagejs.__path__=[];sagejs.QQbar=object();sys.modules['sagejs']=sagejs",
    `nf_path=${JSON.stringify(join(root, "src", "lib", "sagejs", "number_fields"))}`,
    "nf=types.ModuleType('sagejs.number_fields');nf.__path__=[nf_path];sys.modules['sagejs.number_fields']=nf",
    "from sagejs.number_fields.analytic_zeta import ReferenceAnalyticZeta,ReferenceZetaNumericalIndeterminacyError",
    "from sagejs.number_fields.general_zeta import AnalyticZetaLimits,GeneralZetaResourceError,exact_embedding_metadata,trivial_zero_order",
    "from mpmath import mp",
    "def meta(degree,D,r1,r2): return {'version':1,'degree':degree,'discriminant':D,'r1':r1,'r2':r2,'functional_equation_sign':1,'gamma_normalization':'plan','pole_locations':(0,1),'proof_status':'exact'}",
    "class Root:",
    " def __init__(self,re,im=0): self.re=re;self.im=im",
    " def is_real(self): return self.im==0",
    " def real(self): return self.re",
    " def imag(self): return self.im",
    "class Polynomial:",
    " def roots(self,parent,multiplicities=False): return [Root(2),Root(-1,-3),Root(-2),Root(-1,3)]",
    "class Field:",
    " def degree(self): return 4",
    " def defining_polynomial(self): return Polynomial()",
    "embedding=exact_embedding_metadata(Field())",
    "assert (embedding['r1'],embedding['r2'])==(2,1) and [r.re for r in embedding['real_roots']]==[-2,2] and embedding['complex_representatives'][0].im==3",
    "class Provider:",
    " def __init__(self,values): self.values=values;self.calls=0",
    " def coefficients(self,bound): self.calls+=1;return self.values[:bound]",
    "Q=ReferenceAnalyticZeta(meta(1,1,1,0),Provider([1]*16),precision_bits=30)",
    "q=Q.xi_result(mp.mpc('0.5','1'),coefficient_bound=16,quadrature_nodes=16)",
    "qv=mp.mpc(q['value_real'],q['value_imag'])",
    "s=mp.mpc('0.5','1');q_oracle=s*(s-1)*mp.pi**(-s/2)*mp.gamma(s/2)*mp.zeta(s)",
    "assert abs(qv-q_oracle)<mp.mpf('1e-12') and q['refinement_stable'] and not q['rigorous']",
    "batch_provider=Provider([1]*16);BQ=ReferenceAnalyticZeta(meta(1,1,1,0),batch_provider,precision_bits=16)",
    "batch=BQ.values_result([2,2],coefficient_bound=16,quadrature_nodes=16)",
    "assert batch_provider.calls==1 and batch['values'][0]==batch['values'][1] and batch['shared_coefficient_prefix']",
    "cubic=[1,0,0,0,1,0,1,1,0,0,1,0,0,0,0,0,1,0,1,0,0,0,2,0,2,0,1,0,0,0,0,0]",
    "C=ReferenceAnalyticZeta(meta(3,-23,1,1),Provider(cubic),precision_bits=24)",
    "cv=C(mp.mpc('.5','1'),coefficient_bound=32,quadrature_nodes=16)",
    "cd=C.derivative(2,coefficient_bound=32,quadrature_nodes=16)",
    "assert abs(cv-mp.mpc('0.36348083433185653759327400117','-0.054528469529245681688790266796'))<mp.mpf('3e-6')",
    "assert abs(cd-mp.mpf('-0.25115093189198585488916938364'))<mp.mpf('1e-6')",
    "assert abs(C.xi(s,coefficient_bound=32,quadrature_nodes=16)-C.xi(1-s,coefficient_bound=32,quadrature_nodes=16))<mp.mpf('1e-14')",
    "quartic=[1,0,1,0,1,0,0,0,1,0,1,0,0,0,1,1,1,0,1,0,0,0,2,0,1,0,2,0,2,0,0,0]",
    "T=ReferenceAnalyticZeta(meta(4,229,0,2),Provider(quartic),precision_bits=24)",
    "unstable=T.xi_result(2,coefficient_bound=32,quadrature_nodes=16)",
    "assert not unstable['refinement_stable'] and unstable['proof_status']=='numerical approximation'",
    "try: T.xi(2,coefficient_bound=32,quadrature_nodes=16);raise AssertionError('unstable result accepted')",
    "except ReferenceZetaNumericalIndeterminacyError: pass",
    "p=Provider([1]*16)",
    "R=ReferenceAnalyticZeta(meta(1,1,1,0),p,limits=AnalyticZetaLimits(maximum_precision_bits=32))",
    "try: R.xi_result(2,precision_bits=40,coefficient_bound=16,quadrature_nodes=16);raise AssertionError('limit ignored')",
    "except GeneralZetaResourceError: pass",
    "assert p.calls==0",
    "assert trivial_zero_order(meta(4,229,0,2),0)==1 and trivial_zero_order(meta(4,229,0,2),-2)==2 and trivial_zero_order(meta(4,229,0,2),-1)==2",
    "print('ok')",
  ].join("\n");
  const python = spawnSync(pythonExecutable(), ["-c", source], {
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(python.status, 0, python.stdout + python.stderr);
  assert.equal(python.stdout.trim(), "ok");
});
