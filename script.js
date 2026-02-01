// ==============================
// CONFIG
// ==============================
const BACKEND_URL = "https://signa-backend-production.up.railway.app/predict_sequence";
const WINDOW_SIZE = 40;

// ==============================
// ELEMENTOS DOM
// ==============================
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const predictionEl = document.getElementById("prediction");

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
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

hands.onResults(onResults);

// ==============================
// RESULTADOS MEDIAPIPE
// ==============================
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks) return;

  const landmarks = results.multiHandLandmarks[0];
  const keypoints = [];

  landmarks.forEach(p => {
    keypoints.push(p.x, p.y, p.z);
  });

  buffer.push(keypoints);

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
      body: JSON.stringify({ sequence })
    });

    const data = await res.json();
    predictionEl.textContent = data.label ?? "—";
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

  camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480
  });

  await camera.start();
};

// ==============================
// VIDEO SUBIDO
// ==============================
btnVideo.onclick = () => {
  reset();
  currentMode = "video";
  videoUpload.click();
};

videoUpload.onchange = () => {
  const file = videoUpload.files[0];
  if (!file) return;

  video.src = URL.createObjectURL(file);
  video.load();

  video.onloadeddata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    processVideo();
  };
};

function processVideo() {
  video.play();

  const interval = setInterval(async () => {
    if (video.paused || video.ended || currentMode !== "video") {
      clearInterval(interval);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    await hands.send({ image: canvas });

  }, 1000 / 25); // 25 FPS
}

// ==============================
// RESET
// ==============================
function reset() {
  buffer = [];
  predictionEl.textContent = "—";

  if (camera) {
    camera.stop();
    camera = null;
  }

  video.pause();
  video.srcObject = null;
  video.src = "";
}