/* Pristine PARI 2.17.4 prepared-nf timing arm for development row 16. */
#include "pari.h"
#include "paripriv.h"
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>

static uint64_t ns(struct timespec t) { return (uint64_t)t.tv_sec * UINT64_C(1000000000) + t.tv_nsec; }
static void emit_int(GEN x) { pari_printf("\"%Ps\"", x); }
static void emit_vec(GEN x) {
  long i; putchar('['); for (i=1;i<lg(x);i++) { if(i>1) putchar(','); emit_int(gel(x,i)); } putchar(']');
}
static void emit_run(GEN nf, const char *seed) {
  struct timespec a,b; struct rusage usage; GEN bnf,cyc,fu; uint64_t elapsed;
  long rank, generators;
  setrand(gp_read_str(seed));
  clock_gettime(CLOCK_MONOTONIC,&a); bnf=bnfinit0(nf,0,NULL,nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC,&b); if(!bnf) pari_err(e_MISC,"row16 bnfinit failed");
  elapsed=ns(b)-ns(a); cyc=bnf_get_cyc(bnf); fu=bnf_get_fu_nocheck(bnf);
  rank=nf_get_r1(nf)+nf_get_r2(nf)-1; generators=lg(bnf_get_gen(bnf))-1;
  getrusage(RUSAGE_SELF,&usage);
  printf("{\"schema\":\"sagejs.pari-class-group/row16-pari-prepared-sample-v1\","
         "\"kernelNanoseconds\":\"%" PRIu64 "\",\"projection\":{"
         "\"schema\":\"sagejs.pari-class-group/row16-flag-zero-matched-projection-v1\","
         "\"field\":{\"id\":\"3.1.1002718428660.2\",\"polynomialAscending\":[\"-73393658\",\"-146523\",\"0\",\"1\"]},"
         "\"classGroup\":{\"classNumber\":",elapsed);
  emit_int(bnf_get_no(bnf)); fputs(",\"invariantFactorsSourceOrder\":",stdout); emit_vec(cyc);
  printf(",\"generatorCount\":\"%ld\"},\"unitGroup\":{\"rank\":\"%ld\","
         "\"regulatorPresent\":true,\"torsionOrder\":\"%ld\","
         "\"flagZeroStatus\":\"%s\"},\"terminalStatus\":\"pari-flag-zero-complete\"},"
         "\"processMaxRssKiB\":\"%ld\"}\n",generators,rank,bnf_get_tuN(bnf),
         typ(fu)==t_MAT && lg(fu)==1 ? "not_given(LARGE)" : "materialized",usage.ru_maxrss);
}
int main(void) {
  char command[256]; struct timespec a,b; GEN nf,v; pari_sp prepared; uint64_t prep;
  setvbuf(stdout,NULL,_IONBF,0); pari_init(1200000000,1000000); pari_mt_nbthreads=1;
  clock_gettime(CLOCK_MONOTONIC,&a);
  nf=nfinit0(gp_read_str("x^3-146523*x-73393658"),0,nbits2prec(192));
  clock_gettime(CLOCK_MONOTONIC,&b); if(!nf) return 2; prep=ns(b)-ns(a); v=pari_version();
  if(lg(v)!=4 || !equaliu(gel(v,1),2) || !equaliu(gel(v,2),17) || !equaliu(gel(v,3),4)) return 5;
  if(!equalii(nf_get_disc(nf),gp_read_str("-1002718428660"))) return 6;
  prepared=avma;
  printf("READY {\"schema\":1,\"pariVersion\":[\"2\",\"17\",\"4\"],"
         "\"preparationNanoseconds\":\"%" PRIu64 "\"}\n",prep);
  while(fgets(command,sizeof(command),stdin)) {
    size_t n=strlen(command); while(n && (command[n-1]=='\n'||command[n-1]=='\r')) command[--n]='\0';
    if(!strcmp(command,"CLOSE")) break; if(strncmp(command,"RUN ",4)) return 3;
    avma=prepared; emit_run(nf,command+4); avma=prepared;
  }
  pari_close(); return 0;
}
