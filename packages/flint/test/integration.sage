flint = require("@sagemath/sagejs-flint")
print(flint.version())
print(flint.factorial(100))
print(flint.gcd(flint.factorial(100), flint.factorial(90)))
