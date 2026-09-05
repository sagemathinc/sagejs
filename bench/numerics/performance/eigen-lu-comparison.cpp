// Isolated matched retained-workspace benchmark; no production dispatch.
#define EIGEN_MPL2_ONLY
#define EIGEN_DONT_PARALLELIZE
#include <Eigen/Dense>
#include "kernel_core.h"
#include <chrono>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <vector>

static_assert(EIGEN_MAJOR_VERSION == 5 && EIGEN_MINOR_VERSION == 0 && EIGEN_PATCH_VERSION == 0,
              "Pinned Eigen 5.0.0 comparison");

template<class T> void array(const T& values) {
  std::cout << '[';
  for(size_t i=0;i<values.size();++i){if(i)std::cout<<',';std::cout<<values[i];}
  std::cout << ']';
}

int main() {
  std::cout << std::setprecision(17) << '[';
  bool first=true;
  volatile double sink=0;
  for(int n: {16,32,64,128}) {
    std::vector<double> input(n*n),working(n*n),permutation(n),out(1);
    Eigen::MatrixXd a(n,n);
    for(int r=0;r<n;++r)for(int c=0;c<n;++c){
      double x=r==c?n:(((r*n+c)*17+3)%13)-6;
      input[r*n+c]=x;a(r,c)=x;
    }
    Eigen::PartialPivLU<Eigen::MatrixXd> factor(n);
    std::vector<double> source_times,eigen_times;
    int batch=n<=32?100:10;
    for(int block=0;block<10;++block)for(int order=0;order<2;++order){
      bool native_source=(order==(block%2));
      auto start=std::chrono::steady_clock::now();
      for(int k=0;k<batch;++k){
        double diagonal=n+(k%2)*0.001;
        if(native_source){
          input[0]=diagonal;
          sagejs_native_status status={SAGEJS_NATIVE_OK,nullptr};
          double code=-1;
          int success=sagejs_kernel_factor_partial_pivot(&status,&code,
            {input.data(),input.size()},{working.data(),working.size()},
            {permutation.data(),permutation.size()},{out.data(),out.size()},n,n);
          if(!success||code!=0)throw std::runtime_error("typed-source LU failed");
          sink+=working[0];
        }else{
          a(0,0)=diagonal;
          factor.compute(a);
          sink+=factor.matrixLU()(0,0);
        }
      }
      double ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()/batch;
      if(block>=3)(native_source?source_times:eigen_times).push_back(ms);
    }
    std::vector<double> eigen_packed(n*n),eigen_permutation(n);
    for(int r=0;r<n;++r)for(int c=0;c<n;++c)eigen_packed[r*n+c]=factor.matrixLU()(r,c);
    for(int original=0;original<n;++original)eigen_permutation[factor.permutationP().indices()[original]]=original;
    if(!first)std::cout<<',';first=false;
    std::cout<<"{\"n\":"<<n<<",\"batch\":"<<batch<<",\"source_ms\":";array(source_times);
    std::cout<<",\"eigen_ms\":";array(eigen_times);
    std::cout<<",\"input\":";array(input);
    std::cout<<",\"source_packed\":";array(working);
    std::cout<<",\"source_permutation\":";array(permutation);
    std::cout<<",\"eigen_packed\":";array(eigen_packed);
    std::cout<<",\"eigen_permutation\":";array(eigen_permutation);
    std::cout<<'}';
  }
  std::cout<<"]\n";
  return sink>0?0:1;
}
