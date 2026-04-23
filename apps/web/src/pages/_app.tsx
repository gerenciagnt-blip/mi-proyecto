// Stub del _app del Pages Router. La app vive en App Router pero Next
// genera /404 y /500 desde el Pages Runtime; sin un _app custom usa el
// default interno que colisiona con React 19.
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
