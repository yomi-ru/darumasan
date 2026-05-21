import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
    getDatabase,
    ref,
    push,
    set,
    serverTimestamp,
    onValue
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const playerNoInput = document.getElementById("playerNo");
const saveBtn = document.getElementById("saveBtn");
const focusBtn = document.getElementById("focusBtn");
const log = document.getElementById("log");
const modeText = document.getElementById("modeText");
const stateBox = document.getElementById("stateBox");

let playerNo = localStorage.getItem("daruma_playerNo") || "";
let lastSendTime = 0;

const debounceMs = 700;

playerNoInput.value = playerNo;

function showLog(message) {
    log.textContent = message;
}

function saveSettings() {
    playerNo = playerNoInput.value.trim();

    if (!playerNo) {
        alert("参加者番号を入力してね！");
        return;
    }

    localStorage.setItem("daruma_playerNo", playerNo);
    listenGameState();

    showLog(`参加者 ${playerNo} として待機中`);
    document.body.tabIndex = -1;
    document.body.focus();
}

function listenGameState() {
    const stateRef = ref(db, `daruma/${ROOM_ID}/state/mode`);

    onValue(stateRef, (snapshot) => {
        const mode = snapshot.val();

        if (mode === "stop") {
            modeText.textContent = "止まれ";
            stateBox.className = "status danger";
        } else if (mode === "running") {
            modeText.textContent = "動いてOK";
            stateBox.className = "status safe";
        } else {
            modeText.textContent = "待機中";
            stateBox.className = "status";
        }
    });
}

async function sendPlayerEvent(type) {
    if (!playerNo) {
        showLog("先に参加者番号を設定してね！");
        return;
    }

    const now = Date.now();

    if (now - lastSendTime < debounceMs) {
        showLog("連続入力を無視しました");
        return;
    }

    lastSendTime = now;

    const eventRef = push(ref(db, `daruma/${ROOM_ID}/events`));

    await set(eventRef, {
        playerNo,
        type,
        clientTime: now,
        createdAt: serverTimestamp()
    });

    if (type === "finish") {
        showLog(`ゴール送信：参加者 ${playerNo}`);
    } else {
        showLog(`動き検知送信：参加者 ${playerNo}`);
    }
}

saveBtn.addEventListener("click", saveSettings);

focusBtn.addEventListener("click", () => {
    playerNoInput.blur();
    saveBtn.blur();
    focusBtn.blur();

    document.body.tabIndex = -1;
    document.body.focus();

    showLog("画面を有効化しました。Spaceで動き検知、Enterでゴール送信");
});

document.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.key === " ") {
        event.preventDefault();

        sendPlayerEvent("move").catch((error) => {
            console.error(error);
            showLog("送信エラー：" + error.message);
        });
    }

    if (event.code === "Enter" || event.key === "Enter") {
        event.preventDefault();

        sendPlayerEvent("finish").catch((error) => {
            console.error(error);
            showLog("送信エラー：" + error.message);
        });
    }
});

if (playerNo) {
    listenGameState();
}