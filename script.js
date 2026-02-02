// ==============================
// CONFIG
// ==============================
const BACKEND_URL = "https://signa-backend-production.up.railway.app/predict_sequence";
const WINDOW_SIZE = 40;
const FEATURES = 63;

// ==============================
// ELEMENTOS DOM
// ==============================
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const predictionEl = document.getElementById("prediction");
const confidenceEl = document.getElementById("confidence");
const btnWebcam = document.getElementById("btnWebcam");
const btnVideo = document.getElementById("btnVideo");
const videoUpload = document.getElementById("videoUpload");

// ==============================
// ESTADO
// ==============================
let buffer = [];
let camera = null;
let currentMode = null;

// ==============================
// MEDIAPIPE HANDS
// ==============================
const hands = new Hands({
  locateFile: file =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

hands.onResults(onResults);

// ==============================
// RESULTADOS MEDIAPIPE
// ==============================
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;

  const landmarks = results.multiHandLandmarks[0];

  // Dibujar landmarks
  landmarks.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
  });

  // Extraer 63 features
  const frame = landmarks
    .slice(0, 21)
    .flatMap(p => [p.x, p.y, p.z]);

  if (frame.length !== FEATURES) return;

  buffer.push(frame);

  if (buffer.length === WINDOW_SIZE) {
    sendToBackend(buffer);
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

    predictionEl.textContent = data.label ?? "—";
    confidenceEl.textContent = `Confianza: ${(data.confidence * 100).toFixed(1)}%`;
  } catch (err) {
    console.error("Error enviando datos:", err);
  }
}

// ==============================
// WEBCAM
// ==============================
btnWebcam.onclick = async () => {
  reset();

  currentMode = "btnWebcam";

  camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480
  });

  await camera.start();

  // Ajustar canvas al tamaño de la cámara
  canvas.width = 640;
  canvas.height = 480;
};

// ==============================
// VIDEO SUBIDO
// ==============================
btnVideo.onclick = () => {
  reset();
  currentMode = "btnVideo";
  videoUpload.click();
};

videoUpload.onchange = async() => {
  const file = videoUpload.files[0];
  if (!file) return;

  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  
  await video.play();

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  processVideo();
};

function processVideo() {
  const interval = setInterval(async () => {
    if (video.paused || video.ended || currentMode !== "btnVideo") {
      clearInterval(interval);
      return;
    }

    await hands.send({ image: video });

  }, 1000 / 25);
}

// ==============================
// RESET
// ==============================
function reset() {
  buffer = [];
  predictionEl.textContent = "—";
  confidenceEl.textContent = "—";

  if (camera) {
    camera.stop();
    camera = null;
  }

  video.pause();
  video.srcObject = null;
  video.src = "";
}