let ws = null;
let myName = null;

const statusEl = document.getElementById("status");
const skipBtn = document.getElementById("skipBtn");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const chatArea = document.getElementById("chatArea");
const connecting = document.getElementById("connecting");
const inputBar = document.getElementById("inputBar");

const userName = localStorage.getItem("name");
if (!userName) {
    window.location.href = "/";
} else {
    myName = userName
}


function setUIDisabled() {
    msgInput.disabled = true;
    sendBtn.disabled = true;
    skipBtn.disabled = true;
    connecting.classList.add("show");
}

function setUIWaiting() {
    statusEl.textContent = "Connecting to a random user…";
    msgInput.disabled = true;
    sendBtn.disabled = true;
    skipBtn.disabled = true;
    connecting.classList.add("show");
}

function setUIPaired(partnerName) {
    statusEl.textContent = `Chatting with ${partnerName}`;
    msgInput.disabled = false;
    sendBtn.disabled = false;
    skipBtn.disabled = false;
    connecting.classList.remove("show");
}

function addMsg(sender, text, isMe) {
    var typ = document.getElementById("typing")
    if (typ !== null) chatArea.removeChild(typ)
    const div = document.createElement("div");
    div.className = "msg" + (isMe ? " me" : "");
    div.innerHTML = `<span class="sender">${sender}</span>${escapeHtml(text)}`;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function typing(isTyping) {
    var div = document.getElementById("typing")
    if (div === null && isTyping) {
        var div = document.createElement("div");
        div.className = "typing"
        div.id = "typing"
        div.innerHTML = "<i>typing...</i>"
        chatArea.appendChild(div)
    } else if (div !== null) {
        chatArea.removeChild(div)
    }
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

    ws.addEventListener("open", () => { })

    ws.addEventListener("message", function (ev) {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
            case "pong":
                if (myName) setTimeout(() => ws.send(JSON.stringify({ type: "set_name", name: myName })), 1000)
                break;
            case "waiting":
                setTimeout(() => ws.send(JSON.stringify({ "type": "doMatch" })), 500)
                setUIWaiting();
                break;
            case "matched":
                setUIPaired(msg.data.partnerName || "Stranger");
                systemLine(`You're now chatting with ${msg.data.partnerName || "a stranger"}.`);
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
            case "typing_started":
                typing(true)
                break;
            case "typing_end":
                typing(false)
                break;
        }
    })

    ws.addEventListener("close", () => { })
}

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

let isTyping = false;
let typingTimer;
const typingDelay = 1000;

msgInput.addEventListener("input", () => {
    if (!isTyping) {
        isTyping = true
        ws.send(JSON.stringify({ type: "typing_started" }))
    }

    clearTimeout(typingTimer)
    typingTimer = setTimeout(() => {
        isTyping = false
        ws.send(JSON.stringify({ type: "typing_end" }))
    }, typingDelay)
})



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
window.onload = async () => {
    if (ws) ws.close();
    connect()
}
window.onclose = () => ws.close()