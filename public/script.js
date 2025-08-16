let ws;
let myName = null;
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

const userName = localStorage.getItem("name");
if (userName) {
    nameInput.value = userName;
}


function setUIDisabled() {
    msgInput.disabled = true;
    sendBtn.disabled = true;
    skipBtn.disabled = true;
    connecting.classList.add("show");
    nameModal.classList.add("blur")
}

function setUIWaiting() {
    statusEl.textContent = "Connecting to a random user…";
    msgInput.disabled = true;
    sendBtn.disabled = true;
    skipBtn.disabled = true;
    connecting.classList.add("show");
    nameModal.classList.add("blur");
}

function setUIPaired(partnerName) {
    statusEl.textContent = `Chatting with ${partnerName}`;
    msgInput.disabled = false;
    sendBtn.disabled = false;
    skipBtn.disabled = false;
    connecting.classList.remove("show");
    nameModal.classList.remove("blur")
    nameModal.classList.remove("show")
}

function addMsg(sender, text, isMe) {
    const div = document.createElement("div");
    div.className = "msg" + (isMe ? " me" : "");
    div.innerHTML = `<span class="sender">${sender}</span>${escapeHtml(text)}`;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function systemLine(text) {
    const div = document.createElement("div");
    div.className = "system";
    div.textContent = text;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}



function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener("open", function () {
        console.log("WebSocket connected.")
        if (nameQueued) {
            ws.send(JSON.stringify({ type: "set_name", name: nameQueued }));
            nameQueued = null
        }
    })

    ws.addEventListener("message", function (ev) {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
            case "waiting":
                setTimeout(() => ws.send(JSON.stringify({ "type": "doMatch" })), 500)
                setUIWaiting();
                break;
            case "matched":
                setUIPaired(msg.data.partnerName || "Stranger");
                systemLine(`You're now chatting with ${msg.data.partnerName || "a stranger"}.`);
                console.log("matched")
                break;
            case "chat":
                addMsg(msg.data.from || "Stranger", msg.data.text || "", false);
                break;
            case "partner_left":
                systemLine(`${msg.data.partnerName || "Stranger"} left the chat.`);
                setUIWaiting();
                ws.send(JSON.stringify({ "type": "doMatch" }))
                break;
            case "left_your_partner":
                systemLine(`You skipped ${msg.data.partnerName || "Stranger"}.`);
                setUIWaiting();
                setTimeout(() => ws.send(JSON.stringify({ "type": "doMatch" })), 500)
                break;
        }
    })

    ws.addEventListener("close", function () {
        console.log("closed")
    })
}

nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = nameInput.value.trim();
    if (!v) return;
    myName = v;
    nameQueued = myName;
    localStorage.setItem("name", myName)
    nameModal.classList.remove("show");

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connect();
    } else {
        ws.send(JSON.stringify({ type: "set_name", name: myName }));
        nameQueued = null;
    }
});

// Send message
inputBar.addEventListener("submit", (e) => {
    e.preventDefault();
    const txt = msgInput.value.trim();
    if (!txt || !ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type: "chat", text: txt }));
    addMsg(myName || "Me", txt, true);
    msgInput.value = "";
    msgInput.focus();
});

// Skip partner
skipBtn.addEventListener("click", () => {
    if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type: "skip" }));
    setUIWaiting();
});


function updateOnlineCount() {
    fetch("/online")
        .then(res => res.text())
        .then(count => {
            document.getElementById("onlineCount").textContent = count;
        })
        .catch(err => {
            console.error("Error fetching online count:", err);
        });
}

// Update immediately and every 5 seconds
updateOnlineCount();
setInterval(updateOnlineCount, 5000);


setUIDisabled()