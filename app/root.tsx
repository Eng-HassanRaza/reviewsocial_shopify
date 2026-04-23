import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError, isRouteErrorResponse } from "react-router";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export function links() {
  return [{ rel: "stylesheet", href: polarisStyles }];
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : error instanceof Error
    ? error.message
    : 'An unexpected error occurred.';

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body style={{ fontFamily: 'Inter, sans-serif', padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '12px' }}>Something went wrong</h1>
        <p style={{ color: '#6d7175', marginBottom: '24px' }}>{message}</p>
        <a href="/app" style={{ color: '#008060', textDecoration: 'underline' }}>Go back to dashboard</a>
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
