# Deploy to Vercel

Import this repository in Vercel. Keep the project root at the repository root and use the checked-in `vercel.json` settings: Elysia and Bun 1.4.x. Leave Output Directory at its framework default. No Docker image is needed.

Set these environment variables before the first deployment:

| Variable                    | Value                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SITE_URL`                  | Your public HTTPS origin, without a path. Set separately for Production and Preview.                                     |
| `MAXMIND_CITY_DB_URL`       | Direct HTTPS download URL for your City `.mmdb` file. Required for Git deployments because databases are ignored by Git. |
| `MAXMIND_ASN_DB_URL`        | Optional direct HTTPS download URL for the ASN `.mmdb` file. Without it, ASN fields are `null`.                          |
| `WEBMCP_ORIGIN_TRIAL_TOKEN` | Optional token issued for the deployed origin.                                                                           |

Use a trusted file host or a signed download URL that remains valid during the build. URLs must return raw MMDB bytes, not an HTML page or a compressed archive. Downloads run at build time, not during user requests. Existing local files are reused; downloaded files are validated before the build succeeds. Keep database URLs in Vercel environment settings, not in Git.

Leave `MAXMIND_CITY_DB` and `MAXMIND_ASN_DB` at their defaults, or point them to `.mmdb` files directly inside `assets/`. `PORT`, `HOST` and `TRUSTED_PROXIES` are not needed on Vercel. The dedicated entrypoint uses Vercel's protected `x-vercel-forwarded-for` header; local and Docker execution retain their existing trusted-proxy rules.

The Function includes the databases and built HTML. Only the generated CSS, JavaScript, fonts and brand images are published statically. HTML, API responses, robots and sitemap go through the application. Memory caching is per warm Function instance and resets on cold starts or redeployments.

Deploy from the dashboard, or use the CLI from the repository root after configuring the project:

```sh
bunx vercel deploy
```

Check `/health`, `/ip`, `/1.1.1.1/json`, `/robots.txt` and the homepage before promoting to production. `SITE_URL` changes on Vercel require a new deployment. Update database download URLs and redeploy to refresh records.

References: [Elysia on Vercel](https://vercel.com/docs/frameworks/backend/elysia), [Bun runtime](https://vercel.com/docs/functions/runtimes/bun), [Function configuration](https://vercel.com/docs/project-configuration/vercel-json#functions), [request headers](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).
