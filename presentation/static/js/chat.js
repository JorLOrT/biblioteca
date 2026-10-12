// CHAT PRIVADO POR WEBSOCKET
//
// El resto de la aplicación usa fetch: el navegador pregunta y el servidor
// contesta. Aquí la conexión se queda ABIERTA en los dos sentidos, así que el
// servidor puede mandar un mensaje sin que nadie se lo haya pedido. Por eso lo
// que escribe la otra persona aparece al instante, sin recargar.
//
// Cada lector tiene una conversación privada con la biblioteca. El lector solo
// ve la suya; el bibliotecario ve una lista con todas y elige a quién contesta.
// Quién puede leer cada mensaje lo decide el servidor: aquí solo se pinta lo
// que llega. No hay que identificarse: el servidor lo sabe por la sesión.
// Por la misma conexión llega el aviso de que algo cambió y hay que recargar.

import { avatarColor, currentUser, escapeHtml, t, tn } from "./core.js";

const CLOSE_LOGIN_REQUIRED = 4401;  // el servidor cerró porque no hay sesión

const me = currentUser();
const isLibrarian = me.role === "librarian";

const messagesList = document.getElementById("chat-messages");
const sendForm = document.getElementById("chat-send-form");
const input = document.getElementById("chat-text");
const sendButton = sendForm.querySelector("button");
const presence = document.getElementById("chat-presence");
const presenceText = document.getElementById("chat-presence-text");
const errorLine = document.getElementById("chat-error");
const conversationList = document.getElementById("chat-conversations");  // solo el bibliotecario
const chatWith = document.getElementById("chat-with");

let socket = null;
let connected = false;
let lastPresence = null;
let onRefresh = () => {};

// Las conversaciones: el usuario de cada lector y sus mensajes.
const conversations = new Map();
let readers = [];             // las cuentas de lectores, para la lista del bibliotecario
let onlineReaders = new Set();
let selected = isLibrarian ? null : me.username;  // la conversación a la vista
const unreadBy = new Map();   // mensajes sin leer por conversación (bibliotecario)

// --- Mensajes que llegan sin el chat a la vista (en el móvil) ----------------

const jump = document.getElementById("chat-jump");
const jumpBadge = document.getElementById("chat-unread");
let chatInView = true;
let unseen = 0;

function renderUnseen() {
  jumpBadge.textContent = unseen;
  jumpBadge.hidden = unseen === 0;
}

new IntersectionObserver(([entry]) => {
  chatInView = entry.isIntersecting;
  jump.classList.toggle("away", !chatInView);
  if (chatInView) {
    unseen = 0;
    renderUnseen();
  }
}, { threshold: 0.2 }).observe(document.getElementById("chat"));

// --- Pintar ------------------------------------------------------------------

function showError(text) {
  errorLine.textContent = text;
  errorLine.hidden = false;
}

function updateControls() {
  // El bibliotecario no escribe hasta elegir a quién.
  const ready = connected && selected !== null;
  input.disabled = !ready;
  sendButton.disabled = !ready;
}

const nameOf = (username) => readers.find((reader) => reader.username === username)?.name
  || conversations.get(username)?.find((m) => m.role === "reader")?.nickname
  || username;

function avatar(username, name) {
  return `<span class="avatar" style="background:${avatarColor(username)}">${
    escapeHtml(String(name || "?").charAt(0).toUpperCase())}</span>`;
}

function messageHtml(message) {
  const own = message.username === me.username;
  const staff = message.role === "librarian";
  return `
    <li class="chat-message${own ? " own" : ""}${staff ? " staff" : ""}">
      ${avatar(message.username, message.nickname)}
      <div class="bubble">
        <p class="author">${escapeHtml(message.nickname)}${own ? ` (${t("chat.you")})` : ""}
          <span class="time">${escapeHtml(message.at)}</span></p>
        <p class="text">${escapeHtml(message.text)}</p>
      </div>
    </li>`;
}

function renderMessages() {
  let html;
  if (selected === null) {
    html = `<li class="chat-empty">${t("chat.pick_conversation")}</li>`;
  } else {
    const messages = conversations.get(selected) || [];
    const empty = isLibrarian
      ? t("chat.no_messages", { name: escapeHtml(nameOf(selected)) })
      : t("chat.empty_reader");
    html = messages.length ? messages.map(messageHtml).join("") : `<li class="chat-empty">${empty}</li>`;
  }
  messagesList.innerHTML = html;
  messagesList.scrollTop = messagesList.scrollHeight;
  updateControls();
}

/** La lista del bibliotecario: primero quien escribió hace menos. */
function renderConversations() {
  if (!conversationList) return;
  const owners = new Set([...readers.map((reader) => reader.username), ...conversations.keys()]);
  const lastId = (username) => conversations.get(username)?.at(-1)?.id ?? 0;
  const rows = [...owners].sort((a, b) => lastId(b) - lastId(a)
    || nameOf(a).localeCompare(nameOf(b)));

  conversationList.innerHTML = rows.map((username) => {
    const last = conversations.get(username)?.at(-1);
    const preview = last
      ? (last.role === "librarian" ? t("chat.you_prefix") : "") + last.text
      : t("chat.no_preview");
    const unread = unreadBy.get(username) || 0;
    const online = onlineReaders.has(username);
    return `
      <li>
        <button type="button" class="conversation${username === selected ? " active" : ""}${unread ? " unread" : ""}"
                data-conversation="${escapeHtml(username)}">
          <span class="conversation-avatar">
            ${avatar(username, nameOf(username))}
            <span class="status-dot${online ? " online" : ""}" aria-hidden="true"></span>
          </span>
          <span class="conversation-text">
            <strong>${escapeHtml(nameOf(username))}</strong>
            <small>${escapeHtml(preview)}</small>
          </span>
          ${unread ? `<span class="unread-count">${unread}</span>`
                   : last ? `<span class="time">${escapeHtml(last.at)}</span>` : ""}
        </button>
      </li>`;
  }).join("");
}

function renderChatWith() {
  if (!chatWith) return;
  chatWith.hidden = selected === null;
  if (selected !== null) chatWith.textContent = t("chat.with", { name: nameOf(selected) });
}

function selectConversation(username) {
  selected = username;
  unreadBy.delete(username);
  errorLine.hidden = true;
  renderConversations();
  renderChatWith();
  renderMessages();
}

/** Quién está al otro lado. Al bibliotecario le importa qué lectores están
 *  conectados; al lector, si el bibliotecario está para contestarle. */
function renderPresence(data) {
  lastPresence = data;
  let online;
  let text;
  if (isLibrarian) {
    onlineReaders = new Set(data.readers || []);
    online = onlineReaders.size > 0;
    text = tn("chat.readers_online", onlineReaders.size, { count: onlineReaders.size });
    renderConversations();
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

function receive(message) {
  const list = conversations.get(message.conversation) || [];
  list.push(message);
  conversations.set(message.conversation, list);
  const fromOther = message.username !== me.username;

  if (message.conversation === selected) {
    messagesList.querySelector(".chat-empty")?.remove();
    messagesList.insertAdjacentHTML("beforeend", messageHtml(message));
    messagesList.scrollTop = messagesList.scrollHeight;
  } else if (fromOther) {
    unreadBy.set(message.conversation, (unreadBy.get(message.conversation) || 0) + 1);
  }
  renderConversations();
  if (fromOther && !chatInView) {
    unseen += 1;
    renderUnseen();
  }
}

// Un manejador por cada tipo de mensaje que envía el servidor.
const HANDLERS = {
  welcome(data) {
    conversations.clear();
    for (const [owner, messages] of Object.entries(data.conversations)) {
      conversations.set(owner, messages);
    }
    renderPresence(data);
    renderConversations();
    renderMessages();
  },
  presence: renderPresence,
  message(data) {
    receive(data.message);
  },
  error(data) {
    showError(data.error);
  },
  refresh() {
    onRefresh();
  },
};

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const lang = document.documentElement.lang || "es";
  socket = new WebSocket(`${protocol}//${location.host}/ws/chat?lang=${lang}`);

  socket.addEventListener("open", () => {
    connected = true;
    errorLine.hidden = true;
    updateControls();
    if (lastPresence) renderPresence(lastPresence);
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    HANDLERS[data.type]?.(data);
  });

  socket.addEventListener("close", (event) => {
    connected = false;
    updateControls();
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
  // El lector siempre escribe en la suya; el bibliotecario dice a quién.
  const payload = { type: "message", text: input.value };
  if (isLibrarian) payload.to = selected;
  socket.send(JSON.stringify(payload));
  input.value = "";
});

conversationList?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-conversation]");
  if (row) selectConversation(row.dataset.conversation);
});

/** Deja un mensaje escrito para que la persona lo revise y lo envíe. */
export function prefillChat(text) {
  input.value = text;
  document.getElementById("chat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  input.focus({ preventScroll: true });
  input.setSelectionRange(text.length, text.length);
}

/** Las cuentas de lectores (bibliotecario): cada una es una conversación posible. */
export function setReaders(list) {
  readers = list.map((reader) => ({ username: reader.username, name: reader.name }));
  renderConversations();
  renderChatWith();
}

/** Abre la conversación con un lector y deja el cursor listo para escribirle. */
export function openConversation(username) {
  selectConversation(username);
  document.getElementById("chat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  input.focus({ preventScroll: true });
}

/** Abre la conexión. `refresh` se llama cuando el servidor avisa de que algo
 *  cambió en el catálogo, los préstamos o los lectores. */
export function startChat({ refresh } = {}) {
  if (refresh) onRefresh = refresh;
  renderMessages();
  renderStatus("chat.connecting", "");
  connect();
}
