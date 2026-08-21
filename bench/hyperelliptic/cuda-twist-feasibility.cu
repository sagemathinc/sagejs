#include <cuda_runtime.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>

#define CUDA_OK(call) do { cudaError_t e = (call); if (e != cudaSuccess) { \
  std::fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, cudaGetErrorString(e)); \
  std::exit(2); } } while (0)

__global__ void twist_dot(const int32_t *a, const int8_t *chi,
                          const float *weights, float *out,
                          int rows, int orders, int terms) {
  int item = blockIdx.x * blockDim.x + threadIdx.x;
  if (item >= rows * orders) return;
  int row = item / orders;
  int order = item - row * orders;
  const int8_t *c = chi + (size_t)row * terms;
  const float *w = weights + ((size_t)row * orders + order) * terms;
  float sum = 0.0f;
  for (int n = 0; n < terms; ++n)
    sum += (float)a[n] * (float)c[n] * w[n];
  out[item] = sum;
}

static double elapsed(std::chrono::steady_clock::time_point a,
                      std::chrono::steady_clock::time_point b) {
  return std::chrono::duration<double, std::milli>(b-a).count();
}

int main(int argc, char **argv) {
  int rows = argc > 1 ? std::atoi(argv[1]) : 8192;
  int terms = argc > 2 ? std::atoi(argv[2]) : 4096;
  int orders = argc > 3 ? std::atoi(argv[3]) : 2;
  size_t a_bytes = (size_t)terms * sizeof(int32_t);
  size_t chi_bytes = (size_t)rows * terms * sizeof(int8_t);
  size_t weight_count = (size_t)rows * orders * terms;
  size_t weight_bytes = weight_count * sizeof(float);
  size_t output_count = (size_t)rows * orders;
  size_t output_bytes = output_count * sizeof(float);
  std::vector<int32_t> a(terms);
  std::vector<int8_t> chi((size_t)rows * terms);
  std::vector<float> weights(weight_count), cpu(output_count), gpu(output_count);
  for (int n=0;n<terms;++n) a[n] = (int32_t)((n*17u)%101u)-50;
  for (int r=0;r<rows;++r) for (int n=0;n<terms;++n)
    chi[(size_t)r*terms+n] = ((r*131u+n*29u)%11u)==0 ? 0 : (((r+n)&1)?-1:1);
  for (size_t i=0;i<weight_count;++i)
    weights[i] = std::exp(-float(i%terms)/317.0f) * (1.0f+float((i/terms)%orders));

  auto c0=std::chrono::steady_clock::now();
  for (int r=0;r<rows;++r) for (int k=0;k<orders;++k) {
    float sum=0.0f;
    const int8_t *c=chi.data()+(size_t)r*terms;
    const float *w=weights.data()+((size_t)r*orders+k)*terms;
    for(int n=0;n<terms;++n) sum += (float)a[n]*(float)c[n]*w[n];
    cpu[(size_t)r*orders+k]=sum;
  }
  auto c1=std::chrono::steady_clock::now();

  int32_t *da; int8_t *dc; float *dw,*dout;
  CUDA_OK(cudaMalloc(&da,a_bytes)); CUDA_OK(cudaMalloc(&dc,chi_bytes));
  CUDA_OK(cudaMalloc(&dw,weight_bytes)); CUDA_OK(cudaMalloc(&dout,output_bytes));
  auto g0=std::chrono::steady_clock::now();
  CUDA_OK(cudaMemcpy(da,a.data(),a_bytes,cudaMemcpyHostToDevice));
  CUDA_OK(cudaMemcpy(dc,chi.data(),chi_bytes,cudaMemcpyHostToDevice));
  CUDA_OK(cudaMemcpy(dw,weights.data(),weight_bytes,cudaMemcpyHostToDevice));
  twist_dot<<<(output_count+255)/256,256>>>(da,dc,dw,dout,rows,orders,terms);
  CUDA_OK(cudaGetLastError());
  CUDA_OK(cudaMemcpy(gpu.data(),dout,output_bytes,cudaMemcpyDeviceToHost));
  auto g1=std::chrono::steady_clock::now();
  double max_error=0.0;
  for(size_t i=0;i<output_count;++i) max_error=std::max(max_error,std::abs((double)cpu[i]-gpu[i]));
  std::printf("{\"rows\":%d,\"orders\":%d,\"terms\":%d,\"bytes\":%zu,"
              "\"cpu_ms\":%.6f,\"gpu_end_to_end_ms\":%.6f,\"speedup\":%.6f,"
              "\"max_abs_difference\":%.9g}\n", rows,orders,terms,
              a_bytes+chi_bytes+weight_bytes+output_bytes,
              elapsed(c0,c1),elapsed(g0,g1),elapsed(c0,c1)/elapsed(g0,g1),max_error);
  cudaFree(dout);cudaFree(dw);cudaFree(dc);cudaFree(da);
}
