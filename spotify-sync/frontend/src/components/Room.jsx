import { useState, useEffect, useRef } from 'react'

export default function Room({ user, socket, accessToken, roomData, onLeave, backendUrl }) {
  const { roomCode, isHost: initialIsHost, username } = roomData

  const [isHost, setIsHost] = useState(initialIsHost)
  const [members, setMembers] = useState(roomData.members || [username])
  const [playlist, setPlaylist] = useState(roomData.playlist || null)
  const [currentTrack, setCurrentTrack] = useState(roomData.currentTrack || null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [streamCounts, setStreamCounts] = useState({})
  const [notification, setNotification] = useState(null)
  const [hostUsername, setHostUsername] = useState(roomData.hostUsername || username)
  const [devices, setDevices] = useState([])
  const [activeDevice, setActiveDevice] = useState(null)
  const [noDeviceWarning, setNoDeviceWarning] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const notifTimerRef = useRef(null)

  function showNotif(msg, type = 'info') {
    setNotification({ msg, type })
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
    notifTimerRef.current = setTimeout(() => setNotification(null), 3500)
  }

  // ── Fetch available Spotify devices ──────────────────────────────────────
  async function fetchDevices() {
    try {
      const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setDevices(data.devices || [])
      const active = data.devices?.find(d => d.is_active) || data.devices?.[0]
      if (active) {
        setActiveDevice(active)
        setNoDeviceWarning(false)
      } else {
        setNoDeviceWarning(true)
      }
      return active
    } catch (e) {
      console.error('Fetch devices error:', e)
    }
  }

  useEffect(() => {
    fetchDevices()
    const interval = setInterval(fetchDevices, 10000)
    return () => clearInterval(interval)
  }, [accessToken])

  // ── Spotify API ───────────────────────────────────────────────────────────
  async function spotifyFetch(endpoint, options = {}) {
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (res.status === 204) return null
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `Spotify error ${res.status}`)
    }
    return res.json()
  }

  async function playTrackOnDevice(track, positionMs = 0) {
    let device = activeDevice
    if (!device) {
      device = await fetchDevices()
      if (!device) {
        setNoDeviceWarning(true)
        showNotif('Abrí Spotify en algún dispositivo primero', 'error')
        return
      }
    }
    try {
      await spotifyFetch(`/me/player/play?device_id=${device.id}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [track.uri], position_ms: positionMs }),
      })
    } catch (e) {
      console.error('Play error:', e)
      showNotif('Error al reproducir. Abrí Spotify primero.', 'error')
      setNoDeviceWarning(true)
    }
  }

  async function pauseOnDevice() {
    if (!activeDevice) return
    try {
      await spotifyFetch(`/me/player/pause?device_id=${activeDevice.id}`, { method: 'PUT' })
    } catch (e) { console.error('Pause error:', e) }
  }

  async function resumeOnDevice(positionMs = 0) {
    if (!activeDevice) { showNotif('Abrí Spotify primero', 'error'); return }
    try {
      await spotifyFetch(`/me/player/play?device_id=${activeDevice.id}`, {
        method: 'PUT',
        body: JSON.stringify({ position_ms: positionMs }),
      })
    } catch (e) { console.error('Resume error:', e) }
  }

  // ── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    socket.on('members_updated', ({ members: m, event }) => { setMembers(m); showNotif(event) })

    socket.on('playlist_loaded', ({ playlist: p, currentTrack: t }) => {
      setPlaylist(p); setCurrentTrack(t)
      showNotif(`Playlist "${p.name}" cargada`, 'success')
    })

    socket.on('play_track', ({ track, position, timestamp }) => {
      const lag = Date.now() - timestamp
      setCurrentTrack(track)
      setIsPlaying(true)
      playTrackOnDevice(track, position + lag)
    })

    socket.on('pause', () => {
      setIsPlaying(false)
      pauseOnDevice()
    })

    socket.on('resume', ({ position, timestamp }) => {
      const lag = Date.now() - timestamp
      setIsPlaying(true)
      resumeOnDevice(position + lag)
    })

    socket.on('streams_updated', ({ track, newStreams, totalStreams }) => {
      setStreamCounts(prev => ({ ...prev, [track.id]: totalStreams }))
      showNotif(`+${newStreams} streams para "${track.name}"`, 'success')
    })

    socket.on('host_changed', ({ newHostUsername }) => {
      setHostUsername(newHostUsername)
      if (newHostUsername === username) { setIsHost(true); showNotif('¡Ahora sos el host!', 'success') }
    })

    // Sync if already playing when joining
    if (roomData.currentTrack && roomData.isPlaying) {
      playTrackOnDevice(roomData.currentTrack, (roomData.position || 0) + 500)
    }

    return () => {
      socket.off('members_updated'); socket.off('playlist_loaded')
      socket.off('play_track'); socket.off('pause'); socket.off('resume')
      socket.off('streams_updated'); socket.off('host_changed')
    }
  }, [socket, activeDevice])

  // ── Host controls ─────────────────────────────────────────────────────────
  function handlePlay() { if (currentTrack) socket.emit('play_track', { track: currentTrack, position: 0 }) }
  function handlePause() { socket.emit('pause') }
  function handleResume() { socket.emit('resume') }
  function handleNext() { socket.emit('next_track') }
  function handlePrev() { socket.emit('prev_track') }

  // ── Playlist search ───────────────────────────────────────────────────────
  async function searchPlaylists() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const data = await spotifyFetch(`/search?q=${encodeURIComponent(searchQuery)}&type=playlist&limit=6`)
      setSearchResults(data.playlists.items.filter(Boolean))
    } catch (e) { showNotif('Error al buscar', 'error') }
    finally { setSearching(false) }
  }

  async function loadPlaylist(pl) {
    try {
      const data = await spotifyFetch(`/playlists/${pl.id}/tracks?limit=50&fields=items(track(id,name,uri,duration_ms,artists,album(name,images)))`)
      const tracks = data.items.map(i => i.track).filter(t => t && t.uri)
      socket.emit('set_playlist', { playlist: { id: pl.id, name: pl.name, image: pl.images?.[0]?.url, tracks } })
      setSearchResults([])
      setSearchQuery('')
    } catch (e) { showNotif('Error al cargar playlist', 'error') }
  }

  function copyCode() {
    navigator.clipboard.writeText(roomCode)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% -20%, rgba(29,185,84,0.1) 0%, transparent 50%), var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: notification.type === 'success' ? 'var(--green)' : notification.type === 'error' ? 'var(--error)' : 'var(--card)',
          color: notification.type === 'success' ? '#000' : 'var(--text)',
          padding: '10px 20px', borderRadius: '100px', fontSize: 13, fontWeight: 500,
          zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
          animation: 'fadeUp 0.3s ease',
        }}>{notification.msg}</div>
      )}

      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '20px', flex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-ghost" onClick={onLeave} style={{ padding: '8px 14px', fontSize: 13 }}>← Salir</button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="syne" style={{ fontWeight: 800, fontSize: 18 }}>Sala</span>
                <button onClick={copyCode} style={{
                  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '4px 12px', color: 'var(--green)', fontFamily: 'Syne, sans-serif',
                  fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
                }}>{copySuccess ? '✓ Copiado' : roomCode}</button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {isHost ? '👑 Sos el host' : `👑 Host: ${hostUsername}`} · {members.length}/100
              </p>
            </div>
          </div>

          {/* Device status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeDevice ? 'var(--green)' : 'var(--error)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {activeDevice ? `🎵 ${activeDevice.name}` : 'Sin Spotify activo'}
            </span>
            <button onClick={fetchDevices} className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>↻</button>
          </div>
        </div>

        {/* No device warning */}
        {noDeviceWarning && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚠️</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)' }}>Spotify no está activo</p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Abrí Spotify en tu celular, PC o web player y dale play a cualquier canción. Luego hacé clic en ↻</p>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
          {/* Left */}
          <div>
            {/* Now Playing */}
            <div className="card" style={{ marginBottom: 20 }}>
              {currentTrack ? (
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <img src={currentTrack.album?.images?.[0]?.url || ''} alt="" style={{ width: 90, height: 90, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: isPlaying ? 'var(--green)' : 'var(--muted)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {isPlaying ? '▶ Reproduciendo' : '⏸ En pausa'}
                      </span>
                    </div>
                    <h2 className="syne" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack.name}</h2>
                    <p style={{ color: 'var(--muted)', fontSize: 13 }}>{currentTrack.artists?.map(a => a.name).join(', ')}</p>
                    {streamCounts[currentTrack.id] && (
                      <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>📊 {streamCounts[currentTrack.id].toLocaleString()} streams</p>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🎵</div>
                  <p>{isHost ? 'Cargá una playlist para empezar' : 'Esperando al host...'}</p>
                </div>
              )}

              {/* Controls */}
              {isHost && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                  <ControlBtn onClick={handlePrev}>⏮</ControlBtn>
                  {isPlaying
                    ? <ControlBtn onClick={handlePause} big>⏸</ControlBtn>
                    : <ControlBtn onClick={currentTrack ? handleResume : handlePlay} big green>▶</ControlBtn>}
                  <ControlBtn onClick={handleNext}>⏭</ControlBtn>
                </div>
              )}
              {!isHost && (
                <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  Solo el host controla la reproducción
                </p>
              )}
            </div>

            {/* Playlist (host) */}
            {isHost && (
              <div className="card">
                <h3 className="syne" style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>
                  {playlist ? `📀 ${playlist.name}` : '🔍 Cargar playlist'}
                </h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input className="input-field" placeholder="Buscá una playlist..." value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchPlaylists()} style={{ flex: 1 }} />
                  <button className="btn-primary" onClick={searchPlaylists} disabled={searching} style={{ padding: '12px 16px' }}>
                    {searching ? '...' : 'Buscar'}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {searchResults.map(pl => (
                      <button key={pl.id} onClick={() => loadPlaylist(pl)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
                        cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.2s',
                      }}
                        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--green)'}
                        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                      >
                        {pl.images?.[0]?.url && <img src={pl.images[0].url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />}
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500 }}>{pl.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--muted)' }}>{pl.tracks?.total} canciones</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {playlist && (
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {playlist.tracks.map((track, i) => (
                      <div key={track.id + i} onClick={() => socket.emit('play_track', { track, position: 0 })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '8px',
                          borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
                          background: currentTrack?.id === track.id ? 'rgba(29,185,84,0.1)' : 'transparent',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = currentTrack?.id === track.id ? 'rgba(29,185,84,0.15)' : 'var(--bg3)'}
                        onMouseOut={e => e.currentTarget.style.background = currentTrack?.id === track.id ? 'rgba(29,185,84,0.1)' : 'transparent'}
                      >
                        <span style={{ width: 20, textAlign: 'center', fontSize: 12, color: currentTrack?.id === track.id ? 'var(--green)' : 'var(--muted)', flexShrink: 0 }}>
                          {currentTrack?.id === track.id ? '♫' : i + 1}
                        </span>
                        {track.album?.images?.[0]?.url && <img src={track.album.images[0].url} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: currentTrack?.id === track.id ? 600 : 400, color: currentTrack?.id === track.id ? 'var(--green)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists?.map(a => a.name).join(', ')}</p>
                        </div>
                        {streamCounts[track.id] && <span style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0 }}>{streamCounts[track.id]}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Members */}
            <div className="card">
              <h3 className="syne" style={{ fontWeight: 700, marginBottom: 16, fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
                <span>👥 Sala</span>
                <span style={{ color: 'var(--green)', fontSize: 20 }}>{members.length}<span style={{ color: 'var(--muted)', fontSize: 12 }}>/100</span></span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {members.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `hsl(${(m.charCodeAt(0) * 37) % 360}, 60%, 45%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {m[0]?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, color: m === username ? 'var(--green)' : 'var(--text)' }}>
                      {m} {m === username ? '(vos)' : ''} {m === hostUsername ? '👑' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stream counts */}
            {Object.keys(streamCounts).length > 0 && (
              <div className="card">
                <h3 className="syne" style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>📊 Streams</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(streamCounts).sort(([,a],[,b]) => b-a).map(([trackId, count]) => {
                    const track = playlist?.tracks.find(t => t.id === trackId) || currentTrack
                    if (!track) return null
                    return (
                      <div key={trackId}>
                        <p style={{ fontSize: 12, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: 'var(--green)', borderRadius: 2, width: `${Math.min(100, (count / Math.max(...Object.values(streamCounts))) * 100)}%`, transition: 'width 0.5s' }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--green)', fontFamily: 'Syne, sans-serif', fontWeight: 700, flexShrink: 0 }}>{count.toLocaleString()}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Share */}
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Compartí el código:</p>
              <div onClick={copyCode} style={{
                background: 'var(--bg)', border: '2px dashed var(--border)', borderRadius: 12,
                padding: '12px', cursor: 'pointer', fontFamily: 'Syne, sans-serif',
                fontSize: 28, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--green)',
              }}>{roomCode}</div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{copySuccess ? '✓ Copiado!' : 'Clic para copiar'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ControlBtn({ children, onClick, big, green }) {
  return (
    <button onClick={onClick} style={{
      width: big ? 56 : 44, height: big ? 56 : 44, borderRadius: '50%',
      background: green ? 'var(--green)' : 'var(--bg3)',
      border: green ? 'none' : '1px solid var(--border)',
      color: green ? '#000' : 'var(--text)',
      fontSize: big ? 20 : 16,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}
      onMouseOver={e => e.currentTarget.style.transform = 'scale(1.08)'}
      onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
    >{children}</button>
  )
}
