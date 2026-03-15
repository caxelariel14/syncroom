import { useState, useEffect } from 'react'

export default function Home({ user, socket, accessToken, onEnterRoom, onLogout, backendUrl }) {
  const [tab, setTab] = useState('create') // create | join
  const [username, setUsername] = useState(user?.display_name || '')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Check for a pending room (user was joining before auth)
  useEffect(() => {
    const pending = sessionStorage.getItem('pending_room')
    if (pending) {
      sessionStorage.removeItem('pending_room')
      setJoinCode(pending)
      setTab('join')
    }
  }, [])

  // Listen for socket events
  useEffect(() => {
    if (!socket) return

    socket.on('room_created', ({ roomCode }) => {
      setLoading(false)
      onEnterRoom({ roomCode, isHost: true, username })
    })

    socket.on('room_joined', (data) => {
      setLoading(false)
      onEnterRoom({ ...data, isHost: false, username })
    })

    socket.on('join_error', ({ message }) => {
      setLoading(false)
      setError(message)
    })

    return () => {
      socket.off('room_created')
      socket.off('room_joined')
      socket.off('join_error')
    }
  }, [socket])

  function handleCreate() {
    if (!username.trim()) { setError('Ingresa tu nombre'); return }
    setError('')
    setLoading(true)
    socket.emit('create_room', { username: username.trim() })
  }

  function handleJoin() {
    if (!username.trim()) { setError('Ingresa tu nombre'); return }
    if (!joinCode.trim()) { setError('Ingresa el código de la sala'); return }
    setError('')
    setLoading(true)
    socket.emit('join_room', { roomCode: joinCode.trim().toUpperCase(), username: username.trim() })
  }

  return (
    <div style={{
      minHeight: '100vh',
      padding: '24px',
      background: 'radial-gradient(ellipse at 20% 20%, rgba(167,139,250,0.08) 0%, transparent 50%), var(--bg)',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 480, margin: '0 auto 40px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          </div>
          <span className="syne" style={{ fontWeight: 700, fontSize: 16 }}>SyncRoom</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user?.images?.[0]?.url && (
            <img src={user.images[0].url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{user?.display_name}</span>
          <button className="btn-ghost" onClick={onLogout} style={{ padding: '6px 14px', fontSize: 12 }}>
            Salir
          </button>
        </div>
      </header>

      {/* Main card */}
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="fade-up" style={{ marginBottom: 24 }}>
          <h1 className="syne" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
            ¿Qué quieres hacer?
          </h1>
          <p style={{ color: 'var(--muted)' }}>Crea una sala o únete a una existente.</p>
        </div>

        <div className="card fade-up" style={{ animationDelay: '0.1s' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'var(--bg)', borderRadius: 12, padding: 4 }}>
            {['create', 'join'].map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 9, fontSize: 14,
                  background: tab === t ? 'var(--card)' : 'transparent',
                  color: tab === t ? 'var(--text)' : 'var(--muted)',
                  fontFamily: 'Syne, sans-serif', fontWeight: tab === t ? 700 : 400,
                  border: tab === t ? '1px solid var(--border)' : '1px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                {t === 'create' ? '✦ Crear sala' : '↗ Unirse'}
              </button>
            ))}
          </div>

          {/* Username field (always visible) */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontFamily: 'Syne, sans-serif', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Tu nombre
            </label>
            <input
              className="input-field"
              placeholder="¿Cómo te llamas?"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={30}
            />
          </div>

          {/* Join code field */}
          {tab === 'join' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontFamily: 'Syne, sans-serif', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Código de sala
              </label>
              <input
                className="input-field"
                placeholder="Ej: ABC12"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={8}
                style={{ letterSpacing: '0.2em', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18 }}
              />
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>⚠ {error}</p>
          )}

          <button
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading || !socket}
            onClick={tab === 'create' ? handleCreate : handleJoin}
          >
            {loading ? (
              <span className="spin" style={{ width: 16, height: 16, border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block' }} />
            ) : tab === 'create' ? '✦ Crear sala' : '↗ Unirse a la sala'}
          </button>

          {tab === 'create' && (
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
              Se generará un código para compartir con tus amigos.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
