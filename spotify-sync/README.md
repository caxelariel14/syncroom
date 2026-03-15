# 🎵 SyncRoom – Guía de instalación y despliegue

Escucha Spotify con hasta 100 personas al mismo tiempo.

---

## 📋 Requisitos previos

- Cuenta de **GitHub** (gratis) → https://github.com
- Cuenta de **Spotify Developer** (gratis) → https://developer.spotify.com
- Cuenta de **Railway** (gratis) → https://railway.app  ← para el backend
- Cuenta de **Vercel** (gratis) → https://vercel.com  ← para el frontend

---

## PASO 1 — Crear la app en Spotify Developer

1. Ve a https://developer.spotify.com/dashboard
2. Inicia sesión con tu cuenta de Spotify
3. Haz clic en **"Create App"**
4. Rellena los campos:
   - **App name**: SyncRoom (o el nombre que quieras)
   - **App description**: Salas de escucha sincronizada
   - **Redirect URI**: por ahora pon `http://localhost:3001/callback` (lo cambiaremos después)
   - Marca el checkbox de los términos y condiciones
5. Haz clic en **"Save"**
6. En la página de tu app, haz clic en **"Settings"**
7. Copia y guarda en un bloc de notas:
   - **Client ID** (lo necesitarás en el Paso 3)
   - **Client Secret** → haz clic en "View client secret" (¡no lo compartas con nadie!)

---

## PASO 2 — Subir el código a GitHub

1. Ve a https://github.com y crea un **nuevo repositorio** llamado `syncroom`
2. Descarga e instala **Git** si no lo tienes: https://git-scm.com/downloads
3. Abre una terminal/consola en la carpeta del proyecto y ejecuta:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/syncroom.git
git push -u origin main
```

---

## PASO 3 — Desplegar el Backend en Railway

1. Ve a https://railway.app y regístrate (con tu cuenta de GitHub)
2. Haz clic en **"New Project"** → **"Deploy from GitHub repo"**
3. Selecciona el repositorio `syncroom`
4. Railway detectará el proyecto. Cuando te pregunte qué desplegar, selecciona la carpeta **`backend`**
   - Si no lo detecta automáticamente: en la configuración del servicio, cambia el **Root Directory** a `/backend`
5. Haz clic en **"Deploy"**
6. Una vez desplegado, ve a la pestaña **"Variables"** y agrega estas variables de entorno:

   | Variable | Valor |
   |---|---|
   | `SPOTIFY_CLIENT_ID` | El Client ID que copiaste en el Paso 1 |
   | `SPOTIFY_CLIENT_SECRET` | El Client Secret que copiaste en el Paso 1 |
   | `REDIRECT_URI` | `https://TU-APP.railway.app/callback` (copia la URL de Railway) |
   | `FRONTEND_URL` | `https://TU-APP.vercel.app` (lo completarás después del Paso 4) |

7. Copia la **URL de Railway** (algo como `https://syncroom-production.up.railway.app`). La necesitarás.

---

## PASO 4 — Desplegar el Frontend en Vercel

1. Ve a https://vercel.com y regístrate (con tu cuenta de GitHub)
2. Haz clic en **"Add New Project"** → importa el repositorio `syncroom`
3. En la configuración del proyecto:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. En **Environment Variables**, agrega:

   | Variable | Valor |
   |---|---|
   | `VITE_BACKEND_URL` | La URL de Railway del Paso 3 (sin `/` al final) |

5. Haz clic en **"Deploy"**
6. Copia la **URL de Vercel** (algo como `https://syncroom.vercel.app`)

---

## PASO 5 — Conectar todo

### Actualizar la URL del frontend en Railway
1. Ve a Railway → tu proyecto → Variables
2. Actualiza `FRONTEND_URL` con la URL de Vercel que obtuviste en el Paso 4
3. Railway redesplegará automáticamente

### Actualizar la Redirect URI en Spotify
1. Ve a https://developer.spotify.com/dashboard → tu app → Settings
2. En **"Redirect URIs"**, agrega:
   ```
   https://TU-APP.railway.app/callback
   ```
3. Haz clic en **"Add"** y luego **"Save"**

---

## PASO 6 — ¡Probar la app!

1. Abre tu URL de Vercel en el navegador
2. Haz clic en **"Continuar con Spotify"**
3. Autoriza los permisos
4. ¡Ya estás dentro! Crea una sala y comparte el código con tus amigos

---

## 🧑‍💻 Para desarrollar en local (opcional)

### Backend
```bash
cd backend
npm install
# Crea el archivo .env copiando .env.example y rellenando los datos
cp .env.example .env
npm run dev
```

### Frontend
```bash
cd frontend
npm install
# Crea el archivo .env.local
echo "VITE_BACKEND_URL=http://localhost:3001" > .env.local
npm run dev
```

---

## ❓ Preguntas frecuentes

**¿Los usuarios necesitan Spotify Premium?**
Sí, la reproducción automática solo funciona con cuentas Premium.

**¿Cuántas personas pueden unirse?**
Máximo 100 por sala.

**¿Los streams se cuentan de verdad?**
Sí. Cada canción que se reproduce más de 30 segundos cuenta como un stream real en la cuenta de Spotify de cada usuario.

**¿Puedo tener múltiples salas activas al mismo tiempo?**
Sí, el servidor soporta múltiples salas simultáneas.

**¿Qué pasa si el host se desconecta?**
El siguiente miembro de la sala se convierte automáticamente en el nuevo host.

**¿Tengo que pagar algo?**
No. Railway y Vercel tienen planes gratuitos suficientes para uso personal. Solo pagarías si tienes mucho tráfico.

---

## 📁 Estructura del proyecto

```
syncroom/
├── backend/
│   ├── server.js          ← Servidor Node.js con Socket.io
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx        ← Lógica principal y rutas
│   │   ├── index.css      ← Estilos globales
│   │   └── components/
│   │       ├── Login.jsx  ← Pantalla de login con Spotify
│   │       ├── Home.jsx   ← Crear/unirse a sala
│   │       └── Room.jsx   ← Sala de escucha + reproductor
│   ├── index.html
│   ├── vite.config.js
│   └── .env.example
└── README.md
```
