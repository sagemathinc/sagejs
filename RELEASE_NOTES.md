# Sage.js 0.3.0

Sage.js 0.3.0 is an **early alpha release** for developers and researchers who
want to experiment with open research mathematics native to Node.js. This is
the first release we expect people outside the development team to try. Missing
functionality, API changes, and rough edges are expected; reports from real
installations are especially valuable.

Highlights include substantially broader exact arithmetic, number fields,
elliptic and hyperelliptic curves, elliptic-curve L-functions and analytic
rank, graph theory, plotting, and Jupyter support. The standalone executables
also have a smaller production native pack and much faster startup than earlier
development builds.

Supported release platforms:

- macOS arm64, signed with Apple Developer ID and notarized by Apple;
- Linux x86_64 and arm64;
- Windows x86_64, available through npm and as a standalone ZIP.

Every downloadable archive has a SHA-256 checksum. Windows Authenticode
provisioning is still in progress, so the 0.3.0 Windows executables may be
unsigned. The release workflow records the signing mode used. SmartScreen may
therefore show an unrecognized-app warning.

Install with npm on any supported platform:

```sh
npm install -g @sagemath/sagejs
```

On macOS and Linux, the standalone installer is also available:

```sh
curl -fsSL https://github.com/sagemathinc/sagejs/releases/latest/download/install.sh | sh
```

Please report installation problems and mathematical bugs at
<https://github.com/sagemathinc/sagejs/issues>.
