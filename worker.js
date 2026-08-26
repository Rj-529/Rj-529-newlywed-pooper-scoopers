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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/leads" && request.method === "POST") {
      try {
        const body = await request.json();
        const name = clean(body.name, 120);
        const phone = clean(body.phone, 40);
        const address = clean(body.address, 200);
        const zip = clean(body.zip, 10);
        const plan = clean(body.plan, 40);
        const dogs = Number.parseInt(body.dogs, 10);
        const estimate = clean(body.estimate, 120);
        const notes = clean(body.notes, 1000);

        if (!name || !phone || !address || !/^\d{5}$/.test(zip) || !plan || !Number.isInteger(dogs) || dogs < 1 || dogs > 6 || !estimate) {
          return json({ ok: false, error: "Please check the form and try again." }, 400);
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

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
