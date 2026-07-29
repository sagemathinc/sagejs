#include <errno.h>
#include <time.h>

int mkstemp(char *template)
{
    (void) template;
    errno = ENOSYS;
    return -1;
}

clock_t clock(void)
{
    return (clock_t) 0;
}
