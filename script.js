const BACKEND_URL = "https://signa-backend-production.up.railway.app/predict_sequence";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const predictionEl = document.getElementById("prediction");
const confidenceEl = document.getElementById("confidence");
const statusEl = document.getElementById("status");
const top3El = document.getElementById("top3");

const btnWebcam = document.getElementById("btnWebcam");
const btnVideo = document.getElementById("btnVideo");
const videoUpload = document.getElementById("videoUpload");

const WINDOW_SIZE = 40;
const FEATURES = 63;
const CONSENSUS_N = 3;

let buffer = [];
let lastStableLabel = "—";
let lastCandidateLabel = null;
let candidateCount = 0;

let currentMode = null;
let animationId = null;
let stream = null;

let sending = false;

let lastFrameTime = 0;
const TARGET_FPS = 20;
const FRAME_INTERVAL = 1000 / TARGET_FPS;


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
// LOOP ÚNICO DE PROCESADO
// ==============================
async function processFrame(timestamp) {
  if (timestamp - lastFrameTime < FRAME_INTERVAL) {
    animationId = requestAnimationFrame(processFrame);
    return;
  }

  lastFrameTime = timestamp;

  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    await holistic.send({ image: canvas });
  }

  animationId = requestAnimationFrame(processFrame);
}

// ==============================
// RESULTADOS
// ==============================
function onResults(results) {
  if (!results.poseLandmarks) return;

  results.poseLandmarks.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
  });

  const frame = results.poseLandmarks
    .slice(0, 21)
    .flatMap(p => [p.x, p.y, p.z]);

  if (frame.length !== FEATURES) return;

  buffer.push(frame);

  const falta = WINDOW_SIZE - buffer.length;
  if (falta > 0) {
    statusEl.textContent = `Analizando… (${buffer.length}/${WINDOW_SIZE})`;
  } else {
    statusEl.textContent = "Enviando al modelo…";
  }

  if (buffer.length === WINDOW_SIZE && !sending) {
    sending = true;
    sendToBackend(buffer).finally(() => {
      sending = false;
    });
    buffer.shift();
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

    const newLabel = data.label;

    if (newLabel === lastCandidateLabel) {
      candidateCount += 1;
    } else {
      lastCandidateLabel = newLabel;
      candidateCount = 1;
    }

    if (candidateCount >= CONSENSUS_N) {
      lastStableLabel = newLabel;
    }

    predictionEl.textContent = lastStableLabel;
    confidenceEl.textContent = `Confianza: ${(data.confidence * 100).toFixed(1)}%`;
    statusEl.textContent = "";
    if (data.top3 && Array.isArray(data.top3)) {
      top3El.innerHTML = data.top3
        .map(([label, conf]) => `${label}: ${(conf * 100).toFixed(1)}%`)
        .join("<br>");
    } else {
      top3El.textContent = "";
    }
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// RESET TOTAL
// ==============================
function reset() {
  lastStableLabel = "—";
  lastCandidateLabel = null;
  candidateCount = 0;
  buffer.shift();
  predictionEl.textContent = "—";
  confidenceEl.textContent = "";

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }

  video.pause();
  video.srcObject = null;
}

// ==============================
// WEBCAM
// ==============================
btnWebcam.onclick = async () => {

  if (currentMode !== "webcam") {
    animationId = requestAnimationFrame(processFrame);
    return;
  }
  reset();
  currentMode = "webcam";

  stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;

  await video.play();

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  processFrame();
};

// ==============================
// VÍDEO SUBIDO
// ==============================
btnVideo.onclick = () => {
  reset();
  currentMode = "video";
  videoUpload.click();
};

videoUpload.onchange = async () => {
  const file = videoUpload.files[0];
  if (!file) return;

  const videoFile = document.createElement("video");
  videoFile.src = URL.createObjectURL(file);
  videoFile.muted = true;
  videoFile.playsInline = true;
  videoFile.loop = true;

  await videoFile.play();

  canvas.width = videoFile.videoWidth;
  canvas.height = videoFile.videoHeight;

  processUploadedVideo(videoFile);
};

function processUploadedVideo(videoFile) {
  let lastTime = 0;

  function loop(timestamp) {
    if (currentMode !== "video" || videoFile.ended || videoFile.paused) {
      return;
    }

    if (timestamp - lastTime >= FRAME_INTERVAL) {
      lastTime = timestamp;

      ctx.drawImage(videoFile, 0, 0, canvas.width, canvas.height);
      holistic.send({ image: canvas });
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}