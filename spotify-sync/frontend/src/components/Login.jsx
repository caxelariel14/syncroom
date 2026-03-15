export default function Login({ onLogin }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(29,185,84,0.12) 0%, transparent 60%), var(--bg)',
    }}>
      {/* Logo */}
      <div className="fade-up" style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="12" fill="var(--green)" />
            <path d="M10 20 Q20 10 30 20 Q20 30 10 20Z" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="20" cy="20" r="3" fill="#000" />
            <path d="M14 15 Q20 8 26 15" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
            <path d="M12 12 Q20 3 28 12" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
          </svg>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            SyncRoom
          </h1>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 16, maxWidth: 340 }}>
          Escucha música en Spotify al mismo tiempo con hasta <strong style={{ color: 'var(--text)' }}>100 personas</strong> en tiempo real.
        </p>
      </div>

      {/* Card */}
      <div className="card fade-up" style={{ animationDelay: '0.1s', width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 className="syne" style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Empieza a escuchar</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Necesitas una cuenta de <strong style={{ color: 'var(--text)' }}>Spotify Premium</strong> para usar SyncRoom.
          </p>
        </div>

        {/* Spotify login button */}
        <button
          className="btn-primary"
          onClick={onLogin}
          style={{ width: '100%', justifyContent: 'center', padding: '14px 28px', fontSize: 15 }}
        >
          <SpotifyIcon />
          Continuar con Spotify
        </button>

        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
          Al continuar, autorizas a SyncRoom a controlar la reproducción en tu cuenta de Spotify.
        </p>
      </div>

      {/* Features */}
      <div className="fade-up" style={{ animationDelay: '0.2s', display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { icon: '🎵', label: 'Sincronización perfecta' },
          { icon: '👥', label: 'Hasta 100 personas' },
          { icon: '📊', label: 'Contador de streams' },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
            <span>{f.icon}</span>
            <span>{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpotifyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}
