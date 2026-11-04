/*
 * Ko-fi → GitHub relay (Cloudflare Worker, free tier is plenty).
 *
 * Ko-fi has no read API; it only POSTs a webhook on each payment. This worker
 * checks Ko-fi's verification token, drops private fields (email, and the
 * name/message if the supporter chose "private"), and forwards the payment to
 * GitHub as a repository_dispatch event. The "Sync ledger" workflow records it
 * in data/kofi.json and the site picks it up.
 *
 * Worker secrets / variables:
 *   KOFI_VERIFICATION_TOKEN  from ko-fi.com → Settings → API → Webhooks
 *   GITHUB_TOKEN             fine-grained PAT, this repo only, "Contents: Read and write"
 *   GITHUB_REPO              e.g. "ahmadhussain0033/Ledger"
 */
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Ledger Ko-fi relay is running.", { status: 200 });

    let data;
    try {
      const form = await request.formData();
      data = JSON.parse(form.get("data"));
    } catch {
      return new Response("bad request", { status: 400 });
    }
    if (!env.KOFI_VERIFICATION_TOKEN || data.verification_token !== env.KOFI_VERIFICATION_TOKEN) {
      return new Response("forbidden", { status: 403 });
    }

    const isPublic = data.is_public !== false;
    const payload = {
      id: data.kofi_transaction_id || data.message_id,
      date: data.timestamp,
      amount: data.amount,
      currency: data.currency,
      type: data.type,
      name: isPublic ? data.from_name : null,
      message: isPublic ? data.message : null,
      subscription: !!data.is_subscription_payment,
    };

    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "ledger-kofi-relay",
      },
      body: JSON.stringify({ event_type: "kofi-donation", client_payload: payload }),
    });
    // Ko-fi retries on non-200, so only report success when GitHub accepted it.
    return new Response(res.ok ? "ok" : `github ${res.status}`, { status: res.ok ? 200 : 502 });
  },
};
