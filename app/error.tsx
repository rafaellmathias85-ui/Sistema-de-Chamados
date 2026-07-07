'use client'

import { useEffect, useState } from 'react'

const CHUNK_RELOAD_KEY = 'wr-chunk-reload'
const RELOAD_COOLDOWN_MS = 30_000

function isChunkError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Failed to fetch dynamically imported module')
  )
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    if (!isChunkError(error)) return

    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY)
    const now = Date.now()

    if (lastReload && now - parseInt(lastReload, 10) < RELOAD_COOLDOWN_MS) {
      return
    }

    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
    setReloading(true)
    window.location.reload()
  }, [error])

  if (reloading || isChunkError(error)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          color: '#94a3b8',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <svg
          style={{ animation: 'spin 1s linear infinite', width: 32, height: 32 }}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <circle
            style={{ opacity: 0.25 }}
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            style={{ opacity: 0.75 }}
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <span style={{ fontSize: '14px' }}>Atualizando para nova versão...</span>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
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
          gap: '12px',
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
          Algo deu errado
        </h1>
        <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
          Ocorreu um erro inesperado.
        </p>

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
          onClick={reset}
          style={{
            marginTop: '8px',
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
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
