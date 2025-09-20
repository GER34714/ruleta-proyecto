const express = require('express');
const cors = require('cors');
const path = require('path');
const Redis = require('ioredis');

const app = express();
app.use(cors());
app.use(express.json());

// ======== CONFIG ========
const PORT = process.env.PORT || 3000;
// Usa tu URL interna de Redis en Render
const redis = new Redis(process.env.REDIS_URL || 'redis://red-d378b33uibrs738qtkjg:6379');

// sirve el front (carpeta public que estará al lado de backend)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ======== DATOS EN MEMORIA ========
// premios grandes que salen solo 1 vez al día
const premiosGrandes = [
  "30% extra (en mi segunda carga)",
  "500 fichas (sin carga, no retirables)"
];

// premios normales que se intercalan
const premiosNormales = [
  "10% extra (en mi primera carga)",
  "15% extra (en mi primera carga)",
  "20% extra (en mi primera carga)",
  "100 fichas (sin carga, no retirables)",
  "300 fichas (sin carga, no retirables)"
];

// cajeros globales
const cajeros = [
  { nombre: "Joaki", numero: "1123365501" },
  { nombre: "Facu",  numero: "1125127839" }
];

let currentCajeroIndex = 0; // round-robin para primer asignación
let premioGrandeDelDia = null;
let fechaPremioGrande = null;

// ======== FUNCIONES ========
function esNuevoDia() {
  const hoy = new Date().toDateString();
  return fechaPremioGrande !== hoy;
}

function obtenerPremio() {
  const hoy = new Date().toDateString();
  if (esNuevoDia()) {
    // elegir un premio grande nuevo
    premioGrandeDelDia = premiosGrandes[Math.floor(Math.random() * premiosGrandes.length)];
    fechaPremioGrande = hoy;
    return premioGrandeDelDia;
  } else {
    // premios normales intercalados
    return premiosNormales[Math.floor(Math.random() * premiosNormales.length)];
  }
}

// ======== ENDPOINT GIRO ========
app.post('/girar', async (req, res) => {
  const { usuarioId } = req.body;
  if (!usuarioId) return res.status(400).json({ error: "Falta usuarioId" });

  const key = `user:${usuarioId}`;
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let userData = await redis.hgetall(key);
  // Si Redis devolvió algo que no sea hash, hgetall rompe => por eso limpiamos después

  if (userData && Object.keys(userData).length > 0) {
    const lastSpinTime = parseInt(userData.lastSpinTime || "0", 10);
    const cajeroIndex = parseInt(userData.cajeroIndex || "0", 10);
    const lastPrize = userData.lastPrize || "";

    if (now - lastSpinTime < DAY_MS) {
      // dentro del día => mismo premio
      const remaining = DAY_MS - (now - lastSpinTime);
      const horas = Math.floor(remaining / (1000*60*60));
      const mins  = Math.floor((remaining % (1000*60*60)) / (1000*60));
      return res.json({
        yaGiro: true,
        mensaje: `⏳ Podrás volver a girar en ${horas}h ${mins}m`,
        premio: lastPrize,
        cajero: cajeros[cajeroIndex]
      });
    }

    // Nuevo día -> nuevo premio
    const nuevoPremio = obtenerPremio();
    await redis.hset(key, {
      lastSpinTime: now,
      lastPrize: nuevoPremio
    });
    return res.json({
      yaGiro: false,
      premio: nuevoPremio,
      cajero: cajeros[cajeroIndex]
    });
  }

  // Usuario nuevo => asignar cajero y premio
  const cajero = cajeros[currentCajeroIndex % cajeros.length];
  currentCajeroIndex++;
  const premio = obtenerPremio();

  await redis.hset(key, {
    cajeroIndex: currentCajeroIndex - 1,
    lastSpinTime: now,
    lastPrize: premio
  });

  res.json({
    yaGiro: false,
    premio,
    cajero
  });
});

// ======== RUTA DE SALUD ========
app.get('/health', (_req, res) => res.json({ ok: true }));

// ======== 🔧 RUTA TEMPORAL PARA LIMPIAR REDIS ========
app.get('/fix-redis', async (req, res) => {
  try {
    const keys = await redis.keys('user:*');   // busca las claves de usuario
    if (keys.length) {
      await redis.del(...keys);                // borra todas
    }
    res.send(`✅ Redis limpio. Borradas ${keys.length} claves.`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error limpiando Redis');
  }
});

// ======== INICIO SERVIDOR ========
app.listen(PORT, () =>
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`)
);
