const express = require('express');
const cors = require('cors');
const path = require('path');
const Redis = require('ioredis');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
// 👉 Pega aquí tu URL interna de Render Key-Value (Internal Connection)
const redis = new Redis("redis://red-d378b33uibrs738qtkjg:6379");

// ====== Datos ======
const cajeros = [
  { nombre: "Joaki", numero: "1123365501" },
  { nombre: "Facu",  numero: "1125127839" }
];

const premios = [
  "10% extra (en tu primera carga)",
  "15% extra (en tu primera carga)",
  "20% extra (en tu primera carga)",
  "30% extra (en tu segunda carga)",
  "100 fichas (sin carga, no retirables)",
  "500 fichas (sin carga, no retirables)",
  "300 fichas (sin carga, no retirables)"
];

const DAY_MS = 24 * 60 * 60 * 1000;

// ====== API GIRO ======
app.post('/girar', async (req, res) => {
  const { usuarioId } = req.body;
  if (!usuarioId) return res.status(400).json({ error: "Falta usuarioId" });

  const userKey = `user:${usuarioId}`;
  const now = Date.now();
  const userData = await redis.hgetall(userKey);

  // --- Si ya giró en las últimas 24h ---
  if (userData.lastSpinTime && now - Number(userData.lastSpinTime) < DAY_MS) {
    const remaining = DAY_MS - (now - Number(userData.lastSpinTime));
    const horas = Math.floor(remaining / (1000*60*60));
    const mins  = Math.floor((remaining % (1000*60*60)) / (1000*60));
    return res.json({
      yaGiro: true,
      premio: userData.lastPrize, // mantiene su premio del día
      mensaje: `⏳ Podrás volver a girar en ${horas}h ${mins}m`,
      cajero: JSON.parse(userData.cajero)
    });
  }

  // --- Cajero fijo ---
  let cajero;
  if (userData.cajero) {
    cajero = JSON.parse(userData.cajero);
  } else {
    const index = await redis.incr('globalCajeroIndex');
    cajero = cajeros[(index - 1) % cajeros.length];
  }

  // --- Premio NUEVO cada vez que pasan 24h ---
  const premio = premios[Math.floor(Math.random() * premios.length)];

  // --- Guardar datos del usuario ---
  await redis.hset(userKey, {
    cajero: JSON.stringify(cajero),
    lastSpinTime: now,
    lastPrize: premio
  });
  await redis.pexpire(userKey, DAY_MS * 30); // conservar datos 30 días

  return res.json({
    yaGiro: false,
    premio,
    cajero
  });
});

// Endpoint de salud para cron-jobs
app.get('/health', (_req, res) => res.json({ ok: true }));

// Servir el frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => console.log(`✅ Backend corriendo en http://localhost:${PORT}`));
