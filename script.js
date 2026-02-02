const BACKEND_URL = "https://signa-backend-production.up.railway.app/predict_sequence";

const WINDOW_SIZE = 40;
const FEATURES = 63;

// FPS control
const TARGET_FPS = 20;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// Voting
const VOTE_WINDOW = 5;

// ==============================
// DOM
// ==============================
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const predictionEl = document.getElementById("prediction");
const confidenceEl = document.getElementById("confidence");

// ==============================
// STATE
// ==============================
let buffer = [];
let sending = false;

let predictionHistory = [];

let lastFrameTime = 0;
let animationId = null;

// ==============================
// MEDIAPIPE HOLISTIC
// ==============================
const holistic = new Holistic({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
});

holistic.setOptions({
  modelComplexity: 0, // 🔥 mucho más fluido
  smoothLandmarks: true,
  refineFaceLandmarks: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

holistic.onResults(onResults);

// ==============================
// CAMERA (WEBCAM)
// ==============================
const camera = new Camera(video, {
  onFrame: async () => {
    // La webcam ya va sincronizada
    await holistic.send({ image: video });
  },
  width: 640,
  height: 480,
});

// ==============================
// START CAMERA
// ==============================
camera.start();

// ==============================
// PROCESS RESULTS
// ==============================
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) return;

  // Dibujar puntos
  results.poseLandmarks.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
  });

  // Extraer 63 features
  const frame = results.poseLandmarks
    .slice(0, 21)
    .flatMap((p) => [p.x, p.y, p.z]);

  if (frame.length !== FEATURES) return;

  buffer.push(frame);

  if (buffer.length === WINDOW_SIZE && !sending) {
    sending = true;
    sendToBackend(buffer).finally(() => {
      sending = false;
    });
    buffer = [];
  }
}

// ==============================
// BACKEND
// ==============================
async function sendToBackend(sequence) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence }),
    });

    if (!res.ok) return;

    const data = await res.json();

    // Filtrar ruido extremo
    if (data.confidence < 0.03) return;

    handlePrediction(data.label);
  } catch (err) {
    console.error("Backend error:", err);
  }
}

// ==============================
// VOTING LOGIC (CLAVE)
// ==============================
function handlePrediction(label) {
  predictionHistory.push(label);

  if (predictionHistory.length > VOTE_WINDOW) {
    predictionHistory.shift();
  }

  const counts = {};
  predictionHistory.forEach((l) => {
    counts[l] = (counts[l] || 0) + 1;
  });

  let bestLabel = null;
  let bestCount = 0;

  for (const [l, c] of Object.entries(counts)) {
    if (c > bestCount) {
      bestLabel = l;
      bestCount = c;
    }
  }

  predictionEl.textContent = bestLabel;
  confidenceEl.textContent =
    `Estabilidad: ${Math.round((bestCount / VOTE_WINDOW) * 100)}%`;
}

// ==============================
// VIDEO UPLOAD
// ==============================
const videoUpload = document.getElementById("videoUpload");
const btnVideo = document.getElementById("btnVideo");

btnVideo.onclick = () => {
  reset();
  videoUpload.click();
};

videoUpload.onchange = async () => {
  const file = videoUpload.files[0];
  if (!file) return;

  video.src = URL.createObjectURL(file);
  video.loop = true;
  video.muted = true;
  video.playsInline = true;

  await video.play();

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  lastFrameTime = 0;
  animationId = requestAnimationFrame(processVideoFrame);
};

function processVideoFrame(timestamp) {
  if (timestamp - lastFrameTime < FRAME_INTERVAL) {
    animationId = requestAnimationFrame(processVideoFrame);
    return;
  }

  lastFrameTime = timestamp;

  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    holistic.send({ image: canvas });
  }

  animationId = requestAnimationFrame(processVideoFrame);
}

// ==============================
// RESET
// ==============================
function reset() {
  buffer = [];
  predictionHistory = [];
  sending = false;

  predictionEl.textContent = "—";
  confidenceEl.textContent = "";

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  video.pause();
  video.src = "";
}