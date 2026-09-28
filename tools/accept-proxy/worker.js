// Cloudflare Worker: the only piece that can safely hold a real GitHub
// credential for a public "Accept" button on the Pages site, since a static
// page cannot keep any secret itself.
//
// One-time setup (all done by the repo owner, never in this repository):
//   1. Create a GitHub fine-grained personal access token scoped to ONLY
//      hfjelstad/nordic-profile-change-and-control, permission "Issues:
//      Read and write", nothing else, with an expiry date.
//   2. `npx wrangler deploy` this worker (see wrangler.toml next to this file).
//   3. `npx wrangler secret put GITHUB_TOKEN` and paste the token from step 1
//      when prompted. This stores it as an encrypted Worker secret - it is
//      never written to any file, never committed, never visible again.
//   4. Note the deployed *.workers.dev URL and wire it into docs/app.js's
//      "Accept" button - but only once decisions/** requires PR approval
//      (CODEOWNERS + branch protection); until then, anyone who finds this
//      URL could get a decision merged immediately, since there is nothing
//      yet requiring a human to approve the PR first.
//
// Worst case if this token ever leaked: it can only add labels to issues in
// this one repository, nothing else - the actual content change still goes
// through the normal accept-decision.yml -> PR flow, so the blast radius is
// "someone opened an unwanted PR", not a hidden or destructive action.
const REPO = "hfjelstad/nordic-profile-change-and-control";
const ALLOWED_ORIGIN = "https://hfjelstad.github.io";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
    if (request.method !== "POST") return withCors(new Response("Method not allowed", { status: 405 }));

    let body;
    try {
      body = await request.json();
    } catch {
      return withCors(new Response("Invalid JSON body", { status: 400 }));
    }

    const issue = Number(body.issue);
    if (!Number.isInteger(issue) || issue <= 0) {
      return withCors(new Response("Invalid issue number", { status: 400 }));
    }

    const response = await fetch(`https://api.github.com/repos/${REPO}/issues/${issue}/labels`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "nordic-profile-ccb-accept-proxy",
      },
      body: JSON.stringify({ labels: ["accept"] }),
    });

    if (!response.ok) {
      return withCors(new Response(await response.text(), { status: response.status }));
    }
    return withCors(new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }));
  },
};

function withCors(response) {
  response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}
