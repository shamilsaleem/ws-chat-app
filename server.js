const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "public")));

const wss = new WebSocket.Server({ server })

function send(ws, type, data = {}) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type, data }));
    }
}

const clientsText = new Map()
const clientsVideo = new Map()
var waitingQueueText = []
var waitingQueueVideo = []


app.get('/online', (req, res) => res.send(clientsText.size + clientsVideo.size))



function pair(aId, bId, isVideo) {
    var a, b
    if (isVideo) {
        a = clientsVideo.get(aId);
        b = clientsVideo.get(bId);
        if (!a || !b) return;
    } else {
        a = clientsText.get(aId);
        b = clientsText.get(bId);

    }
    if (!a || !b) return;
    a.partnerId = bId;
    b.partnerId = aId;
    send(a.ws, "matched", { "partnerName": b.name })
    send(b.ws, "matched", { "partnerName": a.name })
}

function skip(clientId, isVideo) {
    var a, b, partnerId
    if (isVideo) {
        partnerId = clientsVideo.get(clientId).partnerId
        b = clientsVideo.get(partnerId);
        a = clientsVideo.get(clientId);
    } else {
        partnerId = clientsText.get(clientId).partnerId
        b = clientsText.get(partnerId);
        a = clientsText.get(clientId);
    }

    b.partnerId = null;
    a.partnerId = null;

    send(b.ws, "partner_left", { "partnerName": a.name })
    send(a.ws, "left_your_partner", { "partnerName": b.name })
}

function doMatch(clientId, isVideo) {
    if (isVideo) {
        if (clientsVideo.get(clientId).partnerId !== null) {
            return
        }
        else if (waitingQueueVideo.length === 0) {
            waitingQueueVideo.push(clientId)
            send(clientsVideo.get(clientId).ws, "waiting", {})
            return
        } else {
            if (clientsVideo.get(clientId).partnerId === null && waitingQueueVideo[0] !== clientId) {
                pair(waitingQueueVideo[0], clientId, true)
                waitingQueueVideo.shift()
                return
            } else {
                return
            }
        }
    } else {
        if (clientsText.get(clientId).partnerId !== null) {
            return
        }
        else if (waitingQueueText.length === 0) {
            waitingQueueText.push(clientId)
            send(clientsText.get(clientId).ws, "waiting", {})
            return
        } else {
            if (clientsText.get(clientId).partnerId === null && waitingQueueText[0] !== clientId) {
                pair(waitingQueueText[0], clientId, false)
                waitingQueueText.shift()
                return
            } else {
                return
            }
        }
    }
}

wss.on("connection", function (ws) {
    var clientId = Date.now() + Math.random()
    var isVideo = false
    ws.on("message", (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());

        } catch {
            return;
        }

        switch (msg.type) {
            case "doMatch":
                doMatch(clientId)
                break;
            case "chat":
                if (isVideo) {
                    send(clientsVideo.get(clientsVideo.get(clientId).partnerId).ws, "chat", { "text": msg.text, "from": clientsVideo.get(clientId).name })
                } else {
                    send(clientsText.get(clientsText.get(clientId).partnerId).ws, "chat", { "text": msg.text, "from": clientsText.get(clientId).name })
                }
                break;
            case "skip":
                skip(clientId, isVideo)
                break;
            case "set_name":
                if (msg.video) {
                    clientsVideo.set(clientId, { ws, name: msg.name, partnerId: null })
                    isVideo = true
                    doMatch(clientId, true)
                } else {
                    clientsText.set(clientId, { ws, name: msg.name, partnerId: null })
                    doMatch(clientId, false)
                }
                break;

        }
    })


    ws.on("close", function (mm) {
        if (isVideo) {
            if (clientsVideo.get(clientId).partnerId) {
                clientsVideo.get(clientsVideo.get(clientId).partnerId).partnerId = null
                send(clientsVideo.get(clientsVideo.get(clientId).partnerId).ws, "partner_left", { "partnerName": clientsVideo.get(clientId).name })
            }
            clientsVideo.delete(clientId)
        } else {
            if (clientsText.get(clientId).partnerId) {
                clientsText.get(clientsText.get(clientId).partnerId).partnerId = null
                send(clientsText.get(clientsText.get(clientId).partnerId).ws, "partner_left", { "partnerName": clientsText.get(clientId).name })
            }
            clientsText.delete(clientId)
        }
    })
})

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running → http://localhost:${PORT}`);
});