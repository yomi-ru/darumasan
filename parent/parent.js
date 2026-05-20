import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  remove,
  onValue,
  onChildAdded
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZClEsb5RkhHcTr9eJtOmC3oWYdt4MKps",
  authDomain: "darumasan-ff1bd.firebaseapp.com",
  projectId: "darumasan-ff1bd",
  storageBucket: "darumasan-ff1bd.firebasestorage.app",
  messagingSenderId: "714642759200",
  appId: "1:714642759200:web:c2e882eecc94bb598a6645",
  measurementId: "G-F6FGRBSEHL",
  databaseURL: "https://darumasan-ff1bd-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const ROOM_ID = "daruma-main";

const PLAYER_COUNT = 5;

const DARUMA_FRONT_IMAGE = "../images/front.png";
const DARUMA_BACK_IMAGE = "../images/rear.png";

const RUNNING_AUDIO = "../audio/Yoichi.m4a";
const RUNNING_AUDIO_ORIGINAL_MS = 2420;

const RUNNING_MIN_MS = 3000;
const RUNNING_MAX_MS = 7000;

const STOP_MIN_MS = 5000;
const STOP_MAX_MS = 5000;

const OUT_DISPLAY_MS = 5000;

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const startOverlay = document.getElementById("startOverlay");
const startGameBtn = document.getElementById("startGameBtn");

const darumaImage = document.getElementById("darumaImage");
const modeText = document.getElementById("modeText");
const playersView = document.getElementById("players");

let currentMode = "idle";
let isGameRunning = false;
let timerId = null;
let turn = 0;
let stopPhaseResolved = false;
let sessionStartTime = Date.now();

let runningAudio = null;

const playerCards = new Map();

function basePath() {
  return `daruma/${ROOM_ID}`;
}

function randomMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function stopRunningAudio() {
  if (!runningAudio) return;

  runningAudio.pause();
  runningAudio.currentTime = 0;
  runningAudio = null;
}

function playRunningAudioForDuration(durationMs) {
  stopRunningAudio();

  runningAudio = new Audio(RUNNING_AUDIO);

  const playbackRate = RUNNING_AUDIO_ORIGINAL_MS / durationMs;

  runningAudio.playbackRate = playbackRate;

  runningAudio.preservesPitch = true;
  runningAudio.mozPreservesPitch = true;
  runningAudio.webkitPreservesPitch = true;

  runningAudio.currentTime = 0;

  runningAudio.play().catch((error) => {
    console.error("音声再生エラー:", error);
  });
}

function clearTimer() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function createPlayerCards() {
  playersView.innerHTML = "";
  playerCards.clear();

  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const card = document.createElement("div");
    card.className = "player-card";
    card.textContent = i;
    card.dataset.playerNo = String(i);

    playersView.appendChild(card);
    playerCards.set(String(i), card);
  }
}

function clearOutDisplay() {
  for (const card of playerCards.values()) {
    card.classList.remove("out");
  }
}

function showOutPlayer(playerNo) {
  clearOutDisplay();

  const card = playerCards.get(String(playerNo));

  if (card) {
    card.classList.add("out");
  }
}

async function setMode(mode) {
  currentMode = mode;

  modeText.className = "mode-text";
  darumaImage.className = "daruma-img";

  if (mode === "running") {
    darumaImage.src = DARUMA_BACK_IMAGE;
    darumaImage.classList.add("running");

    modeText.textContent = "だるまさんが";
    modeText.classList.add("running");
  } else if (mode === "stop") {
    darumaImage.src = DARUMA_FRONT_IMAGE;
    darumaImage.classList.add("stop");

    modeText.textContent = "転んだ！";
    modeText.classList.add("stop");
  } else {
    darumaImage.src = DARUMA_BACK_IMAGE;
    modeText.textContent = "待機中";
  }

  await update(ref(db, `${basePath()}/state`), {
    mode,
    turn,
    updatedAt: Date.now()
  });
}

async function startGame() {
  if (isGameRunning) return;

  isGameRunning = true;
  sessionStartTime = Date.now();
  turn = 0;
  stopPhaseResolved = false;

  startOverlay.classList.add("hidden");

  await remove(ref(db, `${basePath()}/events`));
  await remove(ref(db, `${basePath()}/violations`));

  clearOutDisplay();

  await nextRunningPhase();
}

async function stopGame() {
  if (!isGameRunning) return;

  isGameRunning = false;
  clearTimer();
  stopRunningAudio();

  await setMode("idle");

  clearOutDisplay();
  startOverlay.classList.remove("hidden");
}

async function nextRunningPhase() {
  if (!isGameRunning) return;

  clearTimer();
  clearOutDisplay();

  turn++;
  stopPhaseResolved = false;

  await setMode("running");

  const duration = randomMs(RUNNING_MIN_MS, RUNNING_MAX_MS);

  playRunningAudioForDuration(duration);

  timerId = setTimeout(() => {
    stopRunningAudio();

    nextStopPhase().catch((error) => {
      console.error(error);
    });
  }, duration);
}

async function nextStopPhase() {
  if (!isGameRunning) return;

  clearTimer();
  stopRunningAudio();

  stopPhaseResolved = false;

  await setMode("stop");

  const duration = randomMs(STOP_MIN_MS, STOP_MAX_MS);

  timerId = setTimeout(() => {
    if (!stopPhaseResolved) {
      nextRunningPhase().catch((error) => {
        console.error(error);
      });
    }
  }, duration);
}

async function handleViolation(playerNo) {
  if (!isGameRunning) return;
  if (currentMode !== "stop") return;
  if (stopPhaseResolved) return;

  stopPhaseResolved = true;
  clearTimer();
  stopRunningAudio();

  await set(ref(db, `${basePath()}/violations/${playerNo}`), {
    playerNo,
    turn,
    time: Date.now()
  });

  showOutPlayer(playerNo);

  timerId = setTimeout(() => {
    clearOutDisplay();

    if (isGameRunning) {
      nextRunningPhase().catch((error) => {
        console.error(error);
      });
    }
  }, OUT_DISPLAY_MS);
}

function listenEvents() {
  onChildAdded(ref(db, `${basePath()}/events`), async (snapshot) => {
    const event = snapshot.val();

    if (!event || !event.playerNo) return;

    if (!event.clientTime || event.clientTime < sessionStartTime) {
      return;
    }

    await handleViolation(event.playerNo);
  });
}

function listenStateFromFirebase() {
  onValue(ref(db, `${basePath()}/state/mode`), (snapshot) => {
    const mode = snapshot.val();

    if (!mode) return;

    currentMode = mode;
  });
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "s") {
    stopGame().catch((error) => {
      console.error(error);
    });
  }
});

createPlayerCards();
listenEvents();
listenStateFromFirebase();

startGameBtn.addEventListener("click", () => {
  startGame().catch((error) => {
    console.error(error);
    alert("開始に失敗しました：" + error.message);
  });
});