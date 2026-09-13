import { SERVICE_NOW_ZIPS, zipGate } from "./zip-config.js";
import {
  campaignSourceFromPath,
  leadSource,
  normalizeMarketingSource,
  readSourceCookie,
  resolveRequestMarketingSource,
  sourceCookieHeader
} from "./lead-source.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function requestedMarketingSource(body, request) {
  const fromBody = normalizeMarketingSource(body?.source);
  if (fromBody) return fromBody;
  const url = new URL(request.url);
  return resolveRequestMarketingSource(url) || readSourceCookie(request.headers.get("Cookie"));
}

function withMarketingNote(notes, marketing) {
  if (!marketing) return notes;
  const prefix = notes ? `${notes}\n` : "";
  return `${prefix}Marketing: ${marketing}`;
}

const TURNSTILE_FAILED = "Please complete the spam check and try again.";

async function verifyTurnstile(env, request, body) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("TURNSTILE_SECRET_KEY is not set; form spam check is skipped.");
    return { ok: true };
  }

  const token = clean(body?.turnstile_token || body?.["cf-turnstile-response"], 2048);
  if (!token) {
    return { ok: false, error: TURNSTILE_FAILED };
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || undefined
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!result.success) {
      console.warn("Turnstile rejected", result["error-codes"] || []);
      return { ok: false, error: TURNSTILE_FAILED };
    }
    return { ok: true };
  } catch (error) {
    console.error("Turnstile siteverify failed", error);
    return { ok: false, error: "We couldn't complete the spam check. Please try again." };
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function billingTerms(lead, subject = "Your saved card") {
  const plan = String(lead.plan).toLowerCase();
  const estimate = String(lead.estimate);
  const dogs = Math.max(1, Number.parseInt(lead.dogs, 10) || 1);
  const quotedPerVisit = estimate.match(/\$(\d+(?:\.\d{1,2})?)\/visit/i)?.[1];
  const quotedWeeklyTotal = estimate.match(/\$(\d+(?:\.\d{1,2})?)\/week total/i)?.[1];

  // The per-visit quote is the first-class amount for every plan. The dog-based
  // fallbacks also keep older saved leads accurate if their estimate text lacks
  // the newer /visit label.
  const fallbackPerVisit = plan.includes("twice")
    ? (40 + ((dogs - 1) * 4)) / 2
    : plan.includes("every other") || plan.includes("biweekly")
      ? 30 + ((dogs - 1) * 8)
      : 24 + ((dogs - 1) * 4);
  const perVisit = quotedPerVisit || String(fallbackPerVisit);
  const amount = `$${perVisit}`;

  if (plan.includes("twice")) {
    const weeklyTotal = quotedWeeklyTotal || String(Number(perVisit) * 2);
    return `${subject} will be charged ${amount} after each visit ($${weeklyTotal}/week total).`;
  }
  if (plan.includes("every other") || plan.includes("biweekly")) {
    return `${subject} will be charged ${amount} after each every-other-week visit.`;
  }
  return `${subject} will be charged ${amount} after each weekly visit.`;
}

function billingDisclosure(lead, subject = "Your saved card") {
  return `${billingTerms(lead, subject)} You will not be charged today. Service continues until you pause or cancel.`;
}

async function sendEmail(env, message) {
  if (!env.RESEND_API_KEY) throw new Error("Resend is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: "The Newlywed Pooper Scoopers <hello@thenewlywedco.com>",
      reply_to: env.OWNER_EMAIL || undefined,
      ...message
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Email delivery failed.");
  return data;
}

function signupEmails(env, lead) {
  const email = /^Email:\s*([^\s]+@[^\s]+)$/m.exec(lead.notes || "")?.[1] || "";
  if (!email) return [];

  const safe = {
    name: escapeHtml(lead.name),
    phone: escapeHtml(lead.phone),
    email: escapeHtml(email),
    address: escapeHtml(lead.address),
    zip: escapeHtml(lead.zip),
    plan: escapeHtml(lead.plan),
    dogs: escapeHtml(lead.dogs),
    estimate: escapeHtml(lead.estimate)
  };
  const billingTiming = billingDisclosure(lead);
  const customerText = `Hi ${lead.name},\n\nYou're signed up with The Newlywed Pooper Scoopers. Your card is securely saved.\n\nPlan: ${lead.plan}\nDogs: ${lead.dogs}\nPrice: ${lead.estimate}\nService address: ${lead.address}, ${lead.zip}\n\nWe'll text you shortly to confirm your service day. ${billingTiming}\n\nQuestions? Reply to this email or call/text (630) 730-6203.`;
  const customerHtml = `<div style="background:#fbf3e7;padding:28px 16px;color:#241c18;font-family:Georgia,serif"><div style="max-width:580px;margin:auto;background:#fffefb;border:2px solid #241c18;border-radius:20px;overflow:hidden"><div style="background:#e9748f;padding:22px 26px"><h1 style="margin:0;font-size:25px">You're all set!</h1></div><div style="padding:26px"><p style="font-size:17px">Hi ${safe.name},</p><p>Your card is securely saved.</p><div style="background:#fbe3e7;border-radius:14px;padding:16px 18px;margin:20px 0"><p style="margin:0 0 7px"><strong>Plan:</strong> ${safe.plan}</p><p style="margin:0 0 7px"><strong>Dogs:</strong> ${safe.dogs}</p><p style="margin:0 0 7px"><strong>Price:</strong> ${safe.estimate}</p><p style="margin:0"><strong>Service address:</strong> ${safe.address}, ${safe.zip}</p></div><p>We'll text you shortly to confirm your service day. ${escapeHtml(billingTiming)}</p><p style="margin-top:24px">Questions? Reply to this email or call/text <strong>(630) 730-6203</strong>.</p><p style="margin:24px 0 0">Ryan &amp; the Newlywed Pooper Scoopers</p></div></div></div>`;

  const messages = [sendEmail(env, {
    to: [email],
    subject: "You're signed up — The Newlywed Pooper Scoopers",
    text: customerText,
    html: customerHtml
  })];

  if (env.OWNER_EMAIL) {
    const foundUs = lead.source && lead.source !== "website" ? `\nHow they found us: ${lead.source}` : "";
    const foundUsHtml = lead.source && lead.source !== "website" ? `<p><strong>How they found us:</strong> ${escapeHtml(lead.source)}</p>` : "";
    const ownerText = `New customer signup\n\nName: ${lead.name}\nPhone: ${lead.phone}\nEmail: ${email}\nAddress: ${lead.address}, ${lead.zip}\nPlan: ${lead.plan}\nDogs: ${lead.dogs}\nPrice: ${lead.estimate}${foundUs}\n\nCard status: Saved and ready for future charges.`;
    const ownerHtml = `<div style="font-family:Arial,sans-serif;max-width:600px"><h1>New customer signup</h1><p><strong>Name:</strong> ${safe.name}</p><p><strong>Phone:</strong> ${safe.phone}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Address:</strong> ${safe.address}, ${safe.zip}</p><p><strong>Plan:</strong> ${safe.plan}</p><p><strong>Dogs:</strong> ${safe.dogs}</p><p><strong>Price:</strong> ${safe.estimate}</p>${foundUsHtml}<p><strong>Card status:</strong> Saved and ready for future charges.</p></div>`;
    messages.push(sendEmail(env, {
      to: [env.OWNER_EMAIL],
      subject: `New customer: ${lead.name}`,
      text: ownerText,
      html: ownerHtml
    }));
  }

  return messages;
}

function interestEmails(env, lead, source, marketing) {
  const isBorder = source === "border_check";
  const safe = {
    name: escapeHtml(lead.name), phone: escapeHtml(lead.phone), email: escapeHtml(lead.email),
    address: escapeHtml(lead.address), zip: escapeHtml(lead.zip)
  };
  const customerText = isBorder
    ? `Hi ${lead.name},\n\nThanks for reaching out to The Newlywed Pooper Scoopers. We’ll confirm whether ${lead.address}, ${lead.zip} is on our route before we take the next step. No card was requested.\n\n— Ryan & the Newlywed Pooper Scoopers`
    : `Hi ${lead.name},\n\nYou’re on our list! We’re expanding around Tampa and will reach out when we’re ready to scoop your neighborhood.\n\n— Ryan & the Newlywed Pooper Scoopers`;
  const customerHtml = `<p>Hi ${safe.name},</p><p>${isBorder ? `We’ll confirm whether <strong>${safe.address}, ${safe.zip}</strong> is on our route before we take the next step. No card was requested.` : "You’re on our list! We’re expanding around Tampa and will reach out when we’re ready to scoop your neighborhood."}</p><p>— Ryan &amp; the Newlywed Pooper Scoopers</p>`;
  const messages = [sendEmail(env, { to: [lead.email], subject: isBorder ? "We’re checking your route" : "You’re on the Tampa waitlist", text: customerText, html: customerHtml })];
  if (env.OWNER_EMAIL) {
    messages.push(sendEmail(env, {
      to: [env.OWNER_EMAIL], subject: `${isBorder ? "Route check" : "Waitlist"}: ${lead.name}`,
      text: `${isBorder ? "Border route check" : "Waitlist signup"}\n\nName: ${lead.name}\nPhone: ${lead.phone}\nEmail: ${lead.email}\nAddress: ${lead.address}, ${lead.zip}${marketing ? `\nHow they found us: ${marketing}` : ""}`,
      html: `<h1>${isBorder ? "Border route check" : "Waitlist signup"}</h1><p><strong>Name:</strong> ${safe.name}</p><p><strong>Phone:</strong> ${safe.phone}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Address:</strong> ${safe.address}, ${safe.zip}</p>${marketing ? `<p><strong>How they found us:</strong> ${escapeHtml(marketing)}</p>` : ""}`
    }));
  }
  return messages;
}

async function stripeRequest(env, path, params) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured yet.");
  }

  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") body.append(key, String(value));
  });

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Stripe request failed.");
  }
  return data;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = hex(digest);
  return signatures.some((sig) => sig === expected);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/quote-leads" && request.method === "POST") {
      try {
        const body = await request.json();
        const phone = clean(body.phone, 40);
        const zip = clean(body.zip, 10);
        const plan = clean(body.plan, 40);
        const dogs = Number.parseInt(body.dogs, 10);
        const estimate = clean(body.estimate, 120);

        if (!SERVICE_NOW_ZIPS.includes(zip)) {
          return json({ ok: false, error: "Instant quotes are available only in our current service area." }, 400);
        }
        if (!body.consent || phone.replace(/\D/g, "").length < 10 || !/^\d{5}$/.test(zip) || !plan || !Number.isInteger(dogs) || dogs < 1 || dogs > 6 || !estimate) {
          return json({ ok: false, error: "Please enter a valid mobile number and agree to receive texts." }, 400);
        }

        const challenge = await verifyTurnstile(env, request, body);
        if (!challenge.ok) return json({ ok: false, error: challenge.error }, 400);

        const marketing = requestedMarketingSource(body, request);
        const source = leadSource(marketing, "quote_text_request");
        const notes = withMarketingNote("Customer consented to quote follow-up by text.", marketing);

        const result = await env.DB.prepare(
          `INSERT INTO leads (name, phone, address, zip, plan, dogs, estimate, notes, source)
           VALUES ('Quote request', ?, 'Not provided', ?, ?, ?, ?, ?, ?)`
        ).bind(phone, zip, plan, dogs, estimate, notes, source).run();

        return json({ ok: true, id: result.meta?.last_row_id ?? null }, 201);
      } catch (error) {
        console.error("Quote save failed", error);
        return json({ ok: false, error: "We couldn't save your quote. Please text us instead." }, 500);
      }
    }

    if (url.pathname === "/api/leads" && request.method === "POST") {
      try {
        const body = await request.json();
        const name = clean(body.name, 120);
        const phone = clean(body.phone, 40);
        const email = clean(body.email, 200);
        const address = clean(body.address, 200);
        const zip = clean(body.zip, 10);
        const plan = clean(body.plan, 40);
        const dogs = Number.parseInt(body.dogs, 10);
        const estimate = clean(body.estimate, 120);
        const customerNotes = clean(body.notes, 800);
        const paymentAuthorized = body.payment_authorized === true;
        const authorizationRecord = paymentAuthorized
          ? `Payment authorization: Accepted | Terms version: 2026-09-12-three-plans | Quote: ${estimate} | Plan: ${plan} | Accepted at: ${new Date().toISOString()}`
          : "";
        const notes = clean(`Email: ${email}${customerNotes ? `\n${customerNotes}` : ""}${authorizationRecord ? `\n${authorizationRecord}` : ""}`, 1400);

        if (!SERVICE_NOW_ZIPS.includes(zip)) {
          return json({ ok: false, error: "Online signup is available only in our current service area." }, 400);
        }
        if (!name || phone.replace(/\D/g, "").length !== 10 || !/^\S+@\S+\.\S+$/.test(email) || !address || !/^\d{5}$/.test(zip) || !plan || !Number.isInteger(dogs) || dogs < 1 || dogs > 6 || !estimate || !paymentAuthorized) {
          return json({ ok: false, error: "Please check the form and accept the payment authorization." }, 400);
        }

        const challenge = await verifyTurnstile(env, request, body);
        if (!challenge.ok) return json({ ok: false, error: challenge.error }, 400);

        const marketing = requestedMarketingSource(body, request);
        const source = leadSource(marketing, "website");
        const savedNotes = clean(withMarketingNote(notes, marketing), 1400);

        const result = await env.DB.prepare(
          `INSERT INTO leads (name, phone, address, zip, plan, dogs, estimate, notes, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(name, phone, address, zip, plan, dogs, estimate, savedNotes || null, source).run();

        return json({ ok: true, id: result.meta?.last_row_id ?? null }, 201);
      } catch (error) {
        console.error("Lead submission failed", error);
        return json({ ok: false, error: "We couldn't save your request. Please call or text us instead." }, 500);
      }
    }

    if (url.pathname === "/api/interest" && request.method === "POST") {
      try {
        const body = await request.json();
        const lead = {
          name: clean(body.name, 120), phone: clean(body.phone, 40), email: clean(body.email, 200),
          address: clean(body.address, 200), zip: clean(body.zip, 10)
        };
        const formSource = zipGate(lead.zip) === "border" ? "border_check" : "waitlist";
        if (!lead.name || lead.phone.replace(/\D/g, "").length !== 10 || !/^\S+@\S+\.\S+$/.test(lead.email) || !lead.address || !/^\d{5}$/.test(lead.zip)) {
          return json({ ok: false, error: "Please complete your contact information." }, 400);
        }

        const challenge = await verifyTurnstile(env, request, body);
        if (!challenge.ok) return json({ ok: false, error: challenge.error }, 400);

        const marketing = requestedMarketingSource(body, request);
        const source = leadSource(marketing, formSource);
        const notes = withMarketingNote(`Email: ${lead.email}`, marketing);

        await env.DB.prepare(
          `INSERT INTO leads (name, phone, address, zip, plan, dogs, estimate, notes, source)
           VALUES (?, ?, ?, ?, 'Not quoted', 0, 'Not quoted', ?, ?)`
        ).bind(lead.name, lead.phone, lead.address, lead.zip, notes, source).run();
        const deliveries = interestEmails(env, lead, formSource, marketing);
        if (deliveries.length) {
          ctx.waitUntil(Promise.allSettled(deliveries).then((results) => {
            results.forEach((result) => {
              if (result.status === "rejected") console.error("Interest email failed", result.reason);
            });
          }));
        }
        return json({ ok: true }, 201);
      } catch (error) {
        console.error("Interest submission failed", error);
        return json({ ok: false, error: "We couldn't save your request. Please call or text us instead." }, 500);
      }
    }

    if (url.pathname === "/api/checkout" && request.method === "POST") {
      try {
        const body = await request.json();
        const leadId = Number.parseInt(body.lead_id, 10);
        if (!Number.isInteger(leadId) || leadId < 1) {
          return json({ ok: false, error: "Invalid customer record." }, 400);
        }

        const lead = await env.DB.prepare(
          `SELECT id, name, phone, address, zip, plan, dogs, estimate, notes,
                  stripe_customer_id, stripe_checkout_session_id
           FROM leads WHERE id = ?`
        ).bind(leadId).first();

        if (!lead) return json({ ok: false, error: "Customer record not found." }, 404);
        if (!SERVICE_NOW_ZIPS.includes(lead.zip)) {
          return json({ ok: false, error: "Secure checkout is available only in our current service area." }, 400);
        }
        if (!env.STRIPE_SECRET_KEY) {
          return json({ ok: false, error: "Payments are not enabled yet." }, 503);
        }

        let customerId = lead.stripe_customer_id;
        if (!customerId) {
          const customerEmail = /^Email:\s*([^\s]+@[^\s]+)$/m.exec(lead.notes || "")?.[1] || "";
          const customer = await stripeRequest(env, "/customers", {
            name: lead.name,
            phone: lead.phone,
            email: customerEmail,
            "metadata[lead_id]": lead.id,
            "metadata[address]": lead.address,
            "metadata[zip]": lead.zip,
            "metadata[plan]": lead.plan,
            "metadata[dogs]": lead.dogs,
            "metadata[estimate]": lead.estimate
          });
          customerId = customer.id;
        }

        const origin = `${url.protocol}//${url.host}`;
        const stripeDisclosure = `${lead.plan} service: ${lead.estimate}. ${billingDisclosure(lead, "Your card")}`;

        const session = await stripeRequest(env, "/checkout/sessions", {
          mode: "setup",
          customer: customerId,
          "payment_method_types[]": "card",
          success_url: `${origin}/?payment=success&lead=${lead.id}#quote`,
          cancel_url: `${origin}/?payment=cancelled&lead=${lead.id}#quote`,
          "custom_text[submit][message]": stripeDisclosure,
          "metadata[lead_id]": lead.id,
          "metadata[plan]": lead.plan,
          "metadata[estimate]": lead.estimate,
          "setup_intent_data[metadata][lead_id]": lead.id,
          "setup_intent_data[metadata][plan]": lead.plan,
          "setup_intent_data[metadata][estimate]": lead.estimate
        });

        await env.DB.prepare(
          `UPDATE leads
           SET stripe_customer_id = ?, stripe_checkout_session_id = ?, payment_status = 'checkout_started'
           WHERE id = ?`
        ).bind(customerId, session.id, lead.id).run();

        return json({ ok: true, checkout_url: session.url, session_id: session.id });
      } catch (error) {
        console.error("Stripe checkout creation failed", error);
        return json({ ok: false, error: error?.message || "Unable to start secure checkout." }, 500);
      }
    }

    if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
      try {
        if (!env.STRIPE_WEBHOOK_SECRET) {
          return json({ ok: false, error: "Webhook is not configured." }, 503);
        }

        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature");
        const valid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
        if (!valid) return json({ ok: false, error: "Invalid signature." }, 400);

        const event = JSON.parse(rawBody);

        if (event.type === "checkout.session.completed" && event.data?.object?.mode === "setup") {
          const session = event.data.object;
          const leadId = Number.parseInt(session.metadata?.lead_id, 10);
          if (Number.isInteger(leadId)) {
            const lead = await env.DB.prepare(
              `SELECT id, name, phone, address, zip, plan, dogs, estimate, notes, source, payment_status
               FROM leads WHERE id = ?`
            ).bind(leadId).first();
            const update = await env.DB.prepare(
              `UPDATE leads
               SET stripe_customer_id = ?, stripe_checkout_session_id = ?, stripe_setup_intent_id = ?,
                   payment_status = 'card_on_file', status = 'customer'
               WHERE id = ? AND payment_status != 'card_on_file'`
            ).bind(session.customer || null, session.id || null, session.setup_intent || null, leadId).run();

            if (lead && Number(update.meta?.changes || 0) > 0) {
              const deliveries = signupEmails(env, lead);
              if (deliveries.length) {
                ctx.waitUntil(Promise.allSettled(deliveries).then((results) => {
                  results.forEach((result) => {
                    if (result.status === "rejected") console.error("Signup email failed", result.reason);
                  });
                }));
              }
            }
          }
        }

        return json({ received: true });
      } catch (error) {
        console.error("Stripe webhook failed", error);
        return json({ ok: false, error: "Webhook processing failed." }, 500);
      }
    }

    if (url.pathname === "/api/public-config" && request.method === "GET") {
      return json({
        ok: true,
        turnstileSiteKey: env.TURNSTILE_SITE_KEY || ""
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    if (request.method === "GET") {
      const campaign = campaignSourceFromPath(url.pathname);
      if (campaign) {
        const dest = new URL("/", url);
        dest.searchParams.set("src", campaign);
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${dest.pathname}${dest.search}`,
            "Set-Cookie": sourceCookieHeader(campaign, { secure: url.protocol === "https:" }),
            "cache-control": "no-store"
          }
        });
      }
    }

    const asset = await env.ASSETS.fetch(request);
    const contentType = asset.headers.get("content-type") || "";
    if (request.method === "GET" && contentType.includes("text/html")) {
      const html = await asset.text();
      const rewritten = html.replaceAll("TURNSTILE_SITE_KEY_PLACEHOLDER", env.TURNSTILE_SITE_KEY || "");
      const headers = new Headers(asset.headers);
      headers.delete("content-length");
      headers.set("cache-control", "no-store");
      return new Response(rewritten, { status: asset.status, headers });
    }

    return asset;
  }
};
