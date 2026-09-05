// Isolated library-closure probe, not a production binding or qualification.
#define EIGEN_MPL2_ONLY
#define EIGEN_DONT_PARALLELIZE
#include <Eigen/Dense>
#include <cmath>

static_assert(EIGEN_MAJOR_VERSION == 5 && EIGEN_MINOR_VERSION == 0 && EIGEN_PATCH_VERSION == 0,
              "This probe is pinned to Eigen 5.0.0");

extern "C" int eigen_smoke() {
  Eigen::MatrixXd a(3, 3);
  a << 4, 1, 0, 1, 3, 1, 0, 1, 2;
  Eigen::VectorXd expected(3);
  expected << 1, 2, 3;
  Eigen::VectorXd b = a * expected;
  Eigen::PartialPivLU<Eigen::MatrixXd> lu(a);
  Eigen::HouseholderQR<Eigen::MatrixXd> qr(a);
  Eigen::LLT<Eigen::MatrixXd> llt(a);
  Eigen::SelfAdjointEigenSolver<Eigen::MatrixXd> eig(a);
  Eigen::JacobiSVD<Eigen::MatrixXd> svd(a, Eigen::ComputeThinU | Eigen::ComputeThinV);
  bool ok = llt.info() == Eigen::Success && eig.info() == Eigen::Success && svd.info() == Eigen::Success
      && (lu.solve(b) - expected).norm() < 1e-12
      && (qr.solve(b) - expected).norm() < 1e-12
      && (llt.solve(b) - expected).norm() < 1e-12
      && (a * eig.eigenvectors() - eig.eigenvectors() * eig.eigenvalues().asDiagonal()).norm() < 1e-12
      && (a - svd.matrixU() * svd.singularValues().asDiagonal() * svd.matrixV().transpose()).norm() < 1e-12;
  // Known rectangular singular values, not just backend self-reconstruction.
  Eigen::MatrixXd rectangular(3, 2);
  rectangular << 3, 0, 0, 2, 0, 0;
  Eigen::JacobiSVD<Eigen::MatrixXd> rectangular_svd(rectangular, Eigen::ComputeThinU | Eigen::ComputeThinV);
  ok = ok && rectangular_svd.info() == Eigen::Success
      && std::abs(rectangular_svd.singularValues()[0] - 3.0) < 1e-12
      && std::abs(rectangular_svd.singularValues()[1] - 2.0) < 1e-12;
  return ok ? 0 : 1;
}

#ifndef __wasi__
int main() { return eigen_smoke(); }
#endif
