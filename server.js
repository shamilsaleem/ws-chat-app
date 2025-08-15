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

const clients = new Map()
var waitingQueue = []

function pair(aId, bId) {
    const a = clients.get(aId);
    const b = clients.get(bId);
    if (!a || !b) return;

    a.partnerId = bId;
    b.partnerId = aId;
    send(clients.get(aId).ws, "matched")
    send(clients.get(bId).ws, "matched")
}

function doMatch(clientId) {
    if(clients.get(clientId).partnerId !== null){
        return
    }
    if (waitingQueue.length === 0) {
        waitingQueue.push(clientId)
        send(clients.get(clientId).ws, "waiting", {})
        
    }
    else {
        if (waitingQueue[0] !== clientId) {
            pair(waitingQueue[0], clientId)
            waitingQueue.shift()
        } else {
            send(clients.get(clientId).ws, "waiting", {})
        }
    }
}

wss.on("connection", function (ws) {
    const clientId = Date.now() + Math.random();
    clients.set(clientId, { ws, name: null, partnerId: null, alive: true })
    doMatch(clientId)

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
                break
        }
    })


    ws.on("close", function () {
        if(clients.get(clientId).partnerId){
            clients.get(clients.get(clientId).partnerId).partnerId = null
            send(clients.get(clients.get(clientId).partnerId).ws, "waiting", {})
        }
        clients.delete(clientId)
    })
})

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running → http://localhost:${PORT}`);
});