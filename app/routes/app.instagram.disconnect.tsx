import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const handle = { isPublic: false };

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  await prisma.instagramCredential.deleteMany({
    where: { shop: session.shop },
  });

  const returnParams = new URLSearchParams({
    instagram_disconnected: "1",
    shop: session.shop,
  });
  if (host) returnParams.set("host", host);

  return redirect(`/app?${returnParams.toString()}`);
}

export default function DisconnectInstagram() {
  return null;
}

