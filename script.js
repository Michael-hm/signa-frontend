// ==============================
// CONFIG
// ==============================
const BACKEND_URL = "https://signa-backend-production.up.railway.app/predict_sequence";
const WINDOW_SIZE = 40;
const FEATURES = 63;

// ==============================
// DOM
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
// STATE
// ==============================
let buffer = [];
let camera = null;
let currentMode = null;

// ==============================
// MEDIAPIPE HANDS
// ==============================
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
});

hands.onResults(onResults);

// ==============================
// RESULTS
// ==============================
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks) return;

  const landmarks = results.multiHandLandmarks[0];
  const frame = [];

  landmarks.forEach(p => {
    frame.push(p.x, p.y, p.z);
  });

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
    console.error(err);
  }
}

// ==============================
// WEBCAM
// ==============================
btnWebcam.onclick = async () => {
  reset();
  currentMode = "webcam";

  canvas.width = 640;
  canvas.height = 480;

  camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480,
  });

  await camera.start();
};

// ==============================
// VIDEO UPLOAD
// ==============================
btnVideo.onclick = () => {
  reset();
  currentMode = "video";
  videoUpload.click();
};

videoUpload.onchange = async () => {
  const file = videoUpload.files[0];
  if (!file) return;

  video.src = URL.createObjectURL(file);
  await video.play();

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  processVideo();
};

function processVideo() {
  const interval = setInterval(async () => {
    if (video.paused || video.ended || currentMode !== "video") {
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