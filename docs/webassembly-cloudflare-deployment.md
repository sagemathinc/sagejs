# Deploying the Sage.js browser application

The Sage.js execution application is a static Cloudflare Pages site at
`https://app.sagejs.org`. It is deliberately separate from account-bearing
origins: user programs run with dynamic JavaScript and WebAssembly enabled, so
the origin must never receive Sage.js authentication cookies, privileged API
routes, analytics injection, or third-party scripts.

The deployment workflow does not build an unreviewed bundle. It accepts the run
ID of a successful **Sage.js WebAssembly reproducible release** workflow,
requires both clean builds, byte reproducibility, the native oracle, and all
three browser parity jobs to have passed, then checks out that run's exact
commit. It downloads one of the mutually verified artifacts, validates its
production manifest and embedded build receipt, and stages only authenticated
runtime files. Cloudflare receives `website/live/dist`, including the staged
`_headers` file.

## One-time Cloudflare and GitHub setup

These steps require an administrator of the Cloudflare account, the
`sagejs.org` zone, and the GitHub repository. They are intentionally not
automated by a repository token.

1. Create a Cloudflare Pages Direct Upload project, conventionally named
   `sagejs-app`, with `main` as its production branch. Do not connect a Pages
   Git integration; GitHub Actions is the sole publisher of receipt-validated
   bytes.
2. Add `app.sagejs.org` as the project's custom domain. Let Cloudflare create
   or verify the DNS record, wait for the certificate to become active, and
   confirm that the hostname is not covered by Cloudflare Access or another
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
   - `CLOUDFLARE_API_TOKEN`: a dedicated token scoped to this account with
     Cloudflare Pages edit permission. It does not need zone-wide DNS edit
     permission after the custom domain is attached.
   - `CLOUDFLARE_ACCOUNT_ID`: the 32-hex-digit Cloudflare account ID.

5. Set environment or repository variable `CLOUDFLARE_PAGES_PROJECT` to the
   exact Pages project name. Keep the value identical in preview and
   production.

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

- choose `preview` to publish a unique `pages.dev` branch deployment; the
  optional alias accepts only lowercase letters, digits, and hyphens;
- choose `production` to publish the Pages production branch. The source
  commit must be reachable from `origin/main`, GitHub environment approval is
  required, and the final check is made against `https://app.sagejs.org`.

Each run uploads the exact staged directory as a 30-day GitHub artifact and
asks Cloudflare to associate the release commit with its Pages deployment. A
preview is validated at the URL returned by Cloudflare. Production is not
considered successful merely because the upload succeeded: the workflow also
requires the custom hostname to serve the CSP, COOP, COEP, CORP, MIME, and
credential-isolation contract.

Content-addressed mathematical assets have immutable cache headers. The HTML,
service worker, asset manifest, and runtime version pointer revalidate. This
allows a new release to warm beside the previous one and makes rollback a
Pages deployment selection instead of an in-place asset mutation.

## Current activation boundary

Repository code can create and validate the deployment, but it cannot establish
Cloudflare ownership or GitHub environment secrets. Until an administrator
performs the one-time setup above, the exact remaining activation step is:

As checked from the implementation host on 2026-08-20,
`app.sagejs.org` did not resolve in DNS and no Cloudflare account ID or API
token was provided to this workspace. This is an activation status, not a
claim about secrets which may separately exist in protected GitHub
environments.

1. create/confirm the `sagejs-app` Pages project and `app.sagejs.org` custom
   domain;
2. install the two environment secrets and the project variable;
3. run a successful reproducible Wasm release;
4. invoke the deployment workflow once for preview and once for production.

Do not describe `app.sagejs.org` as deployed until the production workflow's
remote-origin check passes.
