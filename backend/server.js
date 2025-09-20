const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// sirve el front (carpeta public que estará al lado de backend)
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;

// ====== datos en memoria ======
let cajeros = [
  { nombre: "Joaki", numero: "1123365501" },
  { nombre: "Facu",  numero: "1125127839" }
];

let usuarios = {};            // { usuarioId: { cajeroIndex, lastSpinTime } }
let currentCajeroIndex = 0;   // round-robin global

// gira (cooldown por usuario + premio + cajero rotado)
app.post('/girar', (req, res) => {
  const { usuarioId } = req.body;
  if (!usuarioId) return res.status(400).json({ error: "Falta usuarioId" });

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let usuario = usuarios[usuarioId];

  if (usuario && now - usuario.lastSpinTime < DAY_MS) {
    const remaining = DAY_MS - (now - usuario.lastSpinTime);
    const horas = Math.floor(remaining / (1000*60*60));
    const mins  = Math.floor((remaining % (1000*60*60)) / (1000*60));
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
