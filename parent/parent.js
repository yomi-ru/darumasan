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

/* 音声ファイル */
const DARUMA_SANGA_AUDIO = "../audio/darumasanga.m4a";
const KORONDA_AUDIO = "../audio/koronda.m4a";

/* 音源そのものの長さ */
const DARUMA_SANGA_ORIGINAL_MS = 1410;
const KORONDA_ORIGINAL_MS = 1000;

/*
 * 1回の「だるまさんがころんだ」演出時間
 * 3000ms〜5000msの中からランダムに決定する
 */
const CALL_TOTAL_MIN_MS = 3000;
const CALL_TOTAL_MAX_MS = 5000;

/* 「だるまさんが」と「ころんだ」の間の長さ */
const GAP_MIN_MS = 10;
const GAP_MAX_MS = 550;

/*
 * 「ころんだ！」になってから次ターンへ進むまでの時間
 * 判定時間を確保するため、現在は5秒に設定
 */
const STOP_JUDGE_MS = 5000;

/* アウト表示時間 */
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

let activeAudio = null;

const playerCards = new Map();
const finishedPlayers = new Set();

function basePath() {
  return `daruma/${ROOM_ID}`;
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

function stopAudio() {
  if (!activeAudio) return;

  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = null;
}

function playAudio(path, playbackRate = 1) {
  stopAudio();

  activeAudio = new Audio(path);
  activeAudio.playbackRate = playbackRate;

  /*
   * 対応ブラウザでは、
   * 再生速度を変えても声の高さが変わりにくいようにする
   */
  activeAudio.preservesPitch = true;
  activeAudio.mozPreservesPitch = true;
  activeAudio.webkitPreservesPitch = true;

  activeAudio.currentTime = 0;

  activeAudio.play().catch((error) => {
    console.error("音声再生エラー:", error);
  });
}

/*
 * 1ターン分の音声タイミングを決定する
 *
 * 例：
 * totalMs = 4000ms
 * darumaSangaMs = 2000ms
 * gapMs = 300ms
 * korondaMs = 1000ms（等倍固定）
 * remainingMs = 700ms
 */
function createCallTiming() {
  const totalMs = randomMs(CALL_TOTAL_MIN_MS, CALL_TOTAL_MAX_MS);

  /*
   * 「だるまさんが」は全体時間の1/2にする
   */
  const darumaSangaMs = Math.round(totalMs / 2);

  /*
   * 「ころんだ」は1000msの等倍再生なので、
   * 全体時間内に収まるように間の最大値を自動調整する
   */
  const availableGapMax = totalMs - darumaSangaMs - KORONDA_ORIGINAL_MS;
  const safeGapMax = Math.min(GAP_MAX_MS, availableGapMax);

  const gapMs = randomMs(GAP_MIN_MS, Math.max(GAP_MIN_MS, safeGapMax));

  /*
   * 音声再生後に余る時間
   * 演出タイミング確認用として算出している
   */
  const remainingMs =
    totalMs - darumaSangaMs - gapMs - KORONDA_ORIGINAL_MS;

  return {
    totalMs,
    darumaSangaMs,
    gapMs,
    remainingMs
  };
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

function clearAllPlayerStatus() {
  finishedPlayers.clear();

  for (const card of playerCards.values()) {
    card.classList.remove("out");
    card.classList.remove("finished");
  }
}

function showOutPlayer(playerNo) {
  clearOutDisplay();

  const card = playerCards.get(String(playerNo));

  if (card && !finishedPlayers.has(String(playerNo))) {
    card.classList.add("out");
  }
}

async function showFinishedPlayer(playerNo) {
  const no = String(playerNo);

  finishedPlayers.add(no);

  const card = playerCards.get(no);

  if (card) {
    card.classList.remove("out");
    card.classList.add("finished");
  }

  await set(ref(db, `${basePath()}/finished/${no}`), {
    playerNo: no,
    turn,
    time: Date.now()
  });
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
  await remove(ref(db, `${basePath()}/finished`));

  clearAllPlayerStatus();

  await nextRunningPhase();
}

async function stopGame() {
  if (!isGameRunning) return;

  isGameRunning = false;

  clearTimer();
  stopAudio();

  await setMode("idle");

  clearOutDisplay();
  startOverlay.classList.remove("hidden");
}

/*
 * 裏向きのだるまを表示し、
 * 「だるまさんが」の音声を可変速で再生する
 */
async function nextRunningPhase() {
  if (!isGameRunning) return;

  clearTimer();
  stopAudio();
  clearOutDisplay();

  turn++;
  stopPhaseResolved = false;

  const timing = createCallTiming();

  await setMode("running");

  /*
   * 1410msの音声を、全体時間の1/2の長さに合わせる
   *
   * 例：
   * 1410msの音声を2000msにしたい場合
   * playbackRate = 1410 / 2000 = 0.705倍速
   */
  const darumaSangaPlaybackRate =
    DARUMA_SANGA_ORIGINAL_MS / timing.darumaSangaMs;

  playAudio(DARUMA_SANGA_AUDIO, darumaSangaPlaybackRate);

  console.log("音声タイミング:", {
    totalMs: timing.totalMs,
    darumaSangaMs: timing.darumaSangaMs,
    gapMs: timing.gapMs,
    korondaMs: KORONDA_ORIGINAL_MS,
    remainingMs: timing.remainingMs,
    darumaSangaPlaybackRate
  });

  /*
   * 「だるまさんが」が終わったあと、
   * ランダムな間を入れて「ころんだ」に進む
   */
  timerId = setTimeout(() => {
    stopAudio();

    timerId = setTimeout(() => {
      nextStopPhase(timing).catch((error) => {
        console.error(error);
      });
    }, timing.gapMs);
  }, timing.darumaSangaMs);
}

/*
 * 「ころんだ」を等倍速で再生し、
 * 音声が最後まで終わった瞬間からstop判定を開始する
 */
async function nextStopPhase(timing) {
  if (!isGameRunning) return;

  clearTimer();
  stopAudio();

  stopPhaseResolved = false;
  playAudio(KORONDA_AUDIO, 1);

  timerId = setTimeout(async () => {
    if (!isGameRunning) return;
    stopAudio();
    await setMode("stop");

    timerId = setTimeout(() => {
      if (!stopPhaseResolved) {
        nextRunningPhase().catch((error) => {
          console.error(error);
        });
      }
    }, STOP_JUDGE_MS);

  }, KORONDA_ORIGINAL_MS);
}
async function handleViolation(playerNo) {
  if (!isGameRunning) return;
  if (currentMode !== "stop") return;
  if (stopPhaseResolved) return;
  if (finishedPlayers.has(String(playerNo))) return;

  stopPhaseResolved = true;

  clearTimer();
  stopAudio();

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

async function handleFinish(playerNo) {
  if (!isGameRunning) return;

  await showFinishedPlayer(playerNo);
}

function listenEvents() {
  onChildAdded(ref(db, `${basePath()}/events`), async (snapshot) => {
    const event = snapshot.val();

    if (!event || !event.playerNo) return;

    if (!event.clientTime || event.clientTime < sessionStartTime) {
      return;
    }

    if (event.type === "finish") {
      await handleFinish(event.playerNo);
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

/*
 * 親端末でSキーを押すと競技停止
 */
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