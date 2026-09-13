# The Newlywed Pooper Scoopers

This repository is the live website for [thenewlywedco.com](https://thenewlywedco.com): a Cloudflare Worker (`rj-529-newlywed-pooper-scoopers`) that serves the homepage and saves quote, signup, and waitlist requests into the D1 database `newlywed-leads`.

The older `squarespace/` folder is leftover reference copy. The Worker files in the repo root are what the public site uses.

## Campaign links (how someone found us)

Flyer and social links should land on the homepage with a short source tag. The site remembers that tag in the browser, then saves it on the lead in D1 as `leads.source` when they later request a quote, sign up, or join the waitlist.

| Printed or posted link | Source saved on the lead |
| --- | --- |
| `thenewlywedco.com/flyer` | `flyer_qr` |
| `thenewlywedco.com/instagram` | `instagram` |
| `thenewlywedco.com/facebook` | `facebook` |
| `thenewlywedco.com/tiktok` | `tiktok` |
| `thenewlywedco.com/?src=flyer_qr` (or `?utm_source=instagram`) | the matching allowlisted tag |

If there is no campaign tag, the lead keeps today’s usual source: `website` for signups, `quote_text_request` for “text me this quote,” `border_check` or `waitlist` for out-of-area interest.

The Worker also redirects `/flyer`, `/instagram`, `/facebook`, and `/tiktok` to `/?src=…`. **If Cloudflare Redirect Rules already send those paths to the homepage without `?src=`, update those rules** so they point at:

- `/flyer` → `https://thenewlywedco.com/?src=flyer_qr`
- `/instagram` → `https://thenewlywedco.com/?src=instagram`
- `/facebook` → `https://thenewlywedco.com/?src=facebook`
- `/tiktok` → `https://thenewlywedco.com/?src=tiktok`

Otherwise the Worker never sees `/flyer` and the tag is lost.

## Turnstile spam shield (dashboard setup)

Forms that create a lead include Cloudflare Turnstile (managed mode). The Worker checks the token with Cloudflare before writing to D1.

This environment cannot create the Turnstile widget for you. Do this once in the Cloudflare dashboard:

1. Open [Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) and click **Add widget**.
2. Name it something like `Newlywed website forms`.
3. Hostnames: `thenewlywedco.com`, `www.thenewlywedco.com`, and `localhost` (so you can test on a laptop).
4. Widget mode: **Managed**.
5. Copy the **sitekey** and **secret key**.

Then attach them to the Worker:

```bash
# Public sitekey — safe to store as a Worker variable
npx wrangler vars put TURNSTILE_SITE_KEY
# paste the sitekey when prompted

# Secret — never commit this
npx wrangler secret put TURNSTILE_SECRET_KEY
# paste the secret when prompted
```

Or in the dashboard: Worker `rj-529-newlywed-pooper-scoopers` → Settings → Variables and Secrets.

Until the secret is set, the site keeps accepting forms (so a deploy does not lock the quote box). Once the secret is set, a missing or failed spam check is rejected with a plain “Please complete the spam check and try again.” message.

Local testing can use Cloudflare’s dummy always-pass keys in a `.dev.vars` file that is not committed:

```
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

## Pricing and service area

ZIP rules and prices live in `zip-config.js` and the quote widget. Do not change those unless you mean to change the business.

## Updating the site

Deploy the Worker as usual (`npx wrangler deploy`). Homepage HTML, CSS, and JavaScript are served as Worker static assets.
