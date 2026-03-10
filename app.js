const phases = [
  { label: "In", duration: 4, state: "in" },
  { label: "Hold", duration: 7, state: "hold" },
  { label: "Out", duration: 8, state: "out" },
];

const cueLabel = document.getElementById("cueLabel");
const cueCount = document.getElementById("cueCount");
const phaseRemaining = document.getElementById("phaseRemaining");
const sessionRemaining = document.getElementById("sessionRemaining");
const sessionMinutes = document.getElementById("sessionMinutes");
const ambientSound = document.getElementById("ambientSound");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");
const soundEnabled = document.getElementById("soundEnabled");
const breathVisual = document.querySelector(".breath-visual");

let timerId = null;
let selectedMinutes = Number(sessionMinutes.value);
let sessionSecondsLeft = selectedMinutes * 60;
let phaseIndex = 0;
let phaseSecondsLeft = phases[0].duration;
let isRunning = false;
const speechCache = new Map();
let activeAudio = null;
let ambientContext = null;
let ambientNodes = [];
let ambientIntervals = [];
let currentAmbient = "none";

function getAmbientContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  if (!ambientContext) {
    ambientContext = new AudioContextClass();
  }

  return ambientContext;
}

function clearAmbient() {
  ambientIntervals.forEach((intervalId) => window.clearInterval(intervalId));
  ambientIntervals = [];

  ambientNodes.forEach((node) => {
    try {
      node.stop?.();
    } catch {}

    try {
      node.disconnect?.();
    } catch {}
  });

  ambientNodes = [];
}

function createNoiseBuffer(context, lengthSeconds = 2) {
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, sampleRate * lengthSeconds, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

function addWaveAmbient(context) {
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, 3);
  source.loop = true;

  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 420;

  const gainNode = context.createGain();
  gainNode.gain.value = 0.035;

  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(lowpass.frequency);

  source.connect(lowpass);
  lowpass.connect(gainNode);
  gainNode.connect(context.destination);

  source.start();
  lfo.start();
  ambientNodes.push(source, lowpass, gainNode, lfo, lfoGain);
}

function addRainAmbient(context) {
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, 2);
  source.loop = true;

  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 1800;

  const gainNode = context.createGain();
  gainNode.gain.value = 0.018;

  source.connect(highpass);
  highpass.connect(gainNode);
  gainNode.connect(context.destination);
  source.start();
  ambientNodes.push(source, highpass, gainNode);
}

function addNightAmbient(context) {
  addRainAmbient(context);

  const chirpInterval = window.setInterval(() => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(1200 + Math.random() * 900, context.currentTime);
    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.015, context.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    ambientNodes.push(oscillator, gainNode);
  }, 2400);

  ambientIntervals.push(chirpInterval);
}

function addForestAmbient(context) {
  const drone = context.createOscillator();
  const droneGain = context.createGain();
  drone.type = "sine";
  drone.frequency.value = 220;
  droneGain.gain.value = 0.008;
  drone.connect(droneGain);
  droneGain.connect(context.destination);
  drone.start();
  ambientNodes.push(drone, droneGain);

  const birdInterval = window.setInterval(() => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(900 + Math.random() * 700, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1400 + Math.random() * 900, context.currentTime + 0.12);
    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.018, context.currentTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
    ambientNodes.push(oscillator, gainNode);
  }, 3200);

  ambientIntervals.push(birdInterval);
}

function syncAmbientSound() {
  clearAmbient();
  currentAmbient = ambientSound.value;

  if (!isRunning || currentAmbient === "none") {
    return;
  }

  const context = getAmbientContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    context.resume();
  }

  if (currentAmbient === "waves") {
    addWaveAmbient(context);
    return;
  }

  if (currentAmbient === "forest") {
    addForestAmbient(context);
    return;
  }

  if (currentAmbient === "rain") {
    addRainAmbient(context);
    return;
  }

  if (currentAmbient === "night") {
    addNightAmbient(context);
  }
}

function playFallbackTone(phase) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const frequencyByState = {
    in: 392,
    hold: 523.25,
    out: 329.63,
  };

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequencyByState[phase.state], now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.35);
}

async function fetchSpeech(text) {
  if (speechCache.has(text)) {
    return speechCache.get(text);
  }

  const response = await fetch("/api/speak", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("Speech request failed.");
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  speechCache.set(text, audioUrl);
  return audioUrl;
}

async function speakPhase(phase) {
  if (!soundEnabled.checked) {
    return;
  }

  try {
    const audioUrl = await fetchSpeech(phase.label);

    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }

    activeAudio = new Audio(audioUrl);
    activeAudio.play();
  } catch (error) {
    console.error(error);
    playFallbackTone(phase);
  }
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateDisplay() {
  const phase = phases[phaseIndex];
  cueLabel.textContent = phase.label;
  cueCount.textContent = `${phase.duration} seconds`;
  phaseRemaining.textContent = formatClock(phaseSecondsLeft);
  sessionRemaining.textContent = formatClock(sessionSecondsLeft);
  breathVisual.dataset.state = phase.state;
}

function advancePhase() {
  phaseIndex = (phaseIndex + 1) % phases.length;
  phaseSecondsLeft = phases[phaseIndex].duration;
  speakPhase(phases[phaseIndex]);
}

function stopSession(resetClock = false) {
  window.clearInterval(timerId);
  timerId = null;
  isRunning = false;
  clearAmbient();

  if (resetClock) {
    phaseIndex = 0;
    phaseSecondsLeft = phases[0].duration;
    sessionSecondsLeft = Number(sessionMinutes.value) * 60;
  }

  updateDisplay();
}

function tick() {
  if (sessionSecondsLeft <= 0) {
    stopSession(true);
    return;
  }

  sessionSecondsLeft -= 1;
  phaseSecondsLeft -= 1;

  if (phaseSecondsLeft <= 0 && sessionSecondsLeft > 0) {
    advancePhase();
  }

  if (sessionSecondsLeft <= 0) {
    stopSession(true);
    return;
  }

  updateDisplay();
}

function startSession() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  updateDisplay();
  syncAmbientSound();
  speakPhase(phases[phaseIndex]);
  timerId = window.setInterval(tick, 1000);
}

sessionMinutes.addEventListener("change", () => {
  selectedMinutes = Number(sessionMinutes.value);

  if (isRunning) {
    stopSession(true);
  } else {
    sessionSecondsLeft = selectedMinutes * 60;
    phaseIndex = 0;
    phaseSecondsLeft = phases[0].duration;
    updateDisplay();
  }
});

ambientSound.addEventListener("change", syncAmbientSound);
startButton.addEventListener("click", startSession);
pauseButton.addEventListener("click", () => stopSession(false));
resetButton.addEventListener("click", () => stopSession(true));

updateDisplay();
