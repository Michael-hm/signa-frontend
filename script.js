const BACKEND_URL = "https://signa-backend-production.up.railway.app/predict_sequence";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const predictionEl = document.getElementById("prediction");
const confidenceEl = document.getElementById("confidence");

const btnWebcam = document.getElementById("btnWebcam");
const btnVideo = document.getElementById("btnVideo");
const videoUpload = document.getElementById("videoUpload");

const WINDOW_SIZE = 40;
const FEATURES = 63;

let buffer = [];
let camera = null;
let mode = null;

// ---------- HOLISTIC ----------
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

// ---------- WEBCAM ----------
btnWebcam.onclick = async () => {
  reset();
  mode = "webcam";

  camera = new Camera(video, {
    onFrame: async () => {
      await holistic.send({ image: video });
    },
    width: 640,
    height: 480,
  });

  camera.start();
};

// ---------- VIDEO ----------
btnVideo.onclick = () => {
  reset();
  mode = "video";
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
  processVideo();
};

function processVideo() {
  const interval = setInterval(async () => {
    if (video.paused || video.ended || mode !== "video") {
      clearInterval(interval);
      return;
    }
    await holistic.send({ image: video });
  }, 1000 / 25);
}

// ---------- RESULTADOS ----------
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) return;

  const frame = [];

  results.poseLandmarks.slice(0, 21).forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();

    frame.push(p.x, p.y, p.z);
  });

  if (frame.length !== FEATURES) return;

  buffer.push(frame);
  console.log("buffer length:", buffer.length); // 🔥 DEBUG CLAVE

  if (buffer.length === WINDOW_SIZE) {
    sendToBackend(buffer);
    buffer = [];
  }
}

// ---------- BACKEND ----------
async function sendToBackend(sequence) {
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequence }),
  });

  if (!res.ok) return;

  const data = await res.json();
  predictionEl.textContent = data.label;
  confidenceEl.textContent =
    `Confianza: ${(data.confidence * 100).toFixed(1)}%`;
}

// ---------- RESET ----------
function reset() {
  buffer = [];
  predictionEl.textContent = "—";
  confidenceEl.textContent = "—";

  if (camera) {
    camera.stop();
    camera = null;
  }

  video.pause();
  video.src = "";
}