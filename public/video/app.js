// --- State ---
let ws;
let pc;
let localStream;
let screenStream;
let myName = null;
let isPaired = false;
let nameQueued = null;

const statusEl   = document.getElementById("status");
const skipBtn    = document.getElementById("skipBtn");
const msgInput   = document.getElementById("msgInput");
const sendBtn    = document.getElementById("sendBtn");
const chatArea   = document.getElementById("chatArea");
const connecting = document.getElementById("connecting");

const localVideo  = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const toggleMicBtn   = document.getElementById("toggleMic");
const toggleCamBtn   = document.getElementById("toggleCam");
const shareScreenBtn = document.getElementById("shareScreen");

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
      video: { aspectRatio: 4/3, width: { ideal: 960 } }
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
    console.log("Screen share cancelled", e);
  }
}

// ---- WebRTC ----
function createPeerConnection() {
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478?transport=udp" }
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
  const stream = await getMedia();
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
}

// ---- Signaling WebSocket ----
function wsConnect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener("open", () => {
    statusEl.textContent = "Connected. Setting up…";
    if (myName) wsSend({ type: "set_name", name: myName });
  });

  ws.addEventListener("message", async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.type) {
      case "waiting":
        isPaired = false;
        setUIWaiting();
        break;

      case "paired": {
        isPaired = true;
        setUIPaired(msg.partnerName || "Stranger");
        systemLine(`You're now chatting with ${msg.partnerName || "a stranger"}.`);

        // Prepare WebRTC
        createPeerConnection();
        await addLocalTracks();

        // Decide who starts: simple heuristic — user with lexicographically smaller name acts as caller
        // (You can change to a server "role": "caller"/"callee")
        const startCaller = !!msg.startCaller; // if server provides, use it
        if (typeof msg.startCaller === "undefined") {
          // fallback deterministic: shorter name starts
          const me = (myName || "").toLowerCase();
          const them = (msg.partnerName || "").toLowerCase();
          if (me && them) {
            if (me.length <= them.length) await startCallIfPolite();
          } else {
            // default to starting
            await startCallIfPolite();
          }
        } else if (startCaller) {
          await startCallIfPolite();
        }
        break;
      }

      case "partner_left":
        isPaired = false;
        systemLine("Your partner left. Finding someone new…");
        setUIWaiting();
        cleanupPeer();
        break;

      case "chat":
        addMsg(msg.from || "Stranger", msg.text || "", false);
        break;

      case "sdp":
        if (!pc) { createPeerConnection(); await addLocalTracks(); }
        await handleRemoteSDP(msg.description);
        break;

      case "ice":
        if (pc && msg.candidate) {
          try { await pc.addIceCandidate(msg.candidate); } catch (e) { console.warn(e); }
        }
        break;

      case "ping":
        wsSend({ type: "ping" });
        break;

      case "online":
        // optional live online count
        const n = document.getElementById("onlineCount");
        if (n) n.textContent = msg.count ?? n.textContent;
        break;
    }
  });

  ws.addEventListener("close", () => {
    isPaired = false;
    statusEl.textContent = "Disconnected. Reconnecting…";
    setUIDisabled();
    setTimeout(wsConnect, 800);
  });

  ws.addEventListener("error", () => {
    statusEl.textContent = "Connection error. Reconnecting…";
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
    try { pc.getSenders().forEach(s => s.track && s.track.stop()); } catch {}
    try { pc.close(); } catch {}
  }
  pc = null;

  // Keep local preview running for UI continuity; remove remote
  remoteVideo.srcObject = null;
}

document.getElementById("inputBar").addEventListener("submit", (e) => {
  e.preventDefault();
  const txt = msgInput.value.trim();
  if (!txt || !ws || ws.readyState !== WebSocket.OPEN || !isPaired) return;
  wsSend({ type: "chat", text: txt });
  addMsg(myName || "Me", txt, true);
  msgInput.value = "";
});

skipBtn.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  wsSend({ type: "skip" });
  isPaired = false;
  setUIWaiting();
  cleanupPeer();
});

toggleMicBtn.addEventListener("click", toggleMic);
toggleCamBtn.addEventListener("click", toggleCam);
shareScreenBtn.addEventListener("click", startScreenShare);

// Online count polling fallback (if server doesn't push 'online')
function updateOnlineCount() {
  fetch("/online").then(r => r.text()).then(n => {
    const el = document.getElementById("onlineCount");
    if (el) el.textContent = n;
  }).catch(()=>{});
}
updateOnlineCount();
setInterval(updateOnlineCount, 5000);

// Initial UI
setUIDisabled();
wsConnect()
getMedia()
