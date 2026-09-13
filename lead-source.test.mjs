import { strict as assert } from "node:assert";
import {
  campaignSourceFromPath,
  leadSource,
  marketingSourceFromSearchParams,
  normalizeMarketingSource,
  readSourceCookie,
  resolveRequestMarketingSource,
  sourceCookieHeader
} from "./lead-source.js";

assert.equal(normalizeMarketingSource("flyer_qr"), "flyer_qr");
assert.equal(normalizeMarketingSource("Flyer"), "flyer_qr");
assert.equal(normalizeMarketingSource("ig"), "instagram");
assert.equal(normalizeMarketingSource("fb"), "facebook");
assert.equal(normalizeMarketingSource("not-a-source"), "");
assert.equal(normalizeMarketingSource("quote_text_request"), "");
assert.equal(normalizeMarketingSource("waitlist"), "");

assert.equal(campaignSourceFromPath("/flyer"), "flyer_qr");
assert.equal(campaignSourceFromPath("/flyer/"), "flyer_qr");
assert.equal(campaignSourceFromPath("/instagram"), "instagram");
assert.equal(campaignSourceFromPath("/unknown"), "");

assert.equal(
  marketingSourceFromSearchParams(new URLSearchParams("src=tiktok")),
  "tiktok"
);
assert.equal(
  marketingSourceFromSearchParams(new URLSearchParams("utm_source=facebook")),
  "facebook"
);
assert.equal(
  marketingSourceFromSearchParams(new URLSearchParams("utm_source=evil")),
  ""
);

assert.equal(
  resolveRequestMarketingSource(new URL("https://thenewlywedco.com/flyer")),
  "flyer_qr"
);
assert.equal(
  resolveRequestMarketingSource(new URL("https://thenewlywedco.com/?src=instagram")),
  "instagram"
);

assert.equal(leadSource("instagram", "website"), "instagram");
assert.equal(leadSource("", "website"), "website");
assert.equal(leadSource("waitlist", "quote_text_request"), "quote_text_request");

const cookie = sourceCookieHeader("flyer_qr", { secure: true });
assert.match(cookie, /nps_src=flyer_qr/);
assert.match(cookie, /Secure/);
assert.equal(readSourceCookie("other=1; nps_src=tiktok"), "tiktok");
assert.equal(readSourceCookie("nps_src=nope"), "");

console.log("lead-source tests passed");
