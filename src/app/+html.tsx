/**
 * Root HTML for the web build (dev server and static export).
 *
 * Expo's default template has no title and no favicon, so the tab read as
 * an empty string. This sets the Scanvas name, icon and theme colour, and
 * a description for link previews. Icons are served from /public.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Scanvas</title>
        <meta name="application-name" content="Scanvas" />
        <meta name="description" content="What you owe, and the few things this week worth going to." />
        <meta name="theme-color" content="#3D7BFF" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
        <link rel="apple-touch-icon" href="/favicon-192.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
