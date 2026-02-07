// =====================================
// CONFIG
// =====================================
const BACKEND_URL =
  "https://signa-backend-production.up.railway.app/predict_sequence";

const WINDOW_SIZE = 40;
const FEATURES = 63;
const FPS = 20;
const FRAME_INTERVAL = 1000 / FPS;
const MIN_CONFIDENCE = 0.6;

// =====================================
// DOM
// =====================================
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const predictionEl = document.getElementById("prediction");
const confidenceEl = document.getElementById("confidence");

const btnWebcam = document.getElementById("btnWebcam");
const btnVideo = document.getElementById("btnVideo");
const videoUpload = document.getElementById("videoUpload");

// =====================================
// STATE
// =====================================
let buffer = [];
let lastPredictions = [];
let sending = false;
let stream = null;
let currentSource = null; // "webcam" | "video"
let rafId = null;
let lastTime = 0;
let processingFrame = false;
let lockedPrediction = null;
let lockedConfidence = 0;



// =====================================
// MEDIAPIPE HANDS (UNA SOLA VEZ)
// =====================================
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

hands.onResults(onResults);

// =====================================
// MAIN LOOP (ÚNICO)
// =====================================
async function loop(timestamp) {
  if (timestamp - lastTime < FRAME_INTERVAL) {
    rafId = requestAnimationFrame(loop);
    return;
  }
  lastTime = timestamp;

  if (
    video.readyState >= 2 &&
    !processingFrame &&
    video.videoWidth > 0
  ) {
    processingFrame = true;
    await hands.send({ image: video });
    processingFrame = false;
  }

  rafId = requestAnimationFrame(loop);
}

// =====================================
// RESULTS
// =====================================
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks?.length) return;

  const hand = results.multiHandLandmarks[0];
  const wrist = hand[0];

  // Dibujar landmarks
  for (const lm of hand) {
    ctx.beginPath();
    ctx.arc(
      lm.x * canvas.width,
      lm.y * canvas.height,
      4,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "#7b00ce";
    ctx.fill();
  }

  const frame = [];
  for (const lm of hand) {
    frame.push(
      lm.x - wrist.x,
      lm.y - wrist.y,
      lm.z - wrist.z
    );
  }

  if (frame.length !== FEATURES) return;

  buffer.push(frame);

  if (buffer.length < WINDOW_SIZE) {
    if (!lockedPrediction) {
      predictionEl.textContent = "Analizando…";
    }
    return;
  }

  if (!sending) {
    sending = true;
    sendToBackend([...buffer]).finally(() => (sending = false));
    buffer = [];
  }
}

// =====================================
// BACKEND
// =====================================
async function sendToBackend(sequence) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence }),
    });

    if (!res.ok) return;

    const data = await res.json();

    // TOP-3
    predictionEl.innerHTML = data.top3
      .map(
        (p) => `${p.label} (${(p.confidence * 100).toFixed(1)}%)`
      )
      .join("<br>");

    // Consenso
    lastPredictions.push(data.label);
    if (lastPredictions.length > 3) lastPredictions.shift();

    const consensus = lastPredictions.every(
      (p) => p === lastPredictions[0]
    );

    if (consensus) {
      predictionEl.innerHTML = `<strong>${data.label}</strong>`;
      confidenceEl.textContent =
        `Confianza: ${(data.confidence * 100).toFixed(1)}%`;
    }
  } catch (e) {
    console.error(e);
  }
}

// =====================================
// RESET
// =====================================
function reset() {
  buffer = [];
  lastPredictions = [];
  predictionEl.textContent = "—";
  confidenceEl.textContent = "";
  lockedPrediction = null;
  lockedConfidence = 0;
  lockUntil = 0;

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  video.pause();
  video.srcObject = null;
  video.src = "";
}

// =====================================
// WEBCAM
// =====================================
btnWebcam.onclick = async () => {
  reset();
  currentSource = "webcam";

  stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;

  video.onloadedmetadata = async () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    await video.play();
    rafId = requestAnimationFrame(loop);
  };
};
// =====================================
// VIDEO
// =====================================
btnVideo.addEventListener("click", (e) => {
  e.preventDefault(); // por si está dentro de un form
  e.stopPropagation();

  console.log("CLICK btnVideo"); // ✅ debug

  // 🔑 importantísimo para que onchange dispare aunque repitas el mismo archivo
  videoUpload.value = "";

  // NO llames a reset() aquí si te está frenando (luego lo hacemos en onchange)
  videoUpload.click();
});


videoUpload.addEventListener("change", async () => {
  console.log("CHANGE videoUpload", videoUpload.files); // ✅ debug

  const file = videoUpload.files?.[0];
  if (!file) return;

  reset();
  currentSource = "video";

  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.loop = true;
  video.playsInline = true;

  // Esperar metadata de verdad
  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  await video.play();

  rafId = requestAnimationFrame(loop);
});