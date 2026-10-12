// CHAT POR WEBSOCKET
//
// El resto de la aplicación usa fetch: el navegador pregunta y el servidor
// contesta. Aquí la conexión se queda ABIERTA en los dos sentidos, así que el
// servidor puede mandar un mensaje sin que nadie se lo haya pedido. Por eso lo
// que escribe otra persona aparece al instante, sin recargar ni preguntar cada
// pocos segundos.
//
// No hay que identificarse: el servidor sabe quién es cada uno por la sesión.
// Por la misma conexión llega el aviso de que el catálogo cambió.

import { currentUser, escapeHtml, t, tn } from "./core.js";

const CLOSE_LOGIN_REQUIRED = 4401;  // el servidor cerró porque no hay sesión

const messagesList = document.getElementById("chat-messages");
const sendForm = document.getElementById("chat-send-form");
const input = document.getElementById("chat-text");
const sendButton = sendForm.querySelector("button");
const presence = document.getElementById("chat-presence");
const presenceText = document.getElementById("chat-presence-text");
const errorLine = document.getElementById("chat-error");

let socket = null;
let lastPresence = null;
let onCatalogChange = () => {};
const me = currentUser();

// Mensajes de otros que llegaron sin el chat a la vista (en el móvil).
const jump = document.getElementById("chat-jump");
const unreadBadge = document.getElementById("chat-unread");
let chatInView = true;
let unread = 0;

function renderUnread() {
  unreadBadge.textContent = unread;
  unreadBadge.hidden = unread === 0;
}

new IntersectionObserver(([entry]) => {
  chatInView = entry.isIntersecting;
  jump.classList.toggle("away", !chatInView);
  if (chatInView) {
    unread = 0;
    renderUnread();
  }
}, { threshold: 0.2 }).observe(document.getElementById("chat"));

function showError(text) {
  errorLine.textContent = text;
  errorLine.hidden = false;
}

function setConnected(connected) {
  input.disabled = !connected;
  sendButton.disabled = !connected;
}

/** Quién está al otro lado. Al bibliotecario le importa cuántos lectores
 *  hay; al lector, si el bibliotecario está para contestarle. */
function renderPresence(data) {
  lastPresence = data;
  let online;
  let text;
  if (me.role === "librarian") {
    online = data.readers > 0;
    text = tn("chat.readers_online", data.readers, { count: data.readers });
  } else {
    online = data.librarians > 0;
    text = t(online ? "chat.librarian_online" : "chat.librarian_offline");
  }
  presence.className = "presence " + (online ? "online" : "");
  presenceText.textContent = text;
}

function renderStatus(key, kind) {
  presence.className = "presence " + kind;
  presenceText.textContent = t(key);
}

function emptyState() {
  const key = me.role === "librarian" ? "chat.empty_librarian" : "chat.empty_reader";
  messagesList.innerHTML = `<li class="chat-empty">${t(key)}</li>`;
}

function renderMessage(message) {
  messagesList.querySelector(".chat-empty")?.remove();
  const own = message.username === me.username;
  const staff = message.role === "librarian";
  const item = document.createElement("li");
  item.className = "chat-message" + (own ? " own" : "") + (staff ? " staff" : "");
  item.innerHTML = `
    <span class="avatar" style="background:${escapeHtml(message.color)}">${escapeHtml(message.initial)}</span>
    <div class="bubble">
      <p class="author">${escapeHtml(message.nickname)}${own ? ` (${t("chat.you")})` : ""}
        <span class="time">${escapeHtml(message.at)}</span></p>
      <p class="text">${escapeHtml(message.text)}</p>
    </div>`;
  messagesList.appendChild(item);
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Un manejador por cada tipo de mensaje que envía el servidor.
const HANDLERS = {
  welcome(data) {
    emptyState();
    data.history.forEach(renderMessage);
    renderPresence(data);
  },
  presence: renderPresence,
  message(data) {
    renderMessage(data.message);
    if (!chatInView && data.message.username !== me.username) {
      unread += 1;
      renderUnread();
    }
  },
  error(data) {
    showError(data.error);
  },
  catalog() {
    onCatalogChange();
  },
};

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const lang = document.documentElement.lang || "es";
  socket = new WebSocket(`${protocol}//${location.host}/ws/chat?lang=${lang}`);

  socket.addEventListener("open", () => {
    setConnected(true);
    errorLine.hidden = true;
    if (lastPresence) renderPresence(lastPresence);
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    HANDLERS[data.type]?.(data);
  });

  socket.addEventListener("close", (event) => {
    setConnected(false);
    if (event.code === CLOSE_LOGIN_REQUIRED) {
      location.href = "/login";
      return;
    }
    renderStatus("chat.disconnected", "offline");
    // Reconexión sencilla: si el servidor se reinicia, el chat vuelve solo.
    setTimeout(connect, 2000);
  });

  socket.addEventListener("error", () => socket.close());
}

sendForm.addEventListener("submit", (event) => {
  event.preventDefault();
  errorLine.hidden = true;
  if (!input.value.trim()) return;
  if (socket?.readyState !== WebSocket.OPEN) {
    showError(t("chat.disconnected"));
    return;
  }
  socket.send(JSON.stringify({ type: "message", text: input.value }));
  input.value = "";
});

/** Deja un mensaje escrito para que la persona lo revise y lo envíe. */
export function prefillChat(text) {
  input.value = text;
  document.getElementById("chat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  input.focus({ preventScroll: true });
  input.setSelectionRange(text.length, text.length);
}

/** Abre la conexión. `catalogChanged` se llama cuando el servidor avisa de
 *  que algo cambió en el catálogo o en los préstamos. */
export function startChat({ catalogChanged } = {}) {
  if (catalogChanged) onCatalogChange = catalogChanged;
  emptyState();
  setConnected(false);
  renderStatus("chat.connecting", "");
  connect();
}
