/* Lupin Calls — WebRTC client.
 * Configure SIGNALING_URL after deploying workers/worker.js.
 */
const SIGNALING_URL = "wss://lupin-calls-signaling.lujinsg.workers.dev/ws";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const $ = (id) => document.getElementById(id);
const state = { stream: null, previewStream: null, socket: null, room: "", name: "", id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2), peers: new Map(), pendingCandidates: new Map(), cameraOn: true, micOn: true, screenStream: null, screenTrack: null, joined: false, closing: false };

$("year").textContent = new Date().getFullYear();
let callsCloudUser = window.LUPIN_AUTH?.current() || "";
$("displayName").value = callsCloudUser || localStorage.getItem("lupinCallsName") || "";
window.addEventListener("lupin-auth-change", event => {
  const nextUser = event.detail?.user?.username || "";
  if (nextUser) {
    callsCloudUser = nextUser;
    $("displayName").value = nextUser;
    localStorage.setItem("lupinCallsName", nextUser);
    if (!state.joined) setConnection("Lupin Cloud · " + nextUser);
  } else if (callsCloudUser) {
    if ($("displayName").value === callsCloudUser) {
      $("displayName").value = "";
      localStorage.removeItem("lupinCallsName");
    }
    callsCloudUser = "";
    if (!state.joined) setConnection("Ready when you are");
  }
});
$("roomCode").addEventListener("input", () => { $("roomCode").value = $("roomCode").value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12); });
$("displayName").addEventListener("input", () => localStorage.setItem("lupinCallsName", $("displayName").value.trim().slice(0, 32)));
$("createRoom").addEventListener("click", () => enterRoom(makeRoomCode()));
$("joinRoom").addEventListener("click", () => {
  const code = $("roomCode").value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,12}$/.test(code)) return lobbyMessage("Enter a room code between 4 and 12 letters or numbers.");
  enterRoom(code);
});
$("roomCode").addEventListener("keydown", e => { if (e.key === "Enter") $("joinRoom").click(); });
$("previewToggle").addEventListener("click", togglePreview);
$("micButton").addEventListener("click", toggleMic);
$("cameraButton").addEventListener("click", toggleCamera);
$("screenButton").addEventListener("click", toggleScreenShare);
$("leaveButton").addEventListener("click", leaveRoom);
$("copyRoom").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(state.room); $("copyRoom").textContent = "Copied!"; }
  catch { $("copyRoom").textContent = state.room; }
  setTimeout(() => $("copyRoom").textContent = "Copy", 1500);
});

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
function lobbyMessage(text) { $("lobbyMessage").textContent = text || ""; }
function setConnection(text) { $("connectionLabel").textContent = text; }
function safeName() {
  const value = $("displayName").value.trim().replace(/[<>]/g, "").slice(0, 32);
  return value || "Guest";
}
async function togglePreview() {
  if (state.previewStream) {
    state.previewStream.getTracks().forEach(track => track.stop());
    state.previewStream = null;
    $("previewVideo").srcObject = null;
    $("previewWrap").classList.remove("preview-on");
    $("previewToggle").textContent = "◉";
    $("previewToggle").setAttribute("aria-label", "Enable camera preview");
    return;
  }
  try {
    state.previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    $("previewVideo").srcObject = state.previewStream;
    $("previewWrap").classList.add("preview-on");
    $("previewToggle").textContent = "◌";
    $("previewToggle").setAttribute("aria-label", "Turn off camera preview");
  } catch {
    lobbyMessage("Camera access was blocked or no camera is available. You can still join with your camera off.");
  }
}
async function enterRoom(room) {
  if (state.joined) return;
  state.name = safeName();
  state.room = room;
  localStorage.setItem("lupinCallsName", state.name);
  $("createRoom").disabled = $("joinRoom").disabled = true;
  lobbyMessage("");
  setConnection("Preparing your call…");
  try {
    // Ask for devices at the moment the user joins, not on page load.
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (state.previewStream) state.previewStream.getTracks().forEach(t => t.stop());
    state.previewStream = null;
    state.stream = stream;
    state.cameraOn = true;
    state.micOn = true;
  } catch (error) {
    if (state.previewStream) {
      state.previewStream.getTracks().forEach(t => t.stop());
      state.previewStream = null;
    }
    // A camera or microphone denial should not prevent joining as a listener.
    try { state.stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); state.cameraOn = false; state.micOn = true; }
    catch {
      state.stream = new MediaStream();
      state.cameraOn = false;
      state.micOn = false;
    }
    if (error && error.name === "NotAllowedError") lobbyMessage("Device permission was not granted. You can join without camera or microphone.");
  }
  state.joined = true;
  $("localVideo").srcObject = state.stream;
  $("localVideo").style.display = state.cameraOn ? "block" : "none";
  $("localPlaceholder").style.display = state.cameraOn ? "none" : "flex";
  $("localName").textContent = state.name;
  $("activeRoomCode").textContent = room;
  $("callTitle").textContent = "You're connected";
  $("callSubtitle").textContent = "Share the room code to invite someone.";
  $("lobby").classList.add("hidden");
  $("call").classList.remove("hidden");
  document.title = room + " · Lupin Calls";
  updateControlButtons();
  connectSignaling();
}
function connectSignaling() {
  let url;
  try {
    url = new URL(SIGNALING_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : url.protocol === "http:" ? "ws:" : url.protocol;
    url.searchParams.set("room", state.room);
    url.searchParams.set("id", state.id);
    url.searchParams.set("name", state.name);
  } catch {
    callStatus("The signalling URL is not configured.");
    return;
  }
  callStatus("Connecting to room…");
  try { state.socket = new WebSocket(url); }
  catch { callStatus("Could not start the room connection."); return; }
  state.socket.addEventListener("open", () => {
    if (!state.joined) return;
    setConnection("Connected to room");
    callStatus("Room connected. Waiting for people…");
  });
  state.socket.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    handleSignal(message).catch(error => console.error("Lupin Calls signalling:", error));
  });
  state.socket.addEventListener("error", () => callStatus("Signalling connection failed. Check the Worker URL and deployment."));
  state.socket.addEventListener("close", () => {
    if (state.joined && !state.closing) { callStatus("Room connection lost. Refresh to reconnect."); setConnection("Connection lost"); }
  });
}
function sendSignal(message) {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message));
}
async function handleSignal(message) {
  if (message.type === "room-state") {
    for (const peer of message.peers || []) await makeOffer(peer.id, peer.name);
    return;
  }
  if (message.type === "peer-joined") {
    updateParticipantCount();
    return;
  }
  if (message.type === "peer-left") {
    removePeer(message.id);
    updateParticipantCount();
    return;
  }
  if (message.type === "offer") {
    const peer = getPeer(message.from, message.name);
    await peer.pc.setRemoteDescription(new RTCSessionDescription(message.description));
    await flushIce(peer);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    sendSignal({ type: "answer", to: message.from, description: peer.pc.localDescription });
    return;
  }
  if (message.type === "answer") {
    const peer = state.peers.get(message.from);
    if (!peer) return;
    await peer.pc.setRemoteDescription(new RTCSessionDescription(message.description));
    await flushIce(peer);
    return;
  }
  if (message.type === "ice") {
    if (!message.candidate) return;
    const peer = state.peers.get(message.from);
    if (!peer) {
      const queue = state.pendingCandidates.get(message.from) || [];
      queue.push(message.candidate);
      state.pendingCandidates.set(message.from, queue);
      return;
    }
    if (peer.pc.remoteDescription) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(message.candidate)); } catch (e) { console.warn("ICE candidate skipped", e); }
    } else peer.pendingIce.push(message.candidate);
  }
}
async function makeOffer(id, name) {
  const peer = getPeer(id, name);
  if (peer.offering || peer.pc.signalingState !== "stable") return;
  peer.offering = true;
  try {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    sendSignal({ type: "offer", to: id, description: peer.pc.localDescription });
  } finally { peer.offering = false; }
}
function getPeer(id, name) {
  if (state.peers.has(id)) {
    const found = state.peers.get(id);
    if (name) { found.name = name; const label = found.tile.querySelector(".peer-name"); if (label) label.textContent = name; }
    return found;
  }
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const tile = document.createElement("article");
  tile.className = "video-tile";
  const video = document.createElement("video");
  video.autoplay = true; video.playsInline = true;
  const placeholder = document.createElement("div");
  placeholder.className = "video-placeholder";
  const avatar = document.createElement("span"); avatar.className = "avatar-placeholder"; avatar.textContent = (name || "G").slice(0, 1).toUpperCase();
  const placeholderText = document.createElement("span"); placeholderText.textContent = "Camera is off";
  placeholder.append(avatar, placeholderText);
  const caption = document.createElement("div"); caption.className = "tile-caption";
  const dot = document.createElement("span"); dot.className = "audio-indicator"; dot.textContent = "●";
  const nameLabel = document.createElement("span"); nameLabel.className = "peer-name"; nameLabel.textContent = name || "Guest";
  caption.append(dot, nameLabel);
  tile.append(video, placeholder, caption);
  $("videoGrid").append(tile);
  const peer = { id, name: name || "Guest", pc, tile, video, placeholder, pendingIce: state.pendingCandidates.get(id) || [], offering: false };
  state.pendingCandidates.delete(id);
  state.peers.set(id, peer);
  if (state.stream) state.stream.getTracks().forEach(track => pc.addTrack(track, state.stream));
  pc.onicecandidate = event => { if (event.candidate) sendSignal({ type: "ice", to: id, candidate: event.candidate }); };
  pc.ontrack = event => {
    if (!video.srcObject) video.srcObject = event.streams[0];
    video.style.display = "block"; placeholder.style.display = "none";
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      if (pc.connectionState === "failed") callStatus("A peer connection failed. This network may need a TURN relay.");
    }
  };
  updateParticipantCount();
  return peer;
}
async function flushIce(peer) {
  for (const candidate of peer.pendingIce.splice(0)) {
    try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn("Queued ICE candidate skipped", e); }
  }
}
function removePeer(id) {
  const peer = state.peers.get(id);
  if (!peer) return;
  peer.pc.close();
  peer.tile.remove();
  state.peers.delete(id);
}
function updateParticipantCount() {
  const count = state.peers.size + 1;
  $("callSubtitle").textContent = count === 1 ? "You're the first one here. Invite someone with the room code." : count + " people in this call.";
  callStatus(count === 1 ? "Room connected. Waiting for people…" : count + " participants connected");
}
function callStatus(text) { $("callStatus").textContent = text; }
function updateControlButtons() {
  $("micButton").setAttribute("aria-pressed", String(state.micOn));
  $("micButton").querySelector("span:last-child").textContent = state.micOn ? "Mute" : "Unmute";
  $("micButton").classList.toggle("control-muted", !state.micOn);
  $("cameraButton").setAttribute("aria-pressed", String(state.cameraOn));
  $("cameraButton").querySelector("span:last-child").textContent = state.cameraOn ? "Camera" : "Camera off";
  $("screenButton").setAttribute("aria-pressed", String(!!state.screenStream));
}
function toggleMic() {
  state.micOn = !state.micOn;
  state.stream?.getAudioTracks().forEach(track => track.enabled = state.micOn);
  updateControlButtons();
}
function toggleCamera() {
  state.cameraOn = !state.cameraOn;
  state.stream?.getVideoTracks().forEach(track => track.enabled = state.cameraOn);
  $("localVideo").style.display = state.cameraOn ? "block" : "none";
  $("localPlaceholder").style.display = state.cameraOn ? "none" : "flex";
  updateControlButtons();
}
async function toggleScreenShare() {
  if (state.screenStream) { stopScreenShare(); return; }
  if (!navigator.mediaDevices.getDisplayMedia) { callStatus("Screen sharing is not supported by this browser."); return; }
  try {
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    state.screenTrack = state.screenStream.getVideoTracks()[0];
    for (const peer of state.peers.values()) {
      const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === "video");
      if (sender) await sender.replaceTrack(state.screenTrack);
    }
    $("localVideo").srcObject = state.screenStream;
    $("localVideo").style.transform = "none";
    $("localVideo").style.display = "block";
    $("localPlaceholder").style.display = "none";
    $("screenButton").setAttribute("aria-pressed", "true");
    state.screenTrack.addEventListener("ended", stopScreenShare, { once: true });
    callStatus("You're sharing your screen.");
  } catch (error) {
    if (error.name !== "NotAllowedError") callStatus("Could not start screen sharing.");
  }
}
async function stopScreenShare() {
  if (!state.screenStream) return;
  state.screenStream.getTracks().forEach(track => track.stop());
  state.screenStream = null; state.screenTrack = null;
  for (const peer of state.peers.values()) {
    const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === "video");
    const cameraTrack = state.stream?.getVideoTracks()[0];
    if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
  }
  $("localVideo").srcObject = state.stream;
  $("localVideo").style.transform = "scaleX(-1)";
  $("localVideo").style.display = state.cameraOn ? "block" : "none";
  $("localPlaceholder").style.display = state.cameraOn ? "none" : "flex";
  $("screenButton").setAttribute("aria-pressed", "false");
  callStatus("Screen sharing stopped.");
}
function leaveRoom() {
  state.closing = true;
  if (state.socket) {
    try { state.socket.send(JSON.stringify({ type: "leave" })); } catch {}
    state.socket.close();
    state.socket = null;
  }
  for (const id of [...state.peers.keys()]) removePeer(id);
  if (state.screenStream) state.screenStream.getTracks().forEach(t => t.stop());
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());
  if (state.previewStream) state.previewStream.getTracks().forEach(t => t.stop());
  state.stream = state.previewStream = state.screenStream = null;
  state.joined = false; state.closing = false; state.room = "";
  $("localVideo").srcObject = null;
  $("lobby").classList.remove("hidden");
  $("call").classList.add("hidden");
  $("videoGrid").querySelectorAll(".video-tile:not(#localTile)").forEach(tile => tile.remove());
  $("createRoom").disabled = $("joinRoom").disabled = false;
  $("roomCode").value = "";
  $("previewWrap").classList.remove("preview-on");
  $("previewVideo").srcObject = null;
  $("previewToggle").textContent = "◉";
  document.title = "Lupin Calls";
  setConnection("Ready when you are");
  lobbyMessage("");
}
window.addEventListener("beforeunload", () => {
  try { state.socket?.close(); } catch {}
  state.stream?.getTracks().forEach(t => t.stop());
  state.screenStream?.getTracks().forEach(t => t.stop());
});
