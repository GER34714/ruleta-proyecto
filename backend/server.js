const express = require("express");
const cors = require("cors");
const path = require("path");
const Redis = require("ioredis");

const app = express();
app.use(cors());
app.use(express.json());

// ------------ CONFIG ------------
const PORT = process.env.PORT || 3000;
// ⚡ Podes dejarlo así o usar process.env.KV_URL en Environment de Render
const redis = new Redis(process.env.KV_URL || "redis://red-d378b33uibrs738qtkjg:6379");

// Cajeros y premios
const premios = [
  "10% extra (en su primera carga)",   // <-- texto visible al usuario
  "15% extra (en su primera carga)",
  "20% extra (en su primera carga)",
  "30% extra (en su segunda carga)",
  "100 fichas (sin carga, no retirables)",
  "500 fichas (sin carga, no retirables)",
  "300 fichas (sin carga, no retirables)"
];

const cajeros = [
  { nombre: "Joaki", numero: "1123365501" },
  { nombre: "Facu",  numero: "1125127839" }
];

// ------------ FRONTEND ------------
app.use(express.static(path.join(__dirname, "..", "public")));

// ------------ HELPERS ------------
async function getState() {
  // Recupera o crea el estado global
  const raw = await redis.get("ruleta_state");
  if (raw) return JSON.parse(raw);
  const init = { currentCajeroIndex: 0 };
  await redis.set("ruleta_state", JSON.stringify(init));
  return init;
}

async function saveState(state) {
  await redis.set("ruleta_state", JSON.stringify(state));
}

async function getUser(usuarioId) {
  const raw = await redis.get(`user:${usuarioId}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveUser(usuarioId, data) {
  await redis.set(`user:${usuarioId}`, JSON.stringify(data));
}

// ------------ RUTAS ------------
app.post("/girar", async (req, res) => {
  try {
    const { usuarioId } = req.body;
    if (!usuarioId) return res.status(400).json({ error: "Falta usuarioId" });

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Datos de usuario y estado global
    const user = await getUser(usuarioId);
    const state = await getState();

    // Si ya giró en las últimas 24 hs
    if (user && now - user.lastSpinTime < DAY_MS) {
      const remaining = DAY_MS - (now - user.lastSpinTime);
      const horas = Math.floor(remaining / (1000 * 60 * 60));
      const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      return res.json({
        yaGiro: true,
        premio: user.premio,       // mostramos el mismo premio
        cajero: user.cajero,       // mismo cajero
        mensaje: `⏳ Podrás volver a girar en ${horas}h ${mins}m`
      });
    }

    // Nuevo giro -> asignar cajero y premio
    const cajero = cajeros[state.currentCajeroIndex % cajeros.length];
    state.currentCajeroIndex++;

    const premio = premios[Math.floor(Math.random() * premios.length)];

    await saveUser(usuarioId, {
      cajero,
      premio,
      lastSpinTime: now
    });
    await saveState(state);

    res.json({ yaGiro: false, cajero, premio });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno" });
  }
});

// health check (para cron-jobs.org u otro ping)
app.get("/health", (_req, res) => res.json({ ok: true }));

// ------------ START ------------
app.listen(PORT, () => {
  console.log(`✅ Backend escuchando en puerto ${PORT}`);
});
