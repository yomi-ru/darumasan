import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  remove,
  onValue,
  onChildAdded,
  query,
  orderByChild,
  startAt
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

const RUNNING_MIN_MS = 3000;
const RUNNING_MAX_MS = 7000;

const STOP_MIN_MS = 1800;
const STOP_MAX_MS = 3200;

const OUT_DISPLAY_MS = 1000;

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const startGameBtn = document.getElementById("startGameBtn");
const stopGameBtn = document.getElementById("stopGameBtn");
const resetBtn = document.getElementById("resetBtn");

const darumaImage = document.getElementById("darumaImage");
const modeView = document.getElementById("modeView");
const turnView = document.getElementById("turnView");
const message = document.getElementById("message");
const playersView = document.getElementById("players");
const log = document.getElementById("log");

let currentMode = "idle";
let isGameRunning = false;
let timerId = null;
let turn = 0;
let stopPhaseResolved = false;
let sessionStartTime = Date.now();

const playerCards = new Map();

function basePath() {
  return `daruma/${ROOM_ID}`;
}

function showLog(text) {
  log.textContent = text;
}

function randomMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

  message.textContent = `${playerNo} 番 アウト！`;
}

async function setMode(mode) {
  currentMode = mode;

  await update(ref(db, `${basePath()}/state`), {
    mode,
    turn,
    updatedAt: Date.now()
  });

  if (mode === "running") {
    darumaImage.src = DARUMA_BACK_IMAGE;
    modeView.textContent = "だるまさんが";
    modeView.className = "mode running";
  } else if (mode === "stop") {
    darumaImage.src = DARUMA_FRONT_IMAGE;
    modeView.textContent = "転んだ!";
    modeView.className = "mode stop";
  } else {
    darumaImage.src = DARUMA_BACK_IMAGE;
    modeView.textContent = "待機中";
    modeView.className = "mode";
  }
}

async function startGame() {
  if (isGameRunning) {
    showLog("すでに進行中です");
    return;
  }

  isGameRunning = true;
  sessionStartTime = Date.now();
  turn = 0;
  stopPhaseResolved = false;

  await remove(ref(db, `${basePath()}/events`));
  await remove(ref(db, `${basePath()}/violations`));

  clearOutDisplay();
  showLog("ゲーム開始");
  message.textContent = "ゲーム開始！";

  nextRunningPhase();
}

async function stopGame() {
  isGameRunning = false;
  clearTimer();

  await setMode("idle");

  clearOutDisplay();
  message.textContent = "停止中";
  showLog("ゲームを停止しました");
}

async function resetGame() {
  isGameRunning = false;
  clearTimer();
  turn = 0;
  stopPhaseResolved = false;

  await remove(ref(db, `${basePath()}/events`));
  await remove(ref(db, `${basePath()}/violations`));
  await setMode("idle");

  clearOutDisplay();
  turnView.textContent = "ターン：0";
  message.textContent = "開始ボタンを押してください";
  showLog("リセットしました");
}

async function nextRunningPhase() {
  if (!isGameRunning) return;

  clearTimer();
  clearOutDisplay();

  turn++;
  turnView.textContent = `ターン：${turn}`;
  message.textContent = "進め！";
  stopPhaseResolved = false;

  await setMode("running");

  const duration = randomMs(RUNNING_MIN_MS, RUNNING_MAX_MS);

  showLog(`running：${duration / 1000}秒`);

  timerId = setTimeout(() => {
    nextStopPhase();
  }, duration);
}

async function nextStopPhase() {
  if (!isGameRunning) return;

  clearTimer();

  message.textContent = "止まれ！";
  stopPhaseResolved = false;

  await setMode("stop");

  const duration = randomMs(STOP_MIN_MS, STOP_MAX_MS);

  showLog(`stop：${duration / 1000}秒`);

  timerId = setTimeout(() => {
    if (!stopPhaseResolved) {
      nextRunningPhase();
    }
  }, duration);
}

async function handleViolation(playerNo) {
  if (!isGameRunning) return;
  if (currentMode !== "stop") return;
  if (stopPhaseResolved) return;

  stopPhaseResolved = true;
  clearTimer();

  await set(ref(db, `${basePath()}/violations/${playerNo}`), {
    playerNo,
    turn,
    time: Date.now()
  });

  showOutPlayer(playerNo);
  showLog(`${playerNo}番がアウト`);

  timerId = setTimeout(() => {
    clearOutDisplay();

    if (isGameRunning) {
      nextRunningPhase();
    }
  }, OUT_DISPLAY_MS);
}

function listenEvents() {
  const eventsQuery = query(
    ref(db, `${basePath()}/events`),
    orderByChild("clientTime"),
    startAt(sessionStartTime)
  );

  onChildAdded(eventsQuery, async (snapshot) => {
    const event = snapshot.val();

    if (!event || !event.playerNo) return;

    showLog(`受信：${event.playerNo}番`);

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

createPlayerCards();
listenEvents();
listenStateFromFirebase();

startGameBtn.addEventListener("click", startGame);
stopGameBtn.addEventListener("click", stopGame);
resetBtn.addEventListener("click", resetGame);