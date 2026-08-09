euclid(a, b) = {
  my(c);
  while (b != 0, c = a % b; a = b; b = c);
  return(a);
};

extended_euclid(a, b) = {
  my(prevx = 1, x = 0, prevy = 0, y = 1, q, r, temporary);
  while (b != 0,
    q = a \ b; r = a % b;
    temporary = x; x = prevx - q*x; prevx = temporary;
    temporary = y; y = prevy - q*y; prevy = temporary;
    a = b; b = r;
  );
  return([a, prevx, prevy]);
};

inverse_mod_local(a, modulus) = {
  my(answer, data);
  if (a == 1 || modulus <= 1, return(a % modulus));
  data = extended_euclid(a, modulus);
  if (data[1] != 1, error("not invertible"));
  answer = data[2] % modulus;
  if (answer < 0, answer += modulus);
  return(answer);
};

trial_division(value) = {
  my(differences = [6, 4, 2, 4, 2, 4, 6, 2], divisor = 7, index = 1);
  my(limit);
  if (value <= 1, return(value));
  if (value % 2 == 0, return(2));
  if (value % 3 == 0, return(3));
  if (value % 5 == 0, return(5));
  limit = round(sqrt(value));
  while (divisor <= limit,
    if (value % divisor == 0, return(divisor));
    divisor += differences[index % 8 + 1];
    index += 1;
  );
  return(value);
};

prime_counting() = {
  my(total = 0);
  for (value = 1, 100000,
    if (value > 1 && trial_division(value) == value, total += 1)
  );
  return(total);
};

gcd_loop() = {
  my(total = 0);
  for (index = 0, 99999, total += euclid(92250, 922350 + index));
  return(total);
};

xgcd_loop() = {
  my(total = 0);
  for (index = 0, 99999, total += extended_euclid(92250, 922350 + index)[1]);
  return(total);
};

inverse_mod_loop() = {
  my(total = 0);
  for (value = 1, 99999, total += inverse_mod_local(value, 1073741827));
  return(total);
};

sum_stride() = {
  my(total = 0);
  forstep (value = 0, 999999, 3, total += 1);
  return(total);
};

recursive_fibonacci_value(n) = {
  if (n == 0 || n == 1, return(1));
  return(recursive_fibonacci_value(n - 1) + recursive_fibonacci_value(n - 2));
};
recursive_fibonacci() = recursive_fibonacci_value(30);

int_to_float() = {
  my(values = [1, 4, 6, 7, 8, 9], total = 0.0);
  for (iteration = 1, 1000000, for (index = 1, 6, total += values[index] * 1.0));
  if (total != 35000000.0, error("int_to_float mismatch"));
  return("ok");
};

float_abs() = {
  my(values = [1.0, -1.234567, 44324.0, 23.4, -43.44e-4], total = 0.0);
  for (iteration = 1, 1000000, for (index = 1, 5, total += abs(values[index])));
  if (total / 44349638911.052574 < 0.999999 ||
      total / 44349638911.052574 > 1.000001, error("float_abs mismatch"));
  return("ok");
};

int_divmod_bench() = {
  my(values = [1, 1235, 5434, 394879374, -34453], total = 0, q, r);
  for (iteration = 1, 1000000,
    for (index = 1, 5,
      q = floor(values[index] / 23);
      r = values[index] - q*23;
      total += q + r;
    )
  );
  return(total);
};

operation(name) = {
  if (name == "prime_counting", return(prime_counting()));
  if (name == "gcd_loop", return(gcd_loop()));
  if (name == "xgcd_loop", return(xgcd_loop()));
  if (name == "inverse_mod_loop", return(inverse_mod_loop()));
  if (name == "sum_stride", return(sum_stride()));
  if (name == "recursive_fibonacci", return(recursive_fibonacci()));
  if (name == "int_to_float", return(int_to_float()));
  if (name == "float_abs", return(float_abs()));
  if (name == "int_divmod", return(int_divmod_bench()));
  error("unknown landscape operation");
};

environment_integer(name, fallback) = {
  my(value = getenv(name));
  if (value == 0 || value == "", return(fallback), return(eval(value)));
};

split_names(text) = {
  my(characters = Vec(text), result = List(), current = "");
  for (index = 1, #characters,
    if (characters[index] == ",",
      listput(result, current); current = "",
      current = Str(current, characters[index])
    )
  );
  listput(result, current);
  return(Vec(result));
};

main() = {
  my(warmups = environment_integer("SAGEJS_LANDSCAPE_WARMUPS", 1));
  my(samples = environment_integer("SAGEJS_LANDSCAPE_SAMPLES", 3));
  my(selection = getenv("SAGEJS_LANDSCAPE_ONLY"));
  my(names = ["prime_counting", "gcd_loop", "xgcd_loop", "inverse_mod_loop", "sum_stride", "recursive_fibonacci", "int_to_float", "float_abs", "int_divmod"]);
  my(kind, count, name, started, answer, elapsed);
  if (selection != 0 && selection != "", names = split_names(selection));
  print("SAGEJS_COWASM_LANDSCAPE 1");
  for (kind_index = 1, 2,
    kind = if(kind_index == 1, "WARMUP", "RESULT");
    count = if(kind_index == 1, warmups, samples);
    for (sample = 0, count - 1,
      for (index = 1, #names,
        name = names[index];
        started = getwalltime();
        answer = operation(name);
        elapsed = (getwalltime() - started) * 1000000;
        print(kind, "\t", sample, "\t", name, "\t", elapsed, "\t", answer);
      )
    )
  );
  print("COMPLETE\t", warmups, "\t", samples, "\t", #names);
};
main();
quit;
