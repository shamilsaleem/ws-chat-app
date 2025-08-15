const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "public")));

const wss = new WebSocket.Server({ server })

function send(ws, type, payload = {}) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type, ...payload }));
    }
}

wss.on("connection", function (ws) {
    ws.on("message", (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
            
        } catch {
            return;
        }
        console.log(msg)
    })
    send(ws, "Hello")
})

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running → http://localhost:${PORT}`);
});