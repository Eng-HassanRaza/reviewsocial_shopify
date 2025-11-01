// app/routes/judgeme.callback.tsx
import { redirect } from "react-router";

/* --- tiny cookie helpers --- */
function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function clearCookieHeader(name: string) {
  return [`${name}=; HttpOnly; Secure; SameSite=Lax; Path=/judgeme/callback; Max-Age=0`];
}

/* --- loader handles the OAuth code exchange, then redirects back to /app --- */
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return redirect(`/app?judgeme_error=${encodeURIComponent(error)}`);
  if (!code || !state) return redirect(`/app?judgeme_error=missing_params`);

  const stateCookie = getCookie(request, "jm_oauth_state");
  const shop = getCookie(request, "jm_oauth_shop");
  const host = getCookie(request, "jm_oauth_host");
  if (!stateCookie || stateCookie !== state || !shop) {
    return redirect(`/app?judgeme_error=invalid_state`);
  }

  const tokenUrl = process.env.JUDGEME_TOKEN_URL!;
  const clientId = process.env.JUDGEME_CLIENT_ID!;
  const clientSecret = process.env.JUDGEME_CLIENT_SECRET!;
  const redirectUri = `${process.env.APP_URL}/judgeme/callback`;

  try {
    // Try credentials in body
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

    // Fallback to HTTP Basic if needed
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

    // TODO: save token for this shop (Prisma, etc.)
    // await saveJudgeMeToken({ shop, token: accessToken });

    // Clear temp cookies and go back to embedded UI
    const headers = new Headers();
    clearCookieHeader("jm_oauth_state").forEach((c) => headers.append("Set-Cookie", c));
    clearCookieHeader("jm_oauth_shop").forEach((c) => headers.append("Set-Cookie", c));
    clearCookieHeader("jm_oauth_host").forEach((c) => headers.append("Set-Cookie", c));

    const params = new URLSearchParams({ judgeme_connected: "1" });
    if (shop) params.set("shop", shop);
    if (host) params.set("host", host);

    return redirect(`/app?${params.toString()}`, { headers });
  } catch (e: any) {
    const headers = new Headers();
    clearCookieHeader("jm_oauth_state").forEach((c) => headers.append("Set-Cookie", c));
    clearCookieHeader("jm_oauth_shop").forEach((c) => headers.append("Set-Cookie", c));
    clearCookieHeader("jm_oauth_host").forEach((c) => headers.append("Set-Cookie", c));

    const params = new URLSearchParams({
      judgeme_error: e?.message || "oauth_failed",
    });
    if (shop) params.set("shop", shop);
    if (host) params.set("host", host);

    return redirect(`/app?${params.toString()}`, { headers });
  }
}

/* Optional component (not used if redirecting immediately) */
export default function Callback() {
  return null;
}
