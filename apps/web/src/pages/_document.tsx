// Este archivo existe sólo para dar a Next un _document válido del Pages
// Router. La app está 100% en App Router (src/app/), pero Next 15 con
// React 19 tiene un bug al prerenderizar el /404 donde cae al Pages
// Runtime y usa un _document interno cuyo render importa <Html> de forma
// inválida (ver https://github.com/vercel/next.js/issues/70444).
//
// Con este _document custom, Next usa esta clase en lugar del bundle
// interno problemático, y el build completa sin error.
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
