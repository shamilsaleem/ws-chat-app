const userName = localStorage.getItem("name");
if (userName) {
    nameInput.value = userName;
}

var videoChat = () => {
    const myName = nameInput.value.trim();
    if (!myName) return;
    localStorage.setItem("name", myName)
    window.location.href = "/video"
}

var textChat = () => {
    const myName = nameInput.value.trim();
    if (!myName) return;
    localStorage.setItem("name", myName)
    window.location.href = "/chat"
}

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
