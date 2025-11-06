import type { LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const appUrl = process.env.APP_URL!;
  const url = new URL(request.url);
  let shop = url.searchParams.get("shop") || undefined;

  if (!shop) {
    // Fallback to session only if needed
    const { session } = await authenticate.admin(request);
    shop = session.shop;
  }

  const topRedirect = `${appUrl}/judgeme/redirect?shop=${encodeURIComponent(shop!)}`;
  return Response.json({ topRedirect });
}

export default function JudgeMeTopConnect() {
  const { topRedirect } = useLoaderData() as { topRedirect: string };

  useEffect(() => {
    if (!topRedirect) return;
    if (window.top) {
      window.top.location.href = topRedirect;
    } else {
      window.location.href = topRedirect;
    }
  }, [topRedirect]);

  return (
    <div style={{ padding: 16 }}>
      <p>Redirecting to Judge.me for authorization...</p>
    </div>
  );
}


