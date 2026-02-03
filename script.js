// ==============================
// CONFIG
// ==============================
const BACKEND_URL = "https://signa-backend-production.up.railway.app/predict_sequence";

const WINDOW_SIZE = 40;
const FEATURES = 63;

const TARGET_FPS = 20;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

const VOTE_WINDOW = 5;

// ==============================
// DOM
// ==============================
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const predictionEl = document.getElementById("prediction");
const confidenceEl = document.getElementById("confidence");

const btnVideo = document.getElementById("btnVideo");
const videoUpload = document.getElementById("videoUpload");

// ==============================
// STATE
// ==============================
let buffer = [];
let sending = false;

let predictionHistory = [];
let currentMode = "webcam";

// ==============================
// MEDIAPIPE HOLISTIC
// ==============================
const holistic = new Holistic({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
});

holistic.setOptions({
  modelComplexity: 0,
  smoothLandmarks: true,
  refineFaceLandmarks: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

holistic.onResults(onResults);

// ==============================
// WEBCAM (SIEMPRE ACTIVA)
// ==============================
const camera = new Camera(video, {
  onFrame: async () => {
    if (currentMode === "webcam") {
      await holistic.send({ image: video });
    }
  },
  width: 640,
  height: 480,
});

camera.start();

// ==============================
// VIDEO UPLOAD
// ==============================
btnVideo.onclick = () => {
  currentMode = "video";
  videoUpload.click();
};

videoUpload.onchange = async () => {
  const file = videoUpload.files[0];
  if (!file) return;

  currentMode = "video";

  video.style.display = "none";   
  canvas.style.display = "block"; 

  const videoFile = document.createElement("video");
  videoFile.src = URL.createObjectURL(file);
  videoFile.muted = true;
  videoFile.playsInline = true;

  await videoFile.play();

  canvas.width = videoFile.videoWidth;
  canvas.height = videoFile.videoHeight;

  processUploadedVideo(videoFile);
};

function processUploadedVideo(videoFile) {
  let lastFrameTime = 0;

  function loop(timestamp) {
    if (
      videoFile.paused ||
      videoFile.ended ||
      currentMode !== "video"
    ) {
      currentMode = "webcam";
      return;
    }

    if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
      lastFrameTime = timestamp;

      ctx.drawImage(videoFile, 0, 0, canvas.width, canvas.height);
      holistic.send({ image: canvas });
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

// ==============================
// RESULTS
// ==============================
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) return;

  // Dibujar landmarks
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
    sendToBackend(buffer).finally(() => (sending = false));
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

    if (data.confidence < 0.03) return;

    handlePrediction(data.label);
  } catch (err) {
    console.error("Backend error:", err);
  }
}

// ==============================
// VOTING (ESTABILIDAD)
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
    `Confianza: ${Math.round((bestCount / VOTE_WINDOW) * 100)}%`;
}