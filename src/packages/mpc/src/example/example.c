/*
$ make
$ make run
*/

#include <stdio.h>
#include <mpc.h>

int main(void) {
  mpc_t a, b, c;
  mpc_init2(a, 200);
  mpc_init2(b, 200);
  mpc_init2(c, 200);
  mpc_set_ui_ui(a, 13, 17, MPC_RNDNN);
  mpc_set_ui_ui(b, 393, 145, MPC_RNDNN);
  mpc_mul(c, a, b, MPC_RNDNN);
  mpc_sqrt(c, c, MPC_RNDNN);
  char* s_a = mpc_get_str(10, 0, a, MPC_RNDNN);
  char* s_b = mpc_get_str(10, 0, b, MPC_RNDNN);
  char* s_c = mpc_get_str(10, 0, c, MPC_RNDNN);
  printf("a=%s, b=%s, c=sqrt(a*b)=%s\n", s_a, s_b, s_c);
  fflush(stdout);
  mpc_free_str(s_a);
  mpc_free_str(s_b);
  mpc_free_str(s_c);
  mpc_clear(a);
  mpc_clear(b);
  mpc_clear(c);
  return 0;
}