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
const DEBOUNCE_MS = 700;

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const upperPlayerNoInput = document.getElementById("upperPlayerNo");
const lowerPlayerNoInput = document.getElementById("lowerPlayerNo");

const saveBtn = document.getElementById("saveBtn");
const focusBtn = document.getElementById("focusBtn");

const registeredTeams = document.getElementById("registeredTeams");
const log = document.getElementById("log");
const modeText = document.getElementById("modeText");
const stateBox = document.getElementById("stateBox");

let upperPlayerNo = localStorage.getItem("daruma_upperPlayerNo") || "";
let lowerPlayerNo = localStorage.getItem("daruma_lowerPlayerNo") || "";

let lastUpperSendTime = 0;
let lastLowerSendTime = 0;
let isStateListening = false;

upperPlayerNoInput.value = upperPlayerNo;
lowerPlayerNoInput.value = lowerPlayerNo;

function showLog(message) {
    log.textContent = message;
}

function isValidTeamNo(value) {
    if (value === "") {
        return true;
    }

    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 5;
}

function updateRegisteredTeamsView() {
    const upperText = upperPlayerNo
        ? `右矢印 → チーム ${upperPlayerNo}`
        : "右矢印 → 未設定";

    const lowerText = lowerPlayerNo
        ? `左矢印 ← チーム ${lowerPlayerNo}`
        : "左矢印 ← 未設定";

    registeredTeams.innerHTML = `
        <div>${upperText}</div>
        <div>${lowerText}</div>
    `;
}

function activatePageFocus() {
    upperPlayerNoInput.blur();
    lowerPlayerNoInput.blur();
    saveBtn.blur();
    focusBtn.blur();

    document.body.tabIndex = -1;
    document.body.focus();
}

function saveSettings() {
    const upperValue = upperPlayerNoInput.value.trim();
    const lowerValue = lowerPlayerNoInput.value.trim();

    if (!upperValue && !lowerValue) {
        alert("1つ以上のチーム番号を入力してください");
        return;
    }

    if (!isValidTeamNo(upperValue) || !isValidTeamNo(lowerValue)) {
        alert("チーム番号は1〜5で入力してください");
        return;
    }

    if (upperValue && lowerValue && upperValue === lowerValue) {
        alert("上側と下側には別のチーム番号を設定してください");
        return;
    }

    upperPlayerNo = upperValue;
    lowerPlayerNo = lowerValue;

    localStorage.setItem("daruma_upperPlayerNo", upperPlayerNo);
    localStorage.setItem("daruma_lowerPlayerNo", lowerPlayerNo);

    updateRegisteredTeamsView();
    listenGameState();
    activatePageFocus();

    showLog("設定完了：右矢印・左矢印の入力を待機中");
}

function listenGameState() {
    if (isStateListening) {
        return;
    }

    isStateListening = true;

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

async function sendMoveEvent(playerNo, inputKey) {
    if (!playerNo) {
        showLog(`${inputKey}側のチームが設定されていません`);
        return;
    }

    const now = Date.now();

    if (inputKey === "right") {
        if (now - lastUpperSendTime < DEBOUNCE_MS) {
            showLog(`チーム ${playerNo} の連続入力を無視しました`);
            return;
        }

        lastUpperSendTime = now;
    }

    if (inputKey === "left") {
        if (now - lastLowerSendTime < DEBOUNCE_MS) {
            showLog(`チーム ${playerNo} の連続入力を無視しました`);
            return;
        }

        lastLowerSendTime = now;
    }

    const eventRef = push(ref(db, `daruma/${ROOM_ID}/events`));

    await set(eventRef, {
        playerNo,
        type: "move",
        inputKey,
        clientTime: now,
        createdAt: serverTimestamp()
    });

    showLog(`動き検知送信：チーム ${playerNo}`);
}

saveBtn.addEventListener("click", saveSettings);

focusBtn.addEventListener("click", () => {
    activatePageFocus();
    showLog("画面を有効化しました。右矢印・左矢印を待機中");
});

document.addEventListener("keydown", (event) => {
    if (event.code === "ArrowRight" || event.key === "ArrowRight") {
        event.preventDefault();

        sendMoveEvent(upperPlayerNo, "right").catch((error) => {
            console.error(error);
            showLog("送信エラー：" + error.message);
        });
    }

    if (event.code === "ArrowLeft" || event.key === "ArrowLeft") {
        event.preventDefault();

        sendMoveEvent(lowerPlayerNo, "left").catch((error) => {
            console.error(error);
            showLog("送信エラー：" + error.message);
        });
    }
});

updateRegisteredTeamsView();

if (upperPlayerNo || lowerPlayerNo) {
    listenGameState();
}