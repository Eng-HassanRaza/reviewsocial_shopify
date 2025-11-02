import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const handle = { isPublic: false };

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // Get the credential before deleting it
  const credential = await prisma.judgeMeCredential.findUnique({
    where: { shop: session.shop },
  });

  // Revoke the token on Judge.me's side if it exists
  if (credential?.accessToken) {
    try {
      const revokeUrl = process.env.JUDGEME_REVOKE_URL || "https://app.judge.me/oauth/revoke";
      const clientId = process.env.JUDGEME_CLIENT_ID!;
      const clientSecret = process.env.JUDGEME_CLIENT_SECRET!;

      // Try revoking with token in body
      await fetch(revokeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          token: credential.accessToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
    } catch (error) {
      console.error("Failed to revoke Judge.me token:", error);
      // Continue with disconnect even if revocation fails
    }
  }

  // Delete the credential from our database
  await prisma.judgeMeCredential.deleteMany({
    where: { shop: session.shop },
  });

  return redirect("/app?judgeme_disconnected=1");
}

export default function DisconnectJudgeMe() {
  return null;
}


