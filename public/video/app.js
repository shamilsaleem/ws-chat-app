// --- State ---
let ws = null;
let pc = null;
let localStream;
let screenStream;
let myName = null;

const statusEl = document.getElementById("status");
const skipBtn = document.getElementById("skipBtn");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const chatArea = document.getElementById("chatArea");
const connecting = document.getElementById("connecting");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const toggleMicBtn = document.getElementById("toggleMic");
const toggleCamBtn = document.getElementById("toggleCam");
const shareScreenBtn = document.getElementById("shareScreen");


const userName = localStorage.getItem("name");
if (!userName) {
  window.location.href = "/";
} else {
  myName = userName
}


// ---- Helpers ----
function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function addMsg(sender, text, isMe) {
  const div = document.createElement("div");
  div.className = "msg" + (isMe ? " me" : "");
  div.innerHTML = `<span class="sender">${escapeHtml(sender)}</span>${escapeHtml(text)}`;
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

// ---- UI states ----
function setUIDisabled() {
  msgInput.disabled = true;
  sendBtn.disabled = true;
  skipBtn.disabled = true;
  connecting.classList.add("show");
}

function setUIWaiting() {
  statusEl.textContent = "Connecting to a random user…";
  msgInput.disabled = false; // keep focusable
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
  setTimeout(() => msgInput.focus(), 50); // focus fix
}

// ---- Media ----
async function getMedia() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { aspectRatio: 4 / 3, width: { ideal: 960 } }
    });
    localVideo.srcObject = localStream;
    return localStream;
  } catch (err) {
    console.error("getUserMedia failed:", err);
    systemLine("Could not access camera/microphone. Check permissions.");
    throw err;
  }
}

async function toggleMic() {
  if (!localStream) return;
  const tracks = localStream.getAudioTracks();
  if (tracks.length) {
    tracks[0].enabled = !tracks[0].enabled;
    toggleMicBtn.classList.toggle("active", tracks[0].enabled);
    toggleMicBtn.textContent = tracks[0].enabled ? "Mic" : "Mic Off";
  }
}
async function toggleCam() {
  if (!localStream) return;
  const tracks = localStream.getVideoTracks();
  if (tracks.length) {
    tracks[0].enabled = !tracks[0].enabled;
    toggleCamBtn.classList.toggle("active", tracks[0].enabled);
    toggleCamBtn.textContent = tracks[0].enabled ? "Cam" : "Cam Off";
  }
}
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    // Replace the outbound video sender with screen
    const sender = pc?.getSenders().find(s => s.track && s.track.kind === "video");
    if (sender) sender.replaceTrack(screenTrack);
    // Preview local as screen
    localVideo.srcObject = screenStream;

    screenTrack.onended = async () => {
      // revert back to camera
      const camTrack = localStream.getVideoTracks()[0];
      if (sender && camTrack) sender.replaceTrack(camTrack);
      localVideo.srcObject = localStream;
    };
  } catch (e) {
    window.alert("Share screen cancelled" + e)
  }
}

// ---- WebRTC ----
function createPeerConnection() {
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      wsSend({ type: "ice", candidate: e.candidate });
    }
  };
  pc.ontrack = (e) => {
    // Attach the first stream
    if (remoteVideo.srcObject !== e.streams[0]) {
      remoteVideo.srcObject = e.streams[0];
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      systemLine("Connection failed. Trying to reconnect…");
    }
  };
  return
}

async function startCallIfPolite() {
  // Caller creates the offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  wsSend({ type: "sdp", description: pc.localDescription });
}

async function handleRemoteSDP(desc) {
  const remoteDesc = new RTCSessionDescription(desc);
  await pc.setRemoteDescription(remoteDesc);
  if (remoteDesc.type === "offer") {
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsSend({ type: "sdp", description: pc.localDescription });
  }
}

async function addLocalTracks() {
  if (!localStream) {
    await getMedia();
  }
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
}

// ---- Signaling WebSocket ----
function wsConnect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.addEventListener("open", () => {
    statusEl.textContent = "Connected. Setting up…";
  });

  ws.addEventListener("message", async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.type) {
      case "pong":
        if (myName) setTimeout(() => wsSend({ type: "set_name", name: myName, video: true }), 1000)
        break;
      case "waiting":
        setTimeout(() => ws.send(JSON.stringify({ "type": "doMatch" })), 500)
        setUIWaiting();
        break;
      case "matched":
        setUIPaired(msg.data.partnerName || "Stranger");
        systemLine(`You're now chatting with ${msg.data.partnerName || "a stranger"}.`);
        await createPeerConnection();
        await addLocalTracks();
        if (msg.data.start) await startCallIfPolite()
        break;
      case "chat":
        addMsg(msg.data.from || "Stranger", msg.data.text || "", false);
        break;
      case "partner_left":
        systemLine(`${msg.data.partnerName || "Stranger"} left the chat.`);
        setUIWaiting();
        cleanupPeer()
        setTimeout(() => ws.send(JSON.stringify({ "type": "doMatch" })), 500)
        break;
      case "left_your_partner":
        systemLine(`You skipped ${msg.data.partnerName || "Stranger"}.`);
        setUIWaiting();
        cleanupPeer()
        setTimeout(() => ws.send(JSON.stringify({ "type": "doMatch" })), 700)
        break;
      case "sdp":
        await handleRemoteSDP(msg.data.description);
        break;
      case "ice":
        try { await pc.addIceCandidate(msg.data.candidate); } catch (e) { console.warn(e); }
        break;
    }
  });

  ws.addEventListener("close", () => {
    cleanupPeer()
  });

  ws.addEventListener("error", () => {
    statusEl.textContent = "Connection error. Reconnecting…";
    wsConnect()
  });
}

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ---- Cleanup ----
function cleanupPeer() {
  if (pc) {
    try { pc.close(); } catch { }
  }
  pc = null;
  remoteVideo.srcObject = null;
}


document.getElementById("inputBar").addEventListener("submit", (e) => {
  e.preventDefault();
  const txt = msgInput.value.trim();
  if (!txt || !ws || ws.readyState !== ws.OPEN) return;
  wsSend({ type: "chat", text: txt });
  addMsg(myName || "Me", txt, true);
  msgInput.value = "";
  msgInput.focus();
});

skipBtn.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  wsSend({ type: "skip" });
  setUIWaiting();
});

toggleMicBtn.addEventListener("click", toggleMic);
toggleCamBtn.addEventListener("click", toggleCam);
shareScreenBtn.addEventListener("click", startScreenShare);

// Online count polling fallback (if server doesn't push 'online')
function updateOnlineCount() {
  fetch("/online").then(r => r.text()).then(n => {
    const el = document.getElementById("onlineCount");
    if (el) el.textContent = n;
  }).catch(() => { });
}
updateOnlineCount();
setInterval(updateOnlineCount, 5000);

// Initial UI
setUIDisabled();


window.onload = async () => {
  if (ws) ws.close();
  try { await getMedia(); } catch { window.alert("Allow camera and mic to continue."); return }
  wsConnect();
}
window.onclose = () => ws.close()
