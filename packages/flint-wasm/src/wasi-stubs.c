#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

int mkstemp(char *template_name)
{
    static unsigned long sequence = 0;
    static const char digits[] =
        "0123456789abcdefghijklmnopqrstuvwxyz";
    char *suffix;
    unsigned long value;
    int attempt;
    int index;
    int descriptor;

    suffix = strstr(template_name, "XXXXXX");
    if (suffix == NULL || suffix[6] != '\0')
    {
        errno = EINVAL;
        return -1;
    }

    for (attempt = 0; attempt < 1024; attempt++)
    {
        value = ++sequence;
        for (index = 5; index >= 0; index--)
        {
            suffix[index] = digits[value % 36];
            value /= 36;
        }
        descriptor = open(
            template_name,
            O_CREAT | O_EXCL | O_RDWR,
            0600);
        if (descriptor >= 0 || errno != EEXIST)
            return descriptor;
    }

    errno = EEXIST;
    return -1;
}

clock_t clock(void)
{
    return (clock_t) 0;
}
