// Signs the MusicKit developer token Crate needs to read an Apple Music library (Library tab).
// The private key stays here as a Supabase secret; the page only ever gets the signed token.
//   supabase secrets set APPLE_TEAM_ID=… APPLE_KEY_ID=… APPLE_MUSIC_KEY="$(cat AuthKey_XXXX.p8)"
//   optional: APPLE_MUSIC_ORIGINS=https://your-crate.vercel.app,https://you.github.io (limits where it works)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DAY = 86400;
let cached: { token: string; until: number } | null = null;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64json = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

// An ES256 JWT, as Apple asks: header { alg, kid }, claims { iss: team, iat, exp } (at most 6 months).
async function sign(team: string, kid: string, pem: string, origins: string[]): Promise<{ token: string; until: number }> {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000), exp = now + 30 * DAY;
  const claims: Record<string, unknown> = { iss: team, iat: now, exp };
  if (origins.length) claims.origin = origins;
  const data = b64json({ alg: "ES256", kid }) + "." + b64json(claims);
  // WebCrypto's ECDSA signature is already r‖s, the form JWTs use.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data)));
  return { token: data + "." + b64url(sig), until: (exp - DAY) * 1000 };   // renewed a day before it expires
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const team = Deno.env.get("APPLE_TEAM_ID"), kid = Deno.env.get("APPLE_KEY_ID"), pem = Deno.env.get("APPLE_MUSIC_KEY");
  if (!team || !kid || !pem) return reply(503, { error: "Apple Music isn’t set up on this Crate yet." });
  try {
    if (!cached || Date.now() > cached.until) {
      const origins = (Deno.env.get("APPLE_MUSIC_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
      cached = await sign(team, kid, pem, origins);
    }
    return new Response(JSON.stringify({ token: cached.token }), {
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    console.error(e);
    return reply(500, { error: "Couldn’t sign the Apple Music token. Check APPLE_MUSIC_KEY." });
  }
});
