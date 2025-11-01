// app/routes/judgeme.callback.tsx
import { redirect } from "react-router";

export const handle = { isPublic: true };

/* --- tiny cookie helpers --- */
function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function clearCookieHeader(name: string) {
  return [
    `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/judgeme/callback; Max-Age=0`,
  ];
}

/* --- loader: validate state, exchange code, then redirect into Admin Apps URL --- */
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // read cookies set in /judgeme/redirect
  const stateCookie = getCookie(request, "jm_oauth_state");
  const shop = getCookie(request, "jm_oauth_shop");
  const host = getCookie(request, "jm_oauth_host"); // ok if null

  // Build your Admin Apps URL (embedded context)
  const apiKey = process.env.SHOPIFY_API_KEY!;
  const adminAppBase = shop && apiKey
    ? `https://${shop}/admin/apps/${apiKey}/app`
    : null; // fallback later if missing

  // helper to finish (success or error) and clear temp cookies
  const finish = (search: Record<string, string>) => {
    const headers = new Headers();
    clearCookieHeader("jm_oauth_state").forEach((c) =>
      headers.append("Set-Cookie", c),
    );
    clearCookieHeader("jm_oauth_shop").forEach((c) =>
      headers.append("Set-Cookie", c),
    );
    clearCookieHeader("jm_oauth_host").forEach((c) =>
      headers.append("Set-Cookie", c),
    );

    const qs = new URLSearchParams(search);

    // Prefer redirecting back into Shopify Admin embedded context
    if (adminAppBase) {
      return redirect(`${adminAppBase}?${qs.toString()}`, { headers });
    }
    // Fallback: redirect to your own /app (top-level) if apiKey or shop missing
    return redirect(`/app?${qs.toString()}`, { headers });
  };

  if (error) return finish({ judgeme_error: error });
  if (!code || !state) return finish({ judgeme_error: "missing_params" });
  if (!stateCookie || stateCookie !== state || !shop) {
    return finish({ judgeme_error: "invalid_state" });
  }

  const tokenUrl = process.env.JUDGEME_TOKEN_URL!;
  const clientId = process.env.JUDGEME_CLIENT_ID!;
  const clientSecret = process.env.JUDGEME_CLIENT_SECRET!;
  const redirectUri = `${process.env.APP_URL}/judgeme/callback`;

  try {
    // Attempt 1: send credentials in body (common)
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    let resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    // Attempt 2: retry using HTTP Basic auth if unauthorized
    if (resp.status === 400 || resp.status === 401) {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const form2 = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });
      resp = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: form2,
      });
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token exchange failed (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    const accessToken: string | undefined =
      json.access_token || json.token || json?.data?.access_token;
    if (!accessToken) throw new Error("No access_token in response");

    // TODO: persist token for this shop (Prisma, etc.)
    // await saveJudgeMeToken({ shop, token: accessToken });

    // Success: back into Admin embedded app with a success flag
    const q: Record<string, string> = { judgeme_connected: "1" };
    if (host) q.host = host;
    if (shop) q.shop = shop;
    return finish(q);
  } catch (e: any) {
    const q: Record<string, string> = {
      judgeme_error: e?.message || "oauth_failed",
    };
    if (host) q.host = host;
    if (shop) q.shop = shop;
    return finish(q);
  }
}

export default function Callback() {
  return null;
}
