import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>SocialRevu</h1>
        <p className={styles.text}>
          Automatically turn 5-star reviews into beautiful Instagram posts with AI-generated images.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Automatic Posting</strong>. Connect Judge.me and Instagram once, then sit back as 5-star reviews automatically become Instagram posts.
          </li>
          <li>
            <strong>AI-Generated Images</strong>. Beautiful, niche-specific images created with Google Gemini and OpenAI that adapt to your brand and products.
          </li>
          <li>
            <strong>Zero Manual Work</strong>. Auto-posts new reviews every 2 hours with smart duplicate prevention and rate limiting (max 10/day).
          </li>
        </ul>
      </div>
    </div>
  );
}
