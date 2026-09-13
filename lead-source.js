// Shared by the browser and Worker. Keep campaign tags allowlisted so
// visitors can only attach known marketing sources to a lead.

export const MARKETING_SOURCES = Object.freeze([
  "flyer_qr",
  "instagram",
  "facebook",
  "tiktok",
  "website"
]);

export const CAMPAIGN_PATHS = Object.freeze({
  "/flyer": "flyer_qr",
  "/instagram": "instagram",
  "/facebook": "facebook",
  "/tiktok": "tiktok"
});

const SOURCE_ALIASES = Object.freeze({
  flyer: "flyer_qr",
  flyer_qr: "flyer_qr",
  instagram: "instagram",
  ig: "instagram",
  facebook: "facebook",
  fb: "facebook",
  tiktok: "tiktok",
  website: "website"
});

export const SOURCE_STORAGE_KEY = "nps_marketing_source";
export const SOURCE_COOKIE_NAME = "nps_src";

export function normalizePathname(pathname) {
  if (!pathname) return "/";
  const trimmed = String(pathname).replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function campaignSourceFromPath(pathname) {
  return CAMPAIGN_PATHS[normalizePathname(pathname)] || "";
}

export function normalizeMarketingSource(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return SOURCE_ALIASES[key] || "";
}

export function marketingSourceFromSearchParams(params) {
  if (!params) return "";
  return normalizeMarketingSource(params.get("src") || params.get("utm_source"));
}

export function resolveRequestMarketingSource(url) {
  return campaignSourceFromPath(url.pathname) || marketingSourceFromSearchParams(url.searchParams);
}

export function leadSource(requested, fallback) {
  return normalizeMarketingSource(requested) || fallback;
}

export function sourceCookieHeader(source, { secure = false } = {}) {
  const value = normalizeMarketingSource(source);
  if (!value) return "";
  return `${SOURCE_COOKIE_NAME}=${value}; Path=/; Max-Age=2592000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function readSourceCookie(cookieHeader) {
  if (!cookieHeader) return "";
  const parts = String(cookieHeader).split(";");
  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SOURCE_COOKIE_NAME) {
      try {
        return normalizeMarketingSource(decodeURIComponent(rest.join("=")));
      } catch {
        return normalizeMarketingSource(rest.join("="));
      }
    }
  }
  return "";
}
