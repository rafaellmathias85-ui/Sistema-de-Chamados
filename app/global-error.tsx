'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          backgroundColor: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#f1f5f9',
              margin: 0,
            }}
          >
            Erro inesperado no sistema
          </h1>

          {error.digest && (
            <p
              style={{
                fontSize: '12px',
                color: '#64748b',
                fontFamily: 'monospace',
                backgroundColor: '#1e293b',
                padding: '6px 12px',
                borderRadius: '6px',
                margin: 0,
                wordBreak: 'break-all',
              }}
            >
              {error.digest}
            </p>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '4px',
              padding: '10px 24px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Recarregar página
          </button>
        </div>
      </body>
    </html>
  )
}
