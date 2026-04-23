// Stub del _error del Pages Router. Next 15 lo invoca como fallback
// para generar los HTML estáticos de /404 y /500 incluso en proyectos
// 100% App Router. Con esto evitamos el bug del bundle interno que
// importa <Html> de forma inválida con React 19.
import type { NextPage } from 'next';

type ErrorPageProps = { statusCode?: number };

const ErrorPage: NextPage<ErrorPageProps> = ({ statusCode }) => {
  const titulo = statusCode === 404 ? 'Página no encontrada' : 'Error inesperado';
  const subtitulo =
    statusCode === 404
      ? 'La ruta que buscas no existe.'
      : 'Ocurrió un error en el servidor. Intenta nuevamente.';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 1rem',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: '#0f172a',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#64748b',
          }}
        >
          {statusCode ?? 'Error'}
        </p>
        <h1
          style={{
            marginTop: '0.5rem',
            fontSize: '1.875rem',
            fontWeight: 700,
          }}
        >
          {titulo}
        </h1>
        <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#64748b' }}>
          {subtitulo}
        </p>
        <a
          href="/admin"
          style={{
            display: 'inline-block',
            marginTop: '1.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#0f172a',
            color: '#fff',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Volver al panel
        </a>
      </div>
    </main>
  );
};

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default ErrorPage;
