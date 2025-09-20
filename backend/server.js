// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');

let Redis;              // ioredis es opcional
try { Redis = require('ioredis'); } catch { /* si no está, seguimos en memoria */ }

const app = express();
app.use(cors());
app.use(express.json());

// sirve el front (carpeta public al lado de backend)
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;

// ====== Key-Value (Render) opcional ======
const KV_URL = process.env.KV_URL || process.env.REDIS_URL || '';
const useRedis = Boolean(KV_URL && Redis);

let redis = null;
if (useRedis) {
  redis = new Redis(KV_URL);
  redis.on('error', (e) => console.error('Redis error:', e?.message || e));
  console.log('[KV] Usando Render Key-Value');
} else {
  console.warn('[KV] No se detectó KV_URL/REDIS_URL o ioredis. Usando memoria.');
}

// ====== almacenamiento ======
const memStore = {}; // fallback en memoria

async function getJSON(key, fallback) {
  if (redis) {
    const raw = await redis.get(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  } else {
    return key in memStore ? memStore[key] : fallback;
  }
}

async function setJSON(key, obj) {
  if (redis) {
    await redis.set(key, JSON.stringify(obj));
  } else {
    memStore[key] = obj;
  }
}

async function getStr(key, fallback = null) {
  if (redis) {
    const val = await redis.get(key);
    return val ?? fallback;
  } else {
    return key in memStore ? String(memStore[key]) : fallback;
  }
}

async function setStr(key, val) {
  if (redis) {
    await redis.set(key, String(val));
  } else {
    memStore[key] = String(val);
  }
}

// ====== datos de negocio ======
const DEFAULT_CAJEROS = [
  { nombre: "Joaki", numero: "1123365501" },
  { nombre: "Facu",  numero: "1125127839" }
];

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

async function loadCajeros() {
  const saved = await getJSON('cajeros', null);
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_CAJEROS;
}
async function getIndex() {
  const n = await getStr('currentCajeroIndex', '0');
  const parsed = parseInt(n, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
async function setIndex(n) {
  await setStr('currentCajeroIndex', String(n));
}

async function getUser(uid) {
  return await getJSON(`user:${uid}`, null);
}
async function setUser(uid, data) {
  await setJSON(`user:${uid}`, data);
}

// ====== API ======
app.post('/girar', async (req, res) => {
  try {
    const { usuarioId } = req.body || {};
    if (!usuarioId) return res.status(400).json({ error: "Falta usuarioId" });

    const now = Date.now();
    const cajeros = await loadCajeros();
    if (!cajeros.length) {
      return res.status(500).json({ error: "No hay cajeros configurados" });
    }

    let u = await getUser(usuarioId);

    // dentro de 24h => cooldown (no reasignamos cajero)
    if (u && now - u.lastSpinTime < DAY_MS) {
      const remaining = DAY_MS - (now - u.lastSpinTime);
      const horas = Math.floor(remaining / (1000*60*60));
      const mins  = Math.floor((remaining % (1000*60*60)) / (1000*60));
      return res.json({
        yaGiro: true,
        mensaje: `⏳ Podrás volver a girar en ${horas}h ${mins}m`,
        premio: u.lastPrize || null
      });
    }

    // asignar/mantener cajero fijo
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

    // guardar usuario
    u.lastSpinTime = now;
    u.lastPrize = premio;
    await setUser(usuarioId, u);

    return res.json({
      yaGiro: false,
      cajero,
      premio
    });
  } catch (err) {
    console.error('Error en /girar:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// setear cajeros por API (opcional)
app.post('/api/cajeros/init', async (req, res) => {
  try {
    const { cajeros } = req.body || {};
    if (!Array.isArray(cajeros) || !cajeros.length) {
      return res.status(400).json({ error: "Mandá 'cajeros' como array con al menos 1 elemento." });
    }
    await setJSON('cajeros', cajeros);
    // no reseteamos usuarios ni índice
    return res.json({ ok: true, count: cajeros.length });
  } catch (e) {
    console.error('Error en /api/cajeros/init:', e);
    return res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
