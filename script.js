const BACKEND_URL = "https://signa-backend-production.up.railway.app/predict_sequence";
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const predictionEl = document.getElementById("prediction");
const confidenceEl = document.getElementById("confidence");

const WINDOW_SIZE = 40;
const FEATURES = 63;

let buffer = [];

// -------- MediaPipe --------
const holistic = new Holistic({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
});

holistic.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  refineFaceLandmarks: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

holistic.onResults(onResults);

// -------- Cámara --------
const camera = new Camera(video, {
  onFrame: async () => {
    await holistic.send({ image: video });
  },
  width: 640,
  height: 480,
});

camera.start();

// -------- Procesar resultados --------
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) return;

  // Dibujar puntos
  results.poseLandmarks.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
  });

  // Extraer 63 features (ejemplo simple)
  const frame = results.poseLandmarks
    .slice(0, 21)
    .flatMap(p => [p.x, p.y, p.z]);

  if (frame.length !== FEATURES) return;

  buffer.push(frame);

  if (buffer.length === WINDOW_SIZE) {
    sendToBackend(buffer);
    buffer = [];
  }
}

// -------- Enviar al backend --------
async function sendToBackend(sequence) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sequence }),
    });

    if (!res.ok) return;

    const data = await res.json();

    predictionEl.textContent = data.label;
    confidenceEl.textContent = `Confianza: ${(data.confidence * 100).toFixed(1)}%`;
  } catch (err) {
    console.error("Error enviando datos:", err);
  }
}