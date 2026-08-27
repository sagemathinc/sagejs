default(parisize, 1000000000);
default(parisizemax, 4000000000);

bench_mod(n, p, multiplier, increment) = {
  my(x = Mod(1, p), a = Mod(multiplier, p), b = Mod(increment, p));
  my(started = getwalltime());
  for (index = 1, n, x = x * a + b);
  [getwalltime() - started, lift(x)];
};

bench_raw(n, p, multiplier, increment) = {
  my(x = 1);
  my(started = getwalltime());
  for (index = 1, n, x = (x * multiplier + increment) % p);
  [getwalltime() - started, x];
};

p = 65521;
multiplier = 12345;
increment = 6789;
n = 10000000;

bench_mod(1000000, p, multiplier, increment);
bench_raw(1000000, p, multiplier, increment);

print("VERSION ", version());
for (sample = 1, 7, result = bench_mod(n, p, multiplier, increment); print("MOD ", sample, " ", result[1], " ", result[2]));
for (sample = 1, 7, result = bench_raw(n, p, multiplier, increment); print("RAW ", sample, " ", result[1], " ", result[2]));
quit;
