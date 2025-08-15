let ws;
let myName = null;
let isPaired = false;
let nameQueued = null;

const statusEl = document.getElementById("status");
const skipBtn = document.getElementById("skipBtn");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const chatArea = document.getElementById("chatArea");
const connecting = document.getElementById("connecting");

const nameModal = document.getElementById("nameModal");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const inputBar = document.getElementById("inputBar");

function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener("open", function () {
        console.log("Connected.")
        ws.send(JSON.stringify({ "type": "Connection message" }))
    })
}

connect()