# Offline secondary oracle for test/numerics/statistics/oracle-fixtures.json.
# Run with R >= 4.4 and compare at the tolerances recorded in that fixture.

emit <- function(name, value) {
  cat(name, paste(format(value, digits = 17), collapse = ","), "\n")
}

x <- c(-8, -2, 0, 1.5, 8)
emit("normal_pdf", dnorm(x))
emit("normal_cdf", pnorm(x))
emit("normal_sf", pnorm(x, lower.tail = FALSE))
emit("normal_quantiles", qnorm(c(1e-10, 0.001, 0.5, 0.975, 1 - 1e-10)))

x <- c(-10, -1, 0, 2, 10)
emit("student_t_5_pdf", dt(x, 5))
emit("student_t_5_cdf", pt(x, 5))
emit("student_t_5_sf", pt(x, 5, lower.tail = FALSE))
emit("student_t_5_quantiles", qt(c(0.001, 0.025, 0.5, 0.975, 0.999), 5))

x <- c(0, 0.1, 1, 5, 20)
emit("chi_square_4_pdf", dchisq(x, 4))
emit("chi_square_4_cdf", pchisq(x, 4))
emit("chi_square_4_sf", pchisq(x, 4, lower.tail = FALSE))
emit("chi_square_4_quantiles", qchisq(c(0.001, 0.05, 0.5, 0.95, 0.999), 4))

data <- c(1.2, 2.4, 3.1, 4.9, 5.0, 7.3)
one <- t.test(data, mu = 3.0)
emit("one_sample_statistic", one$statistic)
emit("one_sample_p_value", one$p.value)
emit("one_sample_ci", one$conf.int)

first <- c(1, 2, 4, 7, 8)
second <- c(2, 3, 3.5, 4, 6, 9)
welch <- t.test(first, second, var.equal = FALSE)
emit("welch_statistic", welch$statistic)
emit("welch_p_value", welch$p.value)
emit("welch_df", welch$parameter)
emit("welch_ci", welch$conf.int)

fit <- lm(c(1.1, 2.9, 5.2, 6.8, 9.1, 10.9) ~ c(0, 1, 2, 3, 4, 5))
emit("linear_coefficients", coef(fit))
emit("linear_standard_errors", coef(summary(fit))[, 2])
