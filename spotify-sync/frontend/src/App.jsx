import { useState, useEffect, useRef } from 'react'
import Login from './components/Login.jsx'
import Home from './components/Home.jsx'
import Room from './components/Room.jsx'
import { io } from 'socket.io-client'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default function App() {
  const [screen, setScreen] = useState('loading') // loading | login | home | room
  const [accessToken, setAccessToken] = useState(null)
  const [refreshToken, setRefreshToken] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [roomData, setRoomData] = useState(null)
  const socketRef = useRef(null)
  const tokenExpiryRef = useRef(null)

  // On mount: check URL params for tokens (after Spotify OAuth redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const access = params.get('access_token')
    const refresh = params.get('refresh_token')
    const expires = params.get('expires_in')
    const state = params.get('state') // pending room code
    const error = params.get('error')

    // Clean URL
    window.history.replaceState({}, '', '/')

    if (error) {
      console.error('Auth error:', error)
      setScreen('login')
      return
    }

    if (access && refresh) {
      setAccessToken(access)
      setRefreshToken(refresh)
      scheduleTokenRefresh(parseInt(expires) || 3600, refresh)
      fetchUserProfile(access).then(profile => {
        setUserProfile(profile)
        setScreen('home')
        // If they were joining a room before auth, save that state
        if (state) {
          sessionStorage.setItem('pending_room', state)
        }
      })
      return
    }

    // Check if already logged in via sessionStorage
    const saved = sessionStorage.getItem('spotify_tokens')
    if (saved) {
      const { access: a, refresh: r } = JSON.parse(saved)
      setAccessToken(a)
      setRefreshToken(r)
      fetchUserProfile(a).then(profile => {
        if (profile) {
          setUserProfile(profile)
          setScreen('home')
        } else {
          sessionStorage.removeItem('spotify_tokens')
          setScreen('login')
        }
      })
      return
    }

    setScreen('login')
  }, [])

  // Save tokens to sessionStorage when they update
  useEffect(() => {
    if (accessToken && refreshToken) {
      sessionStorage.setItem('spotify_tokens', JSON.stringify({ access: accessToken, refresh: refreshToken }))
    }
  }, [accessToken, refreshToken])

  // Setup socket when we have a user
  useEffect(() => {
    if (!userProfile) return

    const socket = io(BACKEND_URL, { transports: ['websocket'] })
    socketRef.current = socket

    return () => {
      socket.disconnect()
    }
  }, [userProfile])

  function scheduleTokenRefresh(expiresIn, refresh) {
    if (tokenExpiryRef.current) clearTimeout(tokenExpiryRef.current)
    // Refresh 60s before expiry
    const ms = (expiresIn - 60) * 1000
    tokenExpiryRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/refresh_token?refresh_token=${refresh}`)
        const data = await res.json()
        if (data.access_token) {
          setAccessToken(data.access_token)
          scheduleTokenRefresh(data.expires_in || 3600, refresh)
        }
      } catch (e) {
        console.error('Token refresh failed', e)
      }
    }, ms)
  }

  async function fetchUserProfile(token) {
    try {
      const res = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  function handleLogin() {
    window.location.href = `${BACKEND_URL}/login`
  }

  function handleLogout() {
    sessionStorage.clear()
    setAccessToken(null)
    setRefreshToken(null)
    setUserProfile(null)
    setRoomData(null)
    setScreen('login')
  }

  function handleEnterRoom(data) {
    setRoomData(data)
    setScreen('room')
  }

  function handleLeaveRoom() {
    setRoomData(null)
    setScreen('home')
  }

  if (screen === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spin" style={{ width: 32, height: 32, border: '3px solid #1db954', borderTopColor: 'transparent', borderRadius: '50%' }} />
      </div>
    )
  }

  if (screen === 'login') {
    return <Login onLogin={handleLogin} />
  }

  if (screen === 'home') {
    return (
      <Home
        user={userProfile}
        socket={socketRef.current}
        accessToken={accessToken}
        onEnterRoom={handleEnterRoom}
        onLogout={handleLogout}
        backendUrl={BACKEND_URL}
      />
    )
  }

  if (screen === 'room') {
    return (
      <Room
        user={userProfile}
        socket={socketRef.current}
        accessToken={accessToken}
        roomData={roomData}
        onLeave={handleLeaveRoom}
        backendUrl={BACKEND_URL}
      />
    )
  }
}
