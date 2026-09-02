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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  const firstCleanup = String(lead.plan).toLowerCase() === "weekly"
    ? "Your first cleanup is free when you start a 4-week weekly plan."
    : "";
  const customerText = `Hi ${lead.name},\n\nYou're signed up with The Newlywed Pooper Scoopers. Your card is securely saved and you have not been charged today.\n\nPlan: ${lead.plan}\nDogs: ${lead.dogs}\nPrice: ${lead.estimate}\nService address: ${lead.address}, ${lead.zip}\n\n${firstCleanup} We'll text you shortly to confirm your service day. After service begins, your saved card will be charged at the quoted price after each completed visit. Service continues until paused or canceled.\n\nQuestions? Reply to this email or call/text (630) 730-6203.`;
  const customerHtml = `<div style="background:#fbf3e7;padding:28px 16px;color:#241c18;font-family:Georgia,serif"><div style="max-width:580px;margin:auto;background:#fffefb;border:2px solid #241c18;border-radius:20px;overflow:hidden"><div style="background:#e9748f;padding:22px 26px"><h1 style="margin:0;font-size:25px">You're all set!</h1></div><div style="padding:26px"><p style="font-size:17px">Hi ${safe.name},</p><p>Your card is securely saved, and <strong>you have not been charged today.</strong></p><div style="background:#fbe3e7;border-radius:14px;padding:16px 18px;margin:20px 0"><p style="margin:0 0 7px"><strong>Plan:</strong> ${safe.plan}</p><p style="margin:0 0 7px"><strong>Dogs:</strong> ${safe.dogs}</p><p style="margin:0 0 7px"><strong>Price:</strong> ${safe.estimate}</p><p style="margin:0"><strong>Service address:</strong> ${safe.address}, ${safe.zip}</p></div>${firstCleanup ? `<p><strong>${escapeHtml(firstCleanup)}</strong></p>` : ""}<p>We'll text you shortly to confirm your service day. After service begins, your saved card will be charged at the quoted price after each completed visit. Service continues until paused or canceled.</p><p style="margin-top:24px">Questions? Reply to this email or call/text <strong>(630) 730-6203</strong>.</p><p style="margin:24px 0 0">Ryan &amp; the Newlywed Pooper Scoopers</p></div></div></div>`;

  const messages = [sendEmail(env, {
    to: [email],
    subject: "You're signed up — The Newlywed Pooper Scoopers",
    text: customerText,
    html: customerHtml
  })];

  if (env.OWNER_EMAIL) {
    const ownerText = `New customer signup\n\nName: ${lead.name}\nPhone: ${lead.phone}\nEmail: ${email}\nAddress: ${lead.address}, ${lead.zip}\nPlan: ${lead.plan}\nDogs: ${lead.dogs}\nPrice: ${lead.estimate}\n\nCard status: Saved and ready for future charges.`;
    const ownerHtml = `<div style="font-family:Arial,sans-serif;max-width:600px"><h1>New customer signup</h1><p><strong>Name:</strong> ${safe.name}</p><p><strong>Phone:</strong> ${safe.phone}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Address:</strong> ${safe.address}, ${safe.zip}</p><p><strong>Plan:</strong> ${safe.plan}</p><p><strong>Dogs:</strong> ${safe.dogs}</p><p><strong>Price:</strong> ${safe.estimate}</p><p><strong>Card status:</strong> Saved and ready for future charges.</p></div>`;
    messages.push(sendEmail(env, {
      to: [env.OWNER_EMAIL],
      subject: `New customer: ${lead.name}`,
      text: ownerText,
      html: ownerHtml
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

        if (!body.consent || phone.replace(/\D/g, "").length < 10 || !/^\d{5}$/.test(zip) || !plan || !Number.isInteger(dogs) || dogs < 1 || dogs > 6 || !estimate) {
          return json({ ok: false, error: "Please enter a valid mobile number and agree to receive texts." }, 400);
        }

        const result = await env.DB.prepare(
          `INSERT INTO leads (name, phone, address, zip, plan, dogs, estimate, notes, source)
           VALUES ('Quote request', ?, 'Not provided', ?, ?, ?, ?, 'Customer consented to quote follow-up by text.', 'quote_text_request')`
        ).bind(phone, zip, plan, dogs, estimate).run();

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
          ? `Payment authorization: Accepted | Terms version: 2026-09-02 | Quote: ${estimate} | Plan: ${plan} | Accepted at: ${new Date().toISOString()}`
          : "";
        const notes = clean(`Email: ${email}${customerNotes ? `\n${customerNotes}` : ""}${authorizationRecord ? `\n${authorizationRecord}` : ""}`, 1400);

        if (!name || phone.replace(/\D/g, "").length !== 10 || !/^\S+@\S+\.\S+$/.test(email) || !address || !/^\d{5}$/.test(zip) || !plan || !Number.isInteger(dogs) || dogs < 1 || dogs > 6 || !estimate || !paymentAuthorized) {
          return json({ ok: false, error: "Please check the form and accept the payment authorization." }, 400);
        }

        const result = await env.DB.prepare(
          `INSERT INTO leads (name, phone, address, zip, plan, dogs, estimate, notes, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'website')`
        ).bind(name, phone, address, zip, plan, dogs, estimate, notes || null).run();

        return json({ ok: true, id: result.meta?.last_row_id ?? null }, 201);
      } catch (error) {
        console.error("Lead submission failed", error);
        return json({ ok: false, error: "We couldn't save your request. Please call or text us instead." }, 500);
      }
    }

    if (url.pathname === "/api/checkout" && request.method === "POST") {
      try {
        if (!env.STRIPE_SECRET_KEY) {
          return json({ ok: false, error: "Payments are not enabled yet." }, 503);
        }

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
        const session = await stripeRequest(env, "/checkout/sessions", {
          mode: "setup",
          customer: customerId,
          "payment_method_types[]": "card",
          success_url: `${origin}/?payment=success&lead=${lead.id}#quote`,
          cancel_url: `${origin}/?payment=cancelled&lead=${lead.id}#quote`,
          "metadata[lead_id]": lead.id,
          "setup_intent_data[metadata][lead_id]": lead.id
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
              `SELECT id, name, phone, address, zip, plan, dogs, estimate, notes, payment_status
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

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
