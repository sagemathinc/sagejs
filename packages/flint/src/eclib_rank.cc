/*
 * Narrow Node-API adapter for eclib's FLINT-only 2-descent rank core.
 *
 * The patched eclib source is compiled in this target with NO_MPFP and
 * ECLIB_FLINT_RANK_ONLY.  It neither includes nor links PARI or NTL.
 */

#include "eclib_rank.h"

#include <cstdint>
#include <exception>
#include <string>
#include <vector>

#include <eclib/descent.h>
#include <eclib/gf.h>

namespace {

bool check_napi(napi_env env, napi_status status)
{
  if (status == napi_ok) return true;
  const napi_extended_error_info* info = nullptr;
  napi_get_last_error_info(env, &info);
  napi_throw_error(
      env, nullptr,
      info != nullptr && info->error_message != nullptr
          ? info->error_message
          : "Node-API call failed");
  return false;
}

bool require_arguments(
    napi_env env, napi_callback_info info, size_t expected, napi_value* values)
{
  size_t count = expected;
  if (!check_napi(env, napi_get_cb_info(env, info, &count, values, nullptr, nullptr)))
    return false;
  if (count != expected)
  {
    napi_throw_type_error(
        env, nullptr, "ecRankData expects ten BigInts and one boolean");
    return false;
  }
  return true;
}

bool bigint_to_zz(napi_env env, napi_value value, ZZ& output)
{
  napi_valuetype type;
  if (!check_napi(env, napi_typeof(env, value, &type))) return false;
  if (type != napi_bigint)
  {
    napi_throw_type_error(env, nullptr, "elliptic coefficients must be BigInts");
    return false;
  }

  int sign = 0;
  size_t count = 0;
  if (!check_napi(env, napi_get_value_bigint_words(env, value, nullptr, &count, nullptr)))
    return false;
  std::vector<uint64_t> words(count);
  if (count != 0 &&
      !check_napi(env, napi_get_value_bigint_words(
          env, value, &sign, &count, words.data())))
    return false;
  if (count == 0)
    fmpz_zero(output.data());
  else
    fmpz_set_ui_array(output.data(),
                      reinterpret_cast<const ulong*>(words.data()),
                      static_cast<slong>(count));
  if (sign) fmpz_neg(output.data(), output.data());
  return true;
}

bool value_to_bool(napi_env env, napi_value value, bool& output)
{
  napi_valuetype type;
  if (!check_napi(env, napi_typeof(env, value, &type))) return false;
  if (type != napi_boolean)
  {
    napi_throw_type_error(env, nullptr, "saturation flag must be a boolean");
    return false;
  }
  return check_napi(env, napi_get_value_bool(env, value, &output));
}

napi_value zz_to_bigint(napi_env env, const ZZ& value)
{
  napi_value output;
  if (IsZero(value))
  {
    if (!check_napi(env, napi_create_bigint_uint64(env, 0, &output))) return nullptr;
    return output;
  }

  ZZ magnitude = abs(value);
  const size_t count = static_cast<size_t>((NumBits(magnitude) + 63) / 64);
  std::vector<uint64_t> words(count);
  fmpz_get_ui_array(reinterpret_cast<ulong*>(words.data()),
                    static_cast<slong>(count), magnitude.data());
  if (!check_napi(env, napi_create_bigint_words(
      env, sign(value) < 0, count, words.data(), &output)))
    return nullptr;
  return output;
}

bool set_named(napi_env env, napi_value object, const char* name, napi_value value)
{
  return value != nullptr &&
      check_napi(env, napi_set_named_property(env, object, name, value));
}

bool set_named_long(
    napi_env env, napi_value object, const char* name, long value)
{
  napi_value converted;
  return check_napi(env, napi_create_int64(env, value, &converted)) &&
      set_named(env, object, name, converted);
}

bool set_named_bool(
    napi_env env, napi_value object, const char* name, bool value)
{
  napi_value converted;
  return check_napi(env, napi_get_boolean(env, value, &converted)) &&
      set_named(env, object, name, converted);
}

class RankCallScope {
public:
  RankCallScope() : previous_modulus_(flint_modulus)
  {
    reset_flint_random_state();
  }

  ~RankCallScope()
  {
    ZZ_pContextCache.clear();
    ZZ_p::init(previous_modulus_);
    reset_flint_random_state();
  }

private:
  ZZ previous_modulus_;
};

napi_value point_array(napi_env env, const std::vector<P2Point>& points)
{
  napi_value output;
  if (!check_napi(env, napi_create_array_with_length(env, points.size(), &output)))
    return nullptr;
  for (size_t index = 0; index < points.size(); ++index)
  {
    ZZ x, y, z;
    points[index].getcoordinates(x, y, z);
    napi_value point;
    if (!check_napi(env, napi_create_array_with_length(env, 3, &point)))
      return nullptr;
    const ZZ coordinates[] = {x, y, z};
    for (uint32_t coordinate = 0; coordinate < 3; ++coordinate)
    {
      napi_value converted = zz_to_bigint(env, coordinates[coordinate]);
      if (converted == nullptr ||
          !check_napi(env, napi_set_element(env, point, coordinate, converted)))
        return nullptr;
    }
    if (!check_napi(env, napi_set_element(
        env, output, static_cast<uint32_t>(index), point)))
      return nullptr;
  }
  return output;
}

napi_value long_array(napi_env env, const std::vector<long>& values)
{
  napi_value output;
  if (!check_napi(env, napi_create_array_with_length(env, values.size(), &output)))
    return nullptr;
  for (size_t index = 0; index < values.size(); ++index)
  {
    napi_value converted;
    if (!check_napi(env, napi_create_int64(env, values[index], &converted)) ||
        !check_napi(env, napi_set_element(
            env, output, static_cast<uint32_t>(index), converted)))
      return nullptr;
  }
  return output;
}

}  // namespace

extern "C" napi_value sagejs_ec_rank_data(
    napi_env env, napi_callback_info info)
{
  napi_value arguments[11];
  if (!require_arguments(env, info, 11, arguments)) return nullptr;

  try
  {
    RankCallScope scope;
    std::vector<bigrational> coefficients;
    coefficients.reserve(5);
    for (size_t index = 0; index < 5; ++index)
    {
      ZZ numerator, denominator;
      if (!bigint_to_zz(env, arguments[2 * index], numerator) ||
          !bigint_to_zz(env, arguments[2 * index + 1], denominator))
        return nullptr;
      if (IsZero(denominator))
      {
        napi_throw_range_error(env, nullptr, "elliptic coefficient denominator is zero");
        return nullptr;
      }
      coefficients.emplace_back(numerator, denominator);
    }
    bool request_saturation = false;
    if (!value_to_bool(env, arguments[10], request_saturation)) return nullptr;

    two_descent descent(coefficients, 0, 0, 20, 5, -1, 1);
    std::vector<P2Point> found_points;
    std::vector<P2Point> generators;
    bool saturation_attempted = false;
    bool saturated = false;
    long saturation_index = 0;
    std::vector<long> unsaturated_primes;
    if (descent.ok())
    {
      // Process all points discovered by the descent and the inexpensive
      // pre-saturation search before optionally proving saturation.
      descent.saturate(0);
      found_points = descent.getbasis();
      generators = found_points;
      if (request_saturation)
      {
        saturation_attempted = true;
        descent.saturate(-1);
        generators = descent.getbasis();
        saturated = descent.getfullmw();
        saturation_index = descent.getsaturationindex();
        unsaturated_primes = descent.getunsaturatedprimes();
      }
      else if (descent.getrank() == 0)
      {
        saturated = true;
        saturation_index = 1;
      }
    }

    const long lower = descent.getrank();
    const long upper = descent.getrankbound();
    napi_value output;
    if (!check_napi(env, napi_create_object(env, &output)) ||
        !set_named_bool(env, output, "success", descent.ok()) ||
        !set_named_bool(
            env, output, "certain", descent.getcertain() || lower == upper) ||
        !set_named_long(env, output, "rankLowerBound", lower) ||
        !set_named_long(env, output, "rankUpperBound", upper) ||
        !set_named_long(env, output, "twoSelmerRank", descent.getselmer()) ||
        !set_named(env, output, "foundPoints", point_array(env, found_points)) ||
        !set_named_bool(
            env, output, "saturationAttempted", saturation_attempted) ||
        !set_named_bool(env, output, "saturationProven", saturated) ||
        !set_named_long(env, output, "saturationIndex", saturation_index) ||
        !set_named(
            env, output, "unsaturatedPrimes",
            long_array(env, unsaturated_primes)) ||
        !set_named(env, output, "generators", point_array(env, generators)))
      return nullptr;
    return output;
  }
  catch (const std::exception& error)
  {
    napi_throw_error(env, nullptr, error.what());
    return nullptr;
  }
  catch (...)
  {
    napi_throw_error(env, nullptr, "unknown failure in the eclib rank core");
    return nullptr;
  }
}
