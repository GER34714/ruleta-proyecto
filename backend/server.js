// server.js (con Render Key-Value)
const express = require('express');
const cors = require('cors');
const path = require('path');
const Redis = require('ioredis');

const app = express();
app.use(cors());
app.use(express.json());

// sirve el front (carpeta public al lado del backend)
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;

// Conexión a Render Key-Value (Redis-compatible)
const redis = new Redis(process.env.KV_URL);

// ---- Config por defecto (podés editar cajeros acá) ----
const DEFAULT_CAJEROS = [
  { nombre: "Joaki", numero: "1123365501" },
  { nombre: "Facu",  numero: "1125127839" }
];

// premios pensados para WhatsApp ("mi primera carga")
const PREMIOS = [
  "10% extra (en mi primera carga)",
  "15% extra (en mi primera carga)",
  "20% extra (en mi primera carga)",
  "30% extra (en mi segunda carga)",
  "100 fichas (sin carga, no retirables)",
  "500 fichas (sin carga, no retirables)",
  "300 fichas (sin carga, no retirables)"
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Helpers KV
async function getJSON(key, fallback) {
  const raw = await redis.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
async function setJSON(key, obj) {
  await redis.set(key, JSON.stringify(obj));
}

// Carga cajeros (de KV si existen; si no, por defecto)
async function loadCajeros() {
  const saved = await getJSON('cajeros', null);
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_CAJEROS;
}
// Lee/guarda índice global de rotación (persistente)
async function getIndex() {
  const n = await redis.get('currentCajeroIndex');
  return n ? parseInt(n, 10) : 0;
}
async function setIndex(n) {
  await redis.set('currentCajeroIndex', String(n));
}

// Lee/guarda usuario (persistente)
async function getUser(uid) {
  return await getJSON(`user:${uid}`, null);
}
async function setUser(uid, data) {
  await setJSON(`user:${uid}`, data);
}

// ---------- API PRINCIPAL ----------
app.post('/girar', async (req, res) => {
  try {
    const { usuarioId } = req.body || {};
    if (!usuarioId) return res.status(400).json({ error: "Falta usuarioId" });

    const now = Date.now();
    const cajeros = await loadCajeros();
    if (!cajeros.length) {
      return res.status(500).json({ error: "No hay cajeros configurados" });
    }

    // Cargamos el usuario desde KV
    let u = await getUser(usuarioId);

    // Cooldown: si ya giró dentro de 24h
    if (u && now - u.lastSpinTime < DAY_MS) {
      const remaining = DAY_MS - (now - u.lastSpinTime);
      const horas = Math.floor(remaining / (1000*60*60));
      const mins  = Math.floor((remaining % (1000*60*60)) / (1000*60));
      return res.json({
        yaGiro: true,
        mensaje: `⏳ Podrás volver a girar en ${horas}h ${mins}m`,
        premio: u.lastPrize || null // para que el front lo muestre
      });
    }

    // Elegir cajero: si ya tenía, mantener; si no, asignar round-robin persistente
    let cajero;
    if (u && typeof u.cajeroIndex === 'number') {
      cajero = cajeros[u.cajeroIndex % cajeros.length];
    } else {
      const idx = await getIndex();
      cajero = cajeros[idx % cajeros.length];
      if (!u) u = {};
      u.cajeroIndex = idx % cajeros.length;
      await setIndex(idx + 1);
    }

    // premio aleatorio
    const premio = PREMIOS[Math.floor(Math.random() * PREMIOS.length)];

    // guardar estado del usuario
    u.lastSpinTime = now;
    u.lastPrize = premio;
    await setUser(usuarioId, u);

    return res.json({
      yaGiro: false,
      cajero,
      premio
    });
  } catch (e) {
    console.error('Error en /girar', e);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ---------- utilidades ----------
app.post('/api/cajeros/init', async (req, res) => {
  const { cajeros } = req.body || {};
  if (!Array.isArray(cajeros) || !cajeros.length) {
    return res.status(400).json({ error: "Mandá 'cajeros' como array con al menos 1 elemento." });
  }
  await setJSON('cajeros', cajeros);
  // NO tocamos usuarios ni el índice (así no rompemos asignaciones actuales)
  res.json({ ok: true, count: cajeros.length });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Backend corriendo en http://localhost:${PORT}`));
    return res.json({ yaGiro: true, mensaje: `⏳ Podrás volver a girar en ${horas}h ${mins}m` });
  }

  const cajero = cajeros[currentCajeroIndex % cajeros.length];
  currentCajeroIndex++;

  usuarios[usuarioId] = {
    cajeroIndex: (currentCajeroIndex - 1 + cajeros.length) % cajeros.length,
    lastSpinTime: now
  };

  const premios = [
    "10% extra (en mi primera carga)",
    "15% extra (en mi primera carga)",
    "20% extra (en mi primera carga)",
    "30% extra (en mi segunda carga)",
    "100 fichas (sin carga, no retirables)",
    "500 fichas (sin carga, no retirables)",
    "300 fichas (sin carga, no retirables)"
  ];
  const premio = premios[Math.floor(Math.random() * premios.length)];

  res.json({ yaGiro: false, cajero, premio });
});

// cargar cajeros por API (opcional)
app.post('/api/cajeros/init', (req, res) => {
  const { cajeros: nuevos } = req.body || {};
  if (!Array.isArray(nuevos) || !nuevos.length) {
    return res.status(400).json({ error: "Mandá 'cajeros' como array con al menos 1 elemento." });
  }
  cajeros = nuevos; currentCajeroIndex = 0; usuarios = {};
  res.json({ ok: true, count: cajeros.length });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Backend corriendo en http://localhost:${PORT}`));
