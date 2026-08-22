# Deploying the Sage.js browser application

The Sage.js execution application is served by a Cloudflare Worker backed by a
private R2 bucket at `https://app.sagejs.org`. It is deliberately separate from account-bearing
origins: user programs run with dynamic JavaScript and WebAssembly enabled, so
the origin must never receive Sage.js authentication cookies, privileged API
routes, analytics injection, or third-party scripts.

Cloudflare Pages and Workers Static Assets cannot directly contain this
release: each has a 25 MiB per-file ceiling, while the authenticated Python
standard-library and lazy-module JSON files are larger. R2 stores the complete
release without splitting its mathematical artifact format. The Worker streams
those objects at the same origin, applies the reviewed isolation headers, and
caches immutable content-addressed assets at the edge.

The deployment workflow does not build an unreviewed bundle. It accepts the run
ID of a successful **Sage.js WebAssembly reproducible release** workflow,
requires both clean builds, byte reproducibility, the native oracle, and all
three browser parity jobs to have passed, then checks out that run's exact
commit. It downloads one of the mutually verified artifacts, validates its
production manifest and embedded build receipt, and stages only authenticated
runtime files. The publication step makes deterministic identity and Brotli
representations, validates both, and uploads them before a Worker deployment
atomically selects the new release.

## One-time Cloudflare and GitHub setup

These steps require an administrator of the Cloudflare account, the
`sagejs.org` zone, and the GitHub repository. They are intentionally not
automated by a repository token.

1. Create a private R2 bucket, conventionally named `sagejs`. Keep its
   `r2.dev` public endpoint disabled. Create S3-compatible Object Read & Write
   credentials restricted to this one bucket.
2. Let the first production Worker deployment attach `app.sagejs.org` as a
   Custom Domain. Cloudflare creates the DNS record and certificate. Confirm
   that the hostname is not covered by Cloudflare Access or another
   login/cookie layer.
3. Turn off Web Analytics, automatic script injection, and third-party browser
   monitoring for this project. Do not proxy application or account APIs below
   this hostname.
4. Create two GitHub environments: `sagejs-app-preview` and
   `sagejs-app-production`. Give production required reviewers and prevent it
   from deploying without approval. Restrict both environments' deployment
   branch rules to the repository's protected `main` branch; this ensures the
   workflow which receives secrets is itself reviewed even when the selected
   release artifact came from another branch. Store these environment secrets
   in both:
   - `CLOUDFLARE_API_TOKEN`: a dedicated token with Account Workers Scripts
     Edit, Account Workers R2 Storage Edit, Account Settings Read, and Zone
     Workers Routes Edit, restricted to the Sage.js account and zone;
   - `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: the bucket-scoped S3
     credentials.

5. Set these environment variables in both environments:
   - `CLOUDFLARE_ACCOUNT_ID`: the 32-hex-digit Cloudflare account ID;
   - `CLOUDFLARE_WORKER_NAME`: `sagejs-app`;
   - `R2_BUCKET_NAME`: `sagejs`;
   - `SAGEJS_PUBLIC_ORIGIN`: `https://app.sagejs.org`.

The workflow fails before artifact download if any value is missing or
malformed. It never prints or uploads either secret. Fork pull requests cannot
invoke it with secrets because deployment is manual and protected by GitHub
environments.

## Preview and production procedure

First run **Sage.js WebAssembly reproducible release** for the candidate
commit. Wait for its native oracle, two clean builds, reproducibility check,
and Chromium, Firefox, and WebKit jobs to succeed. Copy the numeric run ID from
the Actions URL.

Then run **Deploy the Sage.js browser application** with that run ID:

- choose `preview` to publish a unique `workers.dev` Worker; the optional alias
  accepts only lowercase letters, digits, and hyphens;
- choose `production` to atomically update the `app.sagejs.org` Worker. The source
  commit must be reachable from `origin/main`, GitHub environment approval is
  required, and the final check is made against `https://app.sagejs.org`.

Each run uploads the exact staged directory as a 30-day GitHub artifact and a
90-day R2 publication manifest. It uploads every object before deploying the
Worker, so a failed upload cannot partially activate a release. A preview is
validated at the URL returned by Cloudflare. Production is not considered
successful merely because the Worker deployment succeeded: the workflow also
requires the custom hostname to serve the CSP, COOP, COEP, CORP, MIME, and
credential-isolation contract.

Content-addressed mathematical assets use global immutable R2 keys. Release
shells use release-specific R2 keys; HTML, service worker, asset manifest, and
runtime version responses revalidate. Identity objects support clients which
do not advertise compression, while deterministic Brotli objects provide the
reviewed browser transfer size. A new Worker deployment changes only its
release identity. Rollback redeploys an earlier identity without mutating or
copying any release bytes.

## Current activation boundary

Repository code can create and validate the deployment, but it cannot establish
Cloudflare ownership or GitHub environment secrets. Until an administrator
performs the one-time setup above, the exact remaining activation step is:

1. confirm the private `sagejs` R2 bucket and its bucket-scoped credentials;
2. install the environment secrets and variables listed above;
3. run a successful reproducible Wasm release;
4. invoke the deployment workflow once for preview and once for production.

Do not describe `app.sagejs.org` as deployed until the production workflow's
remote-origin check passes.
