const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3001/callback';
const PORT = process.env.PORT || 3001;

const rooms = {};
const streamCounts = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Step 1: Redirect user to Spotify login
app.get('/login', (req, res) => {
const scope = 'user-read-email user-read-private playlist-read-private playlist-read-collaborative';

  const params = querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state: req.query.state || '',
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// Step 2: Spotify calls back here with auth code
app.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}?error=${error}`);
  }

  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const params = querystring.stringify({
      access_token,
      refresh_token,
      expires_in,
      state,
    });
    res.redirect(`${FRONTEND_URL}?${params}`);
  } catch (err) {
    console.error('Token exchange failed:', err.response?.data || err.message);
    res.redirect(`${FRONTEND_URL}?error=token_exchange_failed`);
  }
});

// Refresh access token
app.get('/refresh_token', async (req, res) => {
  const { refresh_token } = req.query;
  if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
      }
    );
    res.json({
      access_token: tokenRes.data.access_token,
      expires_in: tokenRes.data.expires_in,
    });
  } catch (err) {
    console.error('Token refresh failed:', err.response?.data || err.message);
    res.status(400).json({ error: 'Failed to refresh token' });
  }
});

app.get('/streams', (req, res) => {
  const sorted = Object.values(streamCounts).sort((a, b) => b.streams - a.streams);
  res.json(sorted);
});

app.get('/health', (req, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  socket.on('create_room', ({ username }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      host: socket.id,
      members: [{ id: socket.id, username }],
      playlist: null,
      currentTrackIndex: 0,
      currentTrack: null,
      isPlaying: false,
      position: 0,
      startedAt: null,
      streamTimers: {},
    };
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.username = username;
    socket.emit('room_created', { roomCode });
    console.log(`Room ${roomCode} created by ${username}`);
  });

  socket.on('join_room', ({ roomCode, username }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('join_error', { message: 'Sala no encontrada. Verifica el código.' });
      return;
    }
    if (room.members.length >= 100) {
      socket.emit('join_error', { message: 'La sala está llena (máximo 100 personas).' });
      return;
    }

    room.members.push({ id: socket.id, username });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.username = username;

    const elapsed = room.startedAt ? Date.now() - room.startedAt : 0;
    socket.emit('room_joined', {
      roomCode,
      isHost: false,
      hostUsername: room.members.find((m) => m.id === room.host)?.username,
      members: room.members.map((m) => m.username),
      playlist: room.playlist,
      currentTrack: room.currentTrack,
      isPlaying: room.isPlaying,
      position: room.isPlaying ? room.position + elapsed : room.position,
    });

    io.to(roomCode).emit('members_updated', {
      members: room.members.map((m) => m.username),
      count: room.members.length,
      event: `${username} se unió`,
    });

    console.log(`${username} joined room ${roomCode} (${room.members.length}/100)`);
  });

  socket.on('set_playlist', ({ playlist }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) return;

    room.playlist = playlist;
    room.currentTrackIndex = 0;
    room.currentTrack = playlist.tracks[0] || null;
    room.isPlaying = false;
    room.position = 0;

    io.to(roomCode).emit('playlist_loaded', { playlist, currentTrack: room.currentTrack });
    console.log(`Playlist "${playlist.name}" set in room ${roomCode}`);
  });

  socket.on('play_track', ({ track, position = 0 }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) return;

    if (room.streamTimers[track.id]) {
      clearTimeout(room.streamTimers[track.id]);
    }

    room.currentTrack = track;
    room.isPlaying = true;
    room.position = position;
    room.startedAt = Date.now();

    io.to(roomCode).emit('play_track', { track, position, timestamp: Date.now() });

    room.streamTimers[track.id] = setTimeout(() => {
      if (rooms[roomCode]?.currentTrack?.id === track.id && rooms[roomCode]?.isPlaying) {
        const memberCount = rooms[roomCode]?.members?.length || 0;
        if (!streamCounts[track.id]) {
          streamCounts[track.id] = { track, streams: 0 };
        }
        streamCounts[track.id].streams += memberCount;

        io.to(roomCode).emit('streams_updated', {
          track,
          newStreams: memberCount,
          totalStreams: streamCounts[track.id].streams,
        });
        console.log(`+${memberCount} streams for "${track.name}" (total: ${streamCounts[track.id].streams})`);
      }
    }, 30_000);
  });

  socket.on('pause', () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) return;

    if (room.isPlaying && room.startedAt) {
      room.position += Date.now() - room.startedAt;
    }
    room.isPlaying = false;
    room.startedAt = null;

    io.to(roomCode).emit('pause');
  });

  socket.on('resume', () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) return;

    room.isPlaying = true;
    room.startedAt = Date.now();

    io.to(roomCode).emit('resume', { position: room.position, timestamp: Date.now() });
  });

  socket.on('next_track', () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id || !room.playlist) return;

    const tracks = room.playlist.tracks;
    room.currentTrackIndex = (room.currentTrackIndex + 1) % tracks.length;
    const track = tracks[room.currentTrackIndex];

    socket.emit('play_track', { track, position: 0, timestamp: Date.now() });
    socket.to(roomCode).emit('play_track', { track, position: 0, timestamp: Date.now() });

    room.currentTrack = track;
    room.position = 0;
    room.startedAt = Date.now();
    room.isPlaying = true;
  });

  socket.on('prev_track', () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id || !room.playlist) return;

    const tracks = room.playlist.tracks;
    room.currentTrackIndex = (room.currentTrackIndex - 1 + tracks.length) % tracks.length;
    const track = tracks[room.currentTrackIndex];

    io.to(roomCode).emit('play_track', { track, position: 0, timestamp: Date.now() });

    room.currentTrack = track;
    room.position = 0;
    room.startedAt = Date.now();
    room.isPlaying = true;
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const room = rooms[roomCode];
    const username = socket.data.username;
    room.members = room.members.filter((m) => m.id !== socket.id);

    if (room.members.length === 0) {
      Object.values(room.streamTimers).forEach(clearTimeout);
      delete rooms[roomCode];
      console.log(`Room ${roomCode} deleted (empty)`);
      return;
    }

    if (room.host === socket.id) {
      room.host = room.members[0].id;
      const newHostUsername = room.members[0].username;
      io.to(roomCode).emit('host_changed', { newHostUsername });
      console.log(`Host of ${roomCode} changed to ${newHostUsername}`);
    }

    io.to(roomCode).emit('members_updated', {
      members: room.members.map((m) => m.username),
      count: room.members.length,
      event: `${username} salió`,
    });

    console.log(`[-] ${username} left room ${roomCode}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Spotify Sync server running on port ${PORT}`);
  console.log(`   Frontend URL: ${FRONTEND_URL}`);
});
