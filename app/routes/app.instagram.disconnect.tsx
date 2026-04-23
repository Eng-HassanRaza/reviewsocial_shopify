import type { ActionFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const handle = { isPublic: false };

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  await prisma.instagramCredential.deleteMany({
    where: { shop: session.shop },
  });

  return Response.json({ success: true });
}

export default function DisconnectInstagram() {
  return null;
}

