// A local stand-in for the Razorpay and Stripe APIs, for browser tests only.
// The app reaches it through PAYMENTS_FAKE_PROVIDER_URL (refused in
// production). It keeps state in memory, serves a hosted "pay" page like the
// real providers, and delivers correctly signed webhooks to the address a
// test registers through POST /__control/webhook.
import crypto from "node:crypto";
import http from "node:http";

const port = Number(process.env.FAKE_PROVIDER_PORT || 4010);
const origin = `http://127.0.0.1:${port}`;
const links = new Map();
const sessions = new Map();
const refunds = new Map();
const hooks = new Map(); // provider -> { url, secret }
let sequence = 0;

const nextId = (prefix) => `${prefix}_${Date.now().toString(36)}${(sequence += 1).toString(36)}`;

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/** Keys whose secret part is "rejected" fail authentication, like a revoked key. */
function authorised(provider, header = "") {
  if (provider === "razorpay") {
    if (!header.startsWith("Basic ")) return false;
    const [keyId, secret] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
    return keyId?.startsWith("rzp_") && secret && secret !== "rejected";
  }
  return /^Bearer (sk|rk)_test_/.test(header) && !header.includes("rejected");
}

async function deliver(provider, body) {
  const hook = hooks.get(provider);
  if (!hook) return;
  const raw = JSON.stringify(body);
  const headers = { "Content-Type": "application/json" };
  if (provider === "razorpay") {
    headers["X-Razorpay-Signature"] = crypto.createHmac("sha256", hook.secret).update(raw).digest("hex");
    headers["X-Razorpay-Event-Id"] = nextId("evt");
  } else {
    const timestamp = Math.floor(Date.now() / 1000);
    headers["Stripe-Signature"] = `t=${timestamp},v1=${crypto.createHmac("sha256", hook.secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  }
  const response = await fetch(hook.url, { method: "POST", headers, body: raw });
  if (!response.ok) throw new Error(`webhook delivery failed with ${response.status}`);
}

function payPage(provider, id, amount, currency) {
  return `<!doctype html><html><head><title>Fake ${provider} checkout</title></head><body>
<h1>Fake ${provider} checkout</h1><p>Amount: ${amount} ${currency}</p>
<form method="post" action="/${provider}/pay/${id}"><button type="submit">Pay now</button></form>
<form method="post" action="/${provider}/pay/${id}?outcome=leave"><button type="submit">Leave without paying</button></form>
</body></html>`;
}

async function razorpay(request, response, path) {
  if (path.startsWith("/pay/")) {
    const id = path.slice(5);
    const link = links.get(id);
    if (!link) return send(response, 404, { error: { code: "NOT_FOUND" } });
    if (request.method === "GET") {
      response.writeHead(200, { "Content-Type": "text/html" });
      return response.end(payPage("razorpay", id, link.amount, link.currency));
    }
    if (link.status === "created") {
      const paymentId = nextId("pay");
      link.status = "paid";
      link.payments = [{ payment_id: paymentId, amount: link.amount, status: "captured" }];
      await deliver("razorpay", {
        event: "payment_link.paid",
        payload: {
          payment_link: { entity: { id, reference_id: link.reference_id, notes: link.notes, status: "paid" } },
          payment: { entity: { id: paymentId, amount: link.amount, currency: link.currency, status: "captured" } },
        },
      });
    }
    const target = new URL(link.callback_url);
    target.searchParams.set("razorpay_payment_link_id", id);
    response.writeHead(303, { Location: target.href });
    return response.end();
  }
  if (!authorised("razorpay", request.headers.authorization)) return send(response, 401, { error: { code: "BAD_REQUEST_ERROR" } });
  const body = request.method === "POST" ? JSON.parse((await readBody(request)) || "{}") : {};
  if (request.method === "GET" && path === "/v1/payments") return send(response, 200, { entity: "collection", count: 0, items: [] });
  const paymentMatch = path.match(/^\/v1\/payments\/([A-Za-z0-9_]+)$/);
  if (request.method === "GET" && paymentMatch) return send(response, 200, { id: paymentMatch[1], entity: "payment", method: "card", card: { network: "Visa", last4: "4242" } });
  if (request.method === "POST" && path === "/v1/payment_links") {
    const id = nextId("plink");
    links.set(id, { ...body, status: "created", payments: [] });
    return send(response, 200, { id, short_url: `${origin}/razorpay/pay/${id}`, status: "created" });
  }
  const linkMatch = path.match(/^\/v1\/payment_links\/([A-Za-z0-9_]+)(\/cancel)?$/);
  if (linkMatch) {
    const link = links.get(linkMatch[1]);
    if (!link) return send(response, 404, { error: { code: "BAD_REQUEST_ERROR" } });
    if (linkMatch[2]) {
      if (link.status !== "created") return send(response, 400, { error: { code: "BAD_REQUEST_ERROR" } });
      link.status = "cancelled";
    }
    return send(response, 200, { id: linkMatch[1], status: link.status, currency: link.currency, amount: link.amount, payments: link.payments });
  }
  const refundListMatch = path.match(/^\/v1\/payments\/([A-Za-z0-9_]+)\/refunds$/);
  if (refundListMatch && request.method === "GET") {
    const items = [...refunds].filter(([, refund]) => refund.paymentId === refundListMatch[1]).map(([id, refund]) => ({ id, amount: refund.amount, status: "processed", notes: refund.notes }));
    return send(response, 200, { entity: "collection", count: items.length, items });
  }
  const refundMatch = path.match(/^\/v1\/payments\/([A-Za-z0-9_]+)\/refund$/);
  if (refundMatch && request.method === "POST") {
    const id = nextId("rfnd");
    refunds.set(id, { paymentId: refundMatch[1], amount: body.amount, notes: body.notes });
    setTimeout(() => {
      deliver("razorpay", {
        event: "refund.processed",
        payload: { refund: { entity: { id, payment_id: refundMatch[1], amount: body.amount, status: "processed", notes: body.notes } } },
      }).catch(() => undefined);
    }, 50);
    return send(response, 200, { id, status: "pending", amount: body.amount });
  }
  return send(response, 404, { error: { code: "NOT_FOUND" } });
}

async function stripe(request, response, path) {
  if (path.startsWith("/pay/")) {
    const id = path.slice(5);
    const session = sessions.get(id);
    if (!session) return send(response, 404, { error: { code: "resource_missing" } });
    if (request.method === "GET") {
      response.writeHead(200, { "Content-Type": "text/html" });
      return response.end(payPage("stripe", id, session.amount_total, session.currency));
    }
    const leave = new URL(request.url, origin).searchParams.get("outcome") === "leave";
    if (!leave && session.status === "open") {
      session.status = "complete";
      session.payment_status = "paid";
      session.payment_intent = nextId("pi");
      await deliver("stripe", { id: nextId("evt"), type: "checkout.session.completed", data: { object: { ...session, id } } });
    }
    response.writeHead(303, { Location: leave ? session.cancel_url : session.success_url });
    return response.end();
  }
  if (!authorised("stripe", request.headers.authorization)) return send(response, 401, { error: { type: "invalid_request_error", code: "api_key_invalid" } });
  const form = new URLSearchParams(request.method === "POST" ? await readBody(request) : "");
  if (request.method === "GET" && path === "/v1/balance") return send(response, 200, { object: "balance", available: [] });
  if (request.method === "POST" && path === "/v1/checkout/sessions") {
    const id = nextId("cs_test");
    sessions.set(id, {
      object: "checkout.session",
      status: "open",
      payment_status: "unpaid",
      client_reference_id: form.get("client_reference_id"),
      metadata: { attempt_id: form.get("metadata[attempt_id]") },
      // Stripe totals the line items it was sent.
      amount_total: [...form.keys()].filter((key) => /^line_items\[\d+\]\[price_data\]\[unit_amount\]$/.test(key)).reduce((sum, key) => sum + Number(form.get(key)), 0),
      currency: form.get("line_items[0][price_data][currency]"),
      success_url: form.get("success_url"),
      cancel_url: form.get("cancel_url"),
      payment_intent: null,
    });
    return send(response, 200, { id, url: `${origin}/stripe/pay/${id}` });
  }
  const sessionMatch = path.match(/^\/v1\/checkout\/sessions\/([A-Za-z0-9_]+)(\/expire)?$/);
  if (sessionMatch) {
    const session = sessions.get(sessionMatch[1]);
    if (!session) return send(response, 404, { error: { code: "resource_missing" } });
    if (sessionMatch[2]) {
      if (session.status !== "open") return send(response, 400, { error: { code: "checkout_session_not_open" } });
      session.status = "expired";
    }
    return send(response, 200, { ...session, id: sessionMatch[1] });
  }
  const intentMatch = path.match(/^\/v1\/payment_intents\/([A-Za-z0-9_]+)$/);
  if (request.method === "GET" && intentMatch) return send(response, 200, { id: intentMatch[1], object: "payment_intent", latest_charge: { payment_method_details: { type: "card", card: { brand: "mastercard", last4: "4444" } } } });
  if (request.method === "GET" && path === "/v1/refunds") {
    const intent = new URL(request.url, origin).searchParams.get("payment_intent");
    return send(response, 200, { object: "list", data: [...refunds.values()].filter((refund) => refund.payment_intent === intent) });
  }
  if (request.method === "POST" && path === "/v1/refunds") {
    const id = nextId("re");
    const refund = { id, object: "refund", payment_intent: form.get("payment_intent"), amount: Number(form.get("amount")), status: "pending", metadata: { refund_id: form.get("metadata[refund_id]") } };
    refunds.set(id, refund);
    setTimeout(() => {
      deliver("stripe", { id: nextId("evt"), type: "refund.updated", data: { object: { ...refund, status: "succeeded" } } }).catch(() => undefined);
    }, 50);
    return send(response, 200, refund);
  }
  return send(response, 404, { error: { code: "resource_missing" } });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, origin);
    if (url.pathname === "/health") return send(response, 200, { ok: true });
    if (url.pathname === "/__control/webhook" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      hooks.set(body.provider, { url: body.url, secret: body.secret });
      return send(response, 200, { ok: true });
    }
    if (url.pathname === "/__control/state" && request.method === "GET") {
      return send(response, 200, { links: Object.fromEntries(links), sessions: Object.fromEntries(sessions), refunds: Object.fromEntries(refunds) });
    }
    if (url.pathname.startsWith("/razorpay/")) return await razorpay(request, response, url.pathname.slice("/razorpay".length));
    if (url.pathname.startsWith("/stripe/")) return await stripe(request, response, url.pathname.slice("/stripe".length));
    return send(response, 404, { error: { code: "NOT_FOUND" } });
  } catch (error) {
    return send(response, 500, { error: { code: "FAKE_PROVIDER_ERROR", message: String(error) } });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Fake payment provider on ${origin}`));
