// Cliente de la API REST. Solo habla HTTP con la capa de presentación:
// no conoce ni las reglas de negocio ni la base de datos.

const notice = document.getElementById("notice");
const bookForm = document.getElementById("book-form");
const bookRows = document.getElementById("book-rows");
const loanRows = document.getElementById("loan-rows");
const activityPanel = document.getElementById("activity");
const wishlistPanel = document.getElementById("wishlist");
const calcForm = document.getElementById("calc-form");
const calcResult = document.getElementById("calc-result");
const lookupResult = document.getElementById("lookup-result");

let books = [];     // último catálogo recibido, para buscar un libro por su id
let wishlist = [];  // copia local de la lista de deseos que guarda la sesión
let messages = {};  // catálogo de traducciones que entrega /api/i18n
let rules = {};     // expresiones regulares que entrega /api/validation-rules

/** Traduce una clave sustituyendo sus parámetros: t("wishlist.count", {count: 2, max: 5}) */
function t(key, params = {}) {
  let text = messages[key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(value);
  }
  return text;
}

function showNotice(text, kind) {
  notice.textContent = text;
  notice.className = "notice " + kind;
  notice.hidden = false;
}

function clearNotice() {
  notice.hidden = true;
}

/** Llama a la API y convierte el {error} del servidor en una excepción.
 *  Si la respuesta ni siquiera es JSON (un 500 en HTML, por ejemplo) se usa el
 *  mensaje genérico, en lugar del error interno de leer el JSON. */
async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || t("error.unexpected"));
  }
  return data;
}

function postJson(url, body) {
  return api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Ejecuta una acción del usuario: borra el aviso anterior y, si algo falla,
 *  muestra el error. Es el try/catch que antes repetía cada botón. */
async function runAction(action) {
  clearNotice();
  try {
    await action();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

/** Avisa de que la acción salió bien y vuelve a pintar los datos. */
async function succeed(messageKey) {
  showNotice(t(messageKey), "ok");
  await reload();
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa un texto para insertarlo en HTML. Incluye las comillas, para que
 *  también sea seguro dentro de un atributo (`alt="..."`). */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// ===========================================================================
//  VALIDACIÓN DEL FORMULARIO CON EXPRESIONES REGULARES
//  Los patrones NO se escriben aquí: se piden a /api/validation-rules, que los
//  toma de business/validators.py. Así el navegador y el servidor aplican
//  exactamente la misma regla y no pueden quedar desincronizados.
// ===========================================================================

/** ¿Encaja el valor de este campo con su expresión regular? */
function fieldIsValid(input) {
  const pattern = rules[input.dataset.rule];
  if (!pattern) return true;
  return new RegExp(pattern).test(input.value.trim());
}

/** Pinta el campo y muestra u oculta su mensaje de error.
 *  Mientras se rellena, un campo vacío no muestra mensaje (molestaría); al
 *  enviar el formulario sí (`includeEmpty`). */
function markField(input, includeEmpty = false) {
  const valid = fieldIsValid(input);
  const filled = input.value.trim() !== "";
  const error = input.closest(".field").querySelector(".field-error");
  const showError = !valid && (filled || includeEmpty);

  input.classList.toggle("invalid", !valid);
  input.classList.toggle("valid", valid && filled);
  if (showError) error.textContent = t("error.invalid_" + input.dataset.rule);
  error.hidden = !showError;
  return valid;
}

/** Valida el formulario entero. Devuelve true solo si todos los campos pasan. */
function formIsValid(form) {
  const inputs = [...form.querySelectorAll("[data-rule]")];
  // Se evalúan todos para que el usuario vea de una vez qué está mal.
  const results = inputs.map((input) => markField(input, true));
  const firstInvalid = inputs.find((input, i) => !results[i]);
  if (firstInvalid) firstInvalid.focus();
  return results.every(Boolean);
}

/** Conecta la validación en vivo: al escribir y al salir del campo. */
function enableLiveValidation(form) {
  form.querySelectorAll("[data-rule]").forEach((input) => {
    input.addEventListener("blur", () => markField(input));
    input.addEventListener("input", () => {
      // Mientras se escribe solo se quita el error, no se añade: molesta menos.
      if (input.classList.contains("invalid") && fieldIsValid(input)) {
        markField(input);
      }
    });
  });
}

function resetForm(form) {
  form.reset();
  form.querySelectorAll("[data-rule]").forEach((input) => {
    input.classList.remove("invalid", "valid");
    input.closest(".field").querySelector(".field-error").hidden = true;
  });
}

const money = (amount) => t("currency", { amount: Number(amount).toFixed(2) });

// --- Pintado de las tablas -------------------------------------------------

function renderBooks(list) {
  books = list;
  if (list.length === 0) {
    bookRows.innerHTML = `<tr><td colspan="7" class="empty">${t("empty.books")}</td></tr>`;
    return;
  }

  bookRows.innerHTML = list.map((book) => {
    const wished = wishlist.includes(book.id);
    return `
      <tr>
        <td>${book.id}</td>
        <td>${escapeHtml(book.title)}</td>
        <td>${escapeHtml(book.author)}</td>
        <td>${book.year ?? ""}</td>
        <td class="isbn">${book.isbn ? escapeHtml(book.isbn) : "—"}</td>
        <td>
          <span class="badge ${book.available ? "available" : "borrowed"}">
            ${t(book.available ? "status.available" : "status.borrowed")}
          </span>
        </td>
        <td class="actions">
          <button class="star ${wished ? "active" : ""}" data-action="wish" data-id="${book.id}"
                  title="${escapeHtml(t(wished ? "action.wishlist_remove" : "action.wishlist_add"))}">
            ${wished ? "★" : "☆"}
          </button>
          ${book.available ? `<button data-action="lend" data-id="${book.id}">${t("action.lend")}</button>` : ""}
          <button class="danger" data-action="delete" data-id="${book.id}">${t("action.delete")}</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderLoans(loans) {
  if (loans.length === 0) {
    loanRows.innerHTML = `<tr><td colspan="7" class="empty">${t("empty.loans")}</td></tr>`;
    return;
  }

  loanRows.innerHTML = loans.map((loan) => `
    <tr class="${loan.is_active && loan.days_late > 0 ? "overdue" : ""}">
      <td>${loan.id}</td>
      <td>${escapeHtml(loan.book_title)}</td>
      <td>${escapeHtml(loan.borrower)}</td>
      <td>${loan.loan_date}</td>
      <td>
        ${loan.due_date}
        ${loan.days_late > 0
          ? `<span class="badge borrowed">${loan.days_late} d · ${money(loan.fine)}</span>`
          : ""}
      </td>
      <td>${loan.return_date || "—"}</td>
      <td class="actions">
        ${loan.is_active ? `<button class="secondary" data-action="return" data-id="${loan.id}">${t("action.return")}</button>` : ""}
      </td>
    </tr>
  `).join("");
}

// --- Paneles con estado ----------------------------------------------------

function renderActivity(activity) {
  // Las claves del servidor ("loans") se traducen con "activity.loans".
  const rows = Object.entries(activity.counters)
    .map(([action, count]) => `
      <li><span>${t("activity." + action)}</span><strong>${count}</strong></li>
    `).join("");

  activityPanel.innerHTML = `
    <ul class="counters">
      ${rows || `<li class="empty">${t("activity.empty")}</li>`}
    </ul>
    <p class="footnote">
      ${t("activity.total")}: <strong>${activity.total}</strong>
      ${activity.last_action
        ? ` · ${t("activity.last", {
              action: t("activity." + activity.last_action),
              time: activity.last_action_at,
            })}`
        : ""}
    </p>
  `;
}

function renderWishlist(data) {
  wishlist = data.book_ids;

  wishlistPanel.innerHTML = data.books.length === 0
    ? `<p class="empty">${t("wishlist.empty")}</p>`
    : `<ul class="chips">${data.books.map((book) =>
        `<li>${escapeHtml(book.title)}</li>`).join("")}</ul>`;

  wishlistPanel.innerHTML += `<p class="footnote">${
    t("wishlist.count", { count: data.books.length, max: data.max })
  }</p>`;
}

// --- Recarga general -------------------------------------------------------

async function reload() {
  // La lista de deseos se pide primero porque el catálogo necesita saber
  // qué libros están marcados para pintar la estrella.
  renderWishlist(await api("/api/wishlist"));

  const [bookList, loans, activity] = await Promise.all([
    api("/api/books"),
    api("/api/loans"),
    api("/api/activity"),
  ]);

  renderBooks(bookList);
  renderLoans(loans);
  renderActivity(activity);
}

// --- Acciones del usuario --------------------------------------------------

bookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runAction(async () => {
    // Primera barrera: los regex en el navegador. Si algo falla no se envía nada.
    if (!formIsValid(bookForm)) return;

    await postJson("/api/books", {
      title: document.getElementById("book-title").value,
      author: document.getElementById("book-author").value,
      year: document.getElementById("book-year").value,
      isbn: document.getElementById("book-isbn").value,
    });
    resetForm(bookForm);
    lookupResult.hidden = true;
    await succeed("msg.book_added");
  });
});

// Calculadora: llama a los dos endpoints STATELESS.
calcForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runAction(async () => {
    calcResult.hidden = true;

    const loanDate = document.getElementById("calc-loan-date").value;
    const days = document.getElementById("calc-days").value;
    const returnDate = document.getElementById("calc-return-date").value;

    const due = await api("/api/tools/due-date?"
      + new URLSearchParams({ loan_date: loanDate, days }));

    let html = t("calc.result", {
      loan_date: due.loan_date,
      days: due.days,
      due_date: due.due_date,
    });

    if (returnDate) {
      const penalty = await api("/api/tools/fine?"
        + new URLSearchParams({ due_date: due.due_date, reference_date: returnDate }));
      html += "<br>" + (penalty.days_late > 0
        ? t("calc.late", {
            date: returnDate,
            days: penalty.days_late,
            fine: money(penalty.fine),
            rate: money(penalty.daily_rate),
          })
        : t("calc.ontime", { date: returnDate }));
    }

    calcResult.innerHTML = html;
    calcResult.hidden = false;
  });
});

document.getElementById("activity-reset").addEventListener("click", () => runAction(async () => {
  await api("/api/activity/reset", { method: "POST" });
  await succeed("msg.activity_reset");
}));

document.getElementById("wishlist-clear").addEventListener("click", () => runAction(async () => {
  await api("/api/wishlist", { method: "DELETE" });
  await succeed("msg.wishlist_cleared");
}));

// Botones de las tablas. Se pintan de nuevo en cada recarga, así que se
// escucha en el documento y cada botón dice qué hace con `data-action`.
const ROW_ACTIONS = {
  async wish(bookId) {
    const result = await api(`/api/wishlist/${bookId}`, { method: "POST" });
    await succeed(result.in_wishlist ? "msg.wishlist_added" : "msg.wishlist_removed");
  },
  lend(bookId) {
    openLoanForm(bookId);  // el préstamo se registra al enviar el formulario
  },
  async return(loanId) {
    await api(`/api/loans/${loanId}/return`, { method: "POST" });
    await succeed("msg.book_returned");
  },
  async delete(bookId) {
    if (!confirm(t("confirm.delete"))) return;
    await api(`/api/books/${bookId}`, { method: "DELETE" });
    await succeed("msg.book_deleted");
  },
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = ROW_ACTIONS[button.dataset.action];
  runAction(() => action(Number(button.dataset.id)));
});


// ===========================================================================
//  CONSUMO DE UN SERVICIO EXTERNO DESDE EL FRONT END
//
//  Esta llamada sale del NAVEGADOR directamente a openlibrary.org. No pasa por
//  nuestro servidor Flask: es el propio cliente quien habla con el tercero.
//
//  Open Library es una API pública de Internet Archive. No necesita clave y
//  responde con la cabecera `Access-Control-Allow-Origin: *`, que es lo que
//  permite que un navegador la llame desde otro dominio.
//
//  Al ser un servicio ajeno hay que contar con que falle: se le pone un plazo
//  máximo de respuesta y se tratan por separado «no encontrado», «tardó
//  demasiado» y «no se pudo conectar». Y lo que devuelve se escapa igual que
//  lo nuestro: un servicio externo tampoco es de fiar.
// ===========================================================================

const OPEN_LIBRARY = "https://openlibrary.org/search.json";
const LOOKUP_TIMEOUT = 8000; // ms antes de darlo por perdido

function showLookup(html, kind) {
  lookupResult.className = "lookup-result " + kind;
  lookupResult.innerHTML = html;
  lookupResult.hidden = false;
}

/** Consulta un ISBN en Open Library. Devuelve los datos del libro o null. */
async function searchOpenLibrary(isbn) {
  // AbortController corta la petición si el servicio externo no responde.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT);

  const url = `${OPEN_LIBRARY}?q=isbn:${encodeURIComponent(isbn)}&limit=1`
            + `&fields=title,author_name,first_publish_year,cover_i`;

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status);

    const data = await response.json();
    return data.docs && data.docs.length ? data.docs[0] : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pasa al formulario lo que devolvió Open Library y lo revalida. */
function fillBookForm(found) {
  const fields = {
    "book-title": found.title || "",
    "book-author": (found.author_name && found.author_name[0]) || "",
    "book-year": found.first_publish_year || "",
  };
  for (const [id, value] of Object.entries(fields)) {
    const input = document.getElementById(id);
    input.value = value;
    // Lo que llega de fuera tampoco se da por bueno sin comprobarlo.
    markField(input);
  }
}

document.getElementById("isbn-lookup").addEventListener("click", async () => {
  clearNotice();
  const isbnInput = document.getElementById("book-isbn");

  // Se reutiliza el mismo regex del servidor antes de molestar al tercero.
  if (!markField(isbnInput)) {
    lookupResult.hidden = true;  // que no quede a la vista un resultado viejo
    return;
  }

  const isbn = isbnInput.value.trim().replace(/[-\s]/g, "");
  showLookup(`<p class="searching">${t("ext.searching")}</p>`, "neutral");

  try {
    const found = await searchOpenLibrary(isbn);

    if (!found) {
      showLookup(`<p>${t("ext.not_found")}</p>`, "warning");
      return;
    }

    fillBookForm(found);

    const cover = found.cover_i
      ? `<img src="https://covers.openlibrary.org/b/id/${encodeURIComponent(found.cover_i)}-M.jpg"
              alt="${escapeHtml(found.title)}" class="cover">`
      : `<div class="cover missing">${t("ext.no_cover")}</div>`;

    showLookup(`
      ${cover}
      <div>
        <p><strong>${t("ext.found", { title: escapeHtml(found.title) })}</strong></p>
        <p>${t("ext.filled")}</p>
        <p class="source">${t("ext.source")}</p>
      </div>
    `, "ok");
  } catch (error) {
    const key = error.name === "AbortError" ? "ext.timeout" : "ext.error";
    showLookup(`<p>${t(key)}</p>`, "error");
  }
});


// ===========================================================================
//  CHAT POR WEBSOCKET
//
//  El resto de la aplicación usa fetch: el navegador pregunta y el servidor
//  contesta. Aquí la conexión se queda ABIERTA en los dos sentidos, así que el
//  servidor puede mandar un mensaje sin que nadie se lo haya pedido. Por eso
//  lo que escribe otra persona aparece al instante, sin recargar ni preguntar
//  cada pocos segundos.
//
//  No hay registro: la identidad es un apodo y un correo, y se guarda en
//  sessionStorage para no tener que teclearla otra vez al recargar.
// ===========================================================================

const IDENTITY_KEY = "chat-identity";

const chatJoinForm = document.getElementById("chat-join-form");
const chatSendForm = document.getElementById("chat-send-form");
const chatRoom = document.getElementById("chat-room");
const chatMessages = document.getElementById("chat-messages");
const chatStatus = document.getElementById("chat-status");
const chatError = document.getElementById("chat-error");
const chatText = document.getElementById("chat-text");
const chatMe = document.getElementById("chat-me");

let socket = null;
let identity = null;
let reconnectTimer = null;

// sessionStorage puede lanzar una excepción (modo privado, almacenamiento
// bloqueado). Sin él, el chat funciona igual: solo deja de recordar quién eres
// al recargar. Por eso estos tres `catch` no necesitan hacer nada más.
function saveIdentity(data) {
  try {
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(data));
  } catch {
    // Sin almacenamiento: la identidad dura lo que dure la página.
  }
}

function loadIdentity() {
  try {
    return JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || "null");
  } catch {
    return null;
  }
}

function forgetIdentity() {
  try {
    sessionStorage.removeItem(IDENTITY_KEY);
  } catch {
    // Si no se pudo guardar, tampoco hay nada que borrar.
  }
}

/** ¿Está la conexión realmente abierta? */
function isConnected() {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

function showChatError(text) {
  chatError.textContent = text;
  chatError.hidden = false;
}

/** Envía por el socket solo si está abierto; si no, avisa y no revienta. */
function sendOverSocket(payload) {
  if (!isConnected()) {
    showChatError(t("chat.disconnected"));
    return false;
  }
  socket.send(JSON.stringify(payload));
  return true;
}

function sendJoin(nickname, email) {
  return sendOverSocket({ type: "join", name: nickname, email });
}

/** Bloquea los controles mientras no haya conexión. */
function setControlsEnabled(enabled) {
  chatText.disabled = !enabled;
  chatSendForm.querySelector("button").disabled = !enabled;
  chatJoinForm.querySelector("button").disabled = !enabled;
}

function renderStatus(key, kind) {
  chatStatus.textContent = t(key);
  chatStatus.className = "connection-status " + kind;
}

function appendLine(node) {
  const placeholder = chatMessages.querySelector(".empty");
  if (placeholder) placeholder.remove();
  chatMessages.appendChild(node);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderChatMessage(message) {
  const own = identity && message.email === identity.email;
  const item = document.createElement("li");
  item.className = "chat-message" + (own ? " own" : "");
  item.innerHTML = `
    <span class="avatar" style="background:${escapeHtml(message.color)}">${escapeHtml(message.initial)}</span>
    <div class="bubble">
      <p class="author">${escapeHtml(message.nickname)}${own ? ` (${t("chat.you")})` : ""}
         <span class="time">${escapeHtml(message.at)}</span></p>
      <p class="text">${escapeHtml(message.text)}</p>
    </div>`;
  appendLine(item);
}

function renderChatNotice(text) {
  const item = document.createElement("li");
  item.className = "chat-notice";
  item.textContent = text;
  appendLine(item);
}

function renderOnline(count) {
  document.getElementById("chat-online").textContent = t("chat.online", { count });
}

function enterRoom() {
  chatJoinForm.hidden = true;
  chatRoom.hidden = false;
  chatMe.textContent = identity.nickname;
  chatMe.style.background = identity.color;
  chatText.focus();
}

// Un manejador por cada tipo de mensaje que envía el servidor.
const SOCKET_HANDLERS = {
  welcome(data) {
    chatMessages.innerHTML = data.history.length
      ? "" : `<li class="empty">${t("chat.empty")}</li>`;
    data.history.forEach(renderChatMessage);
    renderOnline(data.online);
  },
  joined(data) {
    identity = data.identity;
    saveIdentity(identity);
    enterRoom();
  },
  message(data) {
    renderChatMessage(data.message);
  },
  system(data) {
    renderChatNotice(t(data.event === "join" ? "chat.joined" : "chat.left",
                       { nickname: data.nickname }));
  },
  online(data) {
    renderOnline(data.count);
  },
  error(data) {
    showChatError(data.error);
  },
};

function scheduleReconnect(delay) {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const lang = document.documentElement.lang || "es";
  // `ws` es ESTA conexión; `socket`, la vigente. Al salir del chat se
  // sustituye una por otra y la vieja no debe reconectarse por su cuenta.
  const ws = new WebSocket(`${protocol}//${location.host}/ws/chat?lang=${lang}`);
  socket = ws;

  ws.addEventListener("open", () => {
    renderStatus("chat.connected", "ok");
    setControlsEnabled(true);
    chatError.hidden = true;
    // Si ya había identidad guardada, se reenvía sin preguntar de nuevo.
    if (identity) sendJoin(identity.nickname, identity.email);
  });

  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    SOCKET_HANDLERS[data.type]?.(data);
  });

  ws.addEventListener("close", () => {
    if (ws !== socket) return;
    renderStatus("chat.disconnected", "error");
    setControlsEnabled(false);
    // Reconexión sencilla: si el servidor se reinicia, el chat vuelve solo.
    scheduleReconnect(2000);
  });

  ws.addEventListener("error", () => ws.close());
}

chatJoinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  chatError.hidden = true;
  if (!formIsValid(chatJoinForm)) return;

  sendJoin(
    document.getElementById("chat-nickname").value,
    document.getElementById("chat-email").value,
  );
});

chatSendForm.addEventListener("submit", (event) => {
  event.preventDefault();
  chatError.hidden = true;

  if (!chatText.value.trim()) return;

  if (sendOverSocket({ type: "message", text: chatText.value })) {
    chatText.value = "";
  }
});

document.getElementById("chat-leave").addEventListener("click", () => {
  forgetIdentity();
  identity = null;
  chatRoom.hidden = true;
  chatJoinForm.hidden = false;
  resetForm(chatJoinForm);

  // Cerrar y reabrir hace que el servidor avise de la salida a los demás.
  // Se suelta antes la conexión vieja para que su `close` no abra otra más.
  const previous = socket;
  socket = null;
  previous?.close();
  renderStatus("chat.connecting", "");
  setControlsEnabled(false);
  scheduleReconnect(100);
});

function startChat() {
  identity = loadIdentity();
  enableLiveValidation(chatJoinForm);
  if (identity) enterRoom();
  renderStatus("chat.connecting", "");
  setControlsEnabled(false);
  connect();
}

// --- Formulario de préstamo -----------------------------------------------

const loanOverlay = document.getElementById("loan-overlay");
const loanForm = document.getElementById("loan-form");
let bookToLend = null;

function openLoanForm(bookId) {
  bookToLend = bookId;
  const book = books.find((candidate) => candidate.id === bookId);

  document.getElementById("loan-book").textContent =
    t("loanform.book") + ": " + book.title;

  resetForm(loanForm);
  loanOverlay.hidden = false;
  document.getElementById("loan-borrower").focus();
}

function closeLoanForm() {
  loanOverlay.hidden = true;
  bookToLend = null;
}

document.getElementById("loan-cancel").addEventListener("click", closeLoanForm);

// Cerrar pulsando fuera del cuadro o con la tecla Escape.
loanOverlay.addEventListener("click", (event) => {
  if (event.target === loanOverlay) closeLoanForm();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !loanOverlay.hidden) closeLoanForm();
});

loanForm.addEventListener("submit", (event) => {
  event.preventDefault();
  // Si el servidor rechaza algo que el navegador dio por bueno, runAction lo
  // muestra en el aviso.
  runAction(async () => {
    if (!formIsValid(loanForm)) return;

    await postJson("/api/loans", {
      book_id: bookToLend,
      borrower: document.getElementById("loan-borrower").value,
      dni: document.getElementById("loan-dni").value,
      email: document.getElementById("loan-email").value,
      phone: document.getElementById("loan-phone").value,
    });
    closeLoanForm();
    await succeed("msg.loan_created");
  });
});

// Cambiar de idioma: el servidor lo guarda en la sesión y se recarga la página
// para que también los textos fijos (los que pinta Jinja) vengan traducidos.
document.getElementById("language-select").addEventListener("change", (event) => {
  runAction(async () => {
    await api(`/api/i18n/${event.target.value}`, { method: "POST" });
    // Se navega SIN ?lang= en la URL: si se recargara tal cual, ese parámetro
    // volvería a imponer el idioma anterior y anularía el cambio recién hecho.
    window.location.href = window.location.pathname;
  });
});

// Al abrir la página, la calculadora se rellena con la fecha de hoy.
document.getElementById("calc-loan-date").value = new Date().toISOString().slice(0, 10);

/** Arranque: primero el catálogo de traducciones, después los datos. */
async function start() {
  // El catálogo de idioma y los patrones de validación, antes de pintar nada.
  const [i18n, validation] = await Promise.all([
    api("/api/i18n"),
    api("/api/validation-rules"),
  ]);

  messages = i18n.messages;
  rules = validation.patterns;
  document.documentElement.lang = i18n.lang;

  enableLiveValidation(bookForm);
  enableLiveValidation(loanForm);

  await reload();
  startChat();
}

// Si el arranque falla (servidor caído, respuesta inesperada), se avisa en la
// página en vez de dejar el error escondido en la consola.
runAction(start);
