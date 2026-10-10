// Cliente de la API REST. Solo habla HTTP con la capa de presentación:
// no conoce ni las reglas de negocio ni la base de datos.

const mensaje = document.getElementById("mensaje");
const tablaLibros = document.getElementById("tabla-libros");
const tablaPrestamos = document.getElementById("tabla-prestamos");
const panelActividad = document.getElementById("actividad");
const panelDeseos = document.getElementById("lista-deseos");
const resultadoCalculo = document.getElementById("resultado-calculo");

let deseos = [];    // copia local de la lista de deseos que guarda la sesión
let mensajes = {};  // catálogo de traducciones que entrega /api/i18n
let reglas = {};    // expresiones regulares que entrega /api/validation-rules

/** Traduce una clave sustituyendo sus parámetros: t("wishlist.count", {count: 2, max: 5}) */
function t(clave, params = {}) {
  let texto = mensajes[clave] ?? clave;
  for (const [nombre, valor] of Object.entries(params)) {
    texto = texto.split(`{${nombre}}`).join(valor);
  }
  return texto;
}

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = "mensaje " + tipo;
  mensaje.hidden = false;
}

function limpiarMensaje() {
  mensaje.hidden = true;
}

/** Llama a la API y convierte el {error} del servidor en una excepción. */
async function api(url, opciones) {
  const respuesta = await fetch(url, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(datos.error || t("error.unexpected"));
  }
  return datos;
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto == null ? "" : texto;
  return div.innerHTML;
}

// ===========================================================================
//  VALIDACIÓN DEL FORMULARIO CON EXPRESIONES REGULARES
//  Los patrones NO se escriben aquí: se piden a /api/validation-rules, que los
//  toma de business/validators.py. Así el navegador y el servidor aplican
//  exactamente la misma regla y no pueden quedar desincronizados.
// ===========================================================================

/** ¿Encaja el valor de este campo con su expresión regular? */
function campoValido(input) {
  const patron = reglas[input.dataset.regla];
  if (!patron) return true;
  return new RegExp(patron).test(input.value.trim());
}

/** Pinta el campo y muestra u oculta su mensaje de error. */
function revisarCampo(input, mostrarError = true) {
  const contenedor = input.closest(".campo");
  const fallo = contenedor.querySelector(".fallo");
  const valido = campoValido(input);

  input.classList.toggle("invalido", mostrarError && !valido);
  input.classList.toggle("valido", valido && input.value.trim() !== "");

  if (mostrarError && !valido && input.value.trim() !== "") {
    fallo.textContent = t("error.invalid_" + input.dataset.regla);
    fallo.hidden = false;
  } else {
    fallo.hidden = true;
  }
  return valido;
}

/** Valida el formulario entero. Devuelve true solo si todos los campos pasan. */
function formularioValido(form) {
  const campos = [...form.querySelectorAll("[data-regla]")];
  // Se evalúan todos para que el usuario vea de una vez qué está mal.
  const resultados = campos.map((input) => {
    const valido = campoValido(input);
    const fallo = input.closest(".campo").querySelector(".fallo");
    input.classList.toggle("invalido", !valido);
    if (!valido) {
      fallo.textContent = t("error.invalid_" + input.dataset.regla);
      fallo.hidden = false;
    } else {
      fallo.hidden = true;
    }
    return valido;
  });
  const primerFallo = campos.find((c) => c.classList.contains("invalido"));
  if (primerFallo) primerFallo.focus();
  return resultados.every(Boolean);
}

/** Conecta la validación en vivo: al escribir y al salir del campo. */
function activarValidacion(form) {
  form.querySelectorAll("[data-regla]").forEach((input) => {
    input.addEventListener("blur", () => revisarCampo(input));
    input.addEventListener("input", () => {
      // Mientras se escribe solo se quita el error, no se añade: molesta menos.
      if (input.classList.contains("invalido") && campoValido(input)) {
        revisarCampo(input);
      }
    });
  });
}

function limpiarFormulario(form) {
  form.reset();
  form.querySelectorAll("[data-regla]").forEach((input) => {
    input.classList.remove("invalido", "valido");
    input.closest(".campo").querySelector(".fallo").hidden = true;
  });
}

const moneda = (valor) => t("currency", { amount: Number(valor).toFixed(2) });

// --- Pintado de las tablas -------------------------------------------------

function pintarLibros(libros) {
  if (libros.length === 0) {
    tablaLibros.innerHTML = `<tr><td colspan="7" class="vacio">${t("empty.books")}</td></tr>`;
    return;
  }

  tablaLibros.innerHTML = libros.map((libro) => {
    const deseado = deseos.includes(libro.id);
    return `
      <tr>
        <td>${libro.id}</td>
        <td>${escapar(libro.title)}</td>
        <td>${escapar(libro.author)}</td>
        <td>${libro.year ?? ""}</td>
        <td class="isbn">${libro.isbn ? escapar(libro.isbn) : "—"}</td>
        <td>
          <span class="badge ${libro.available ? "disponible" : "prestado"}">
            ${t(libro.available ? "status.available" : "status.borrowed")}
          </span>
        </td>
        <td class="acciones">
          <button class="estrella ${deseado ? "activa" : ""}" data-deseo="${libro.id}"
                  title="${t(deseado ? "action.wishlist_remove" : "action.wishlist_add")}">
            ${deseado ? "★" : "☆"}
          </button>
          ${libro.available ? `<button data-prestar="${libro.id}">${t("action.lend")}</button>` : ""}
          <button class="peligro" data-eliminar="${libro.id}">${t("action.delete")}</button>
        </td>
      </tr>
    `;
  }).join("");
}

function pintarPrestamos(prestamos) {
  if (prestamos.length === 0) {
    tablaPrestamos.innerHTML = `<tr><td colspan="7" class="vacio">${t("empty.loans")}</td></tr>`;
    return;
  }

  tablaPrestamos.innerHTML = prestamos.map((p) => `
    <tr class="${p.is_active && p.days_late > 0 ? "atrasado" : ""}">
      <td>${p.id}</td>
      <td>${escapar(p.book_title)}</td>
      <td>${escapar(p.borrower)}</td>
      <td>${p.loan_date}</td>
      <td>
        ${p.due_date}
        ${p.days_late > 0
          ? `<span class="badge prestado">${p.days_late} d · ${moneda(p.fine)}</span>`
          : ""}
      </td>
      <td>${p.return_date || "—"}</td>
      <td class="acciones">
        ${p.is_active ? `<button class="secundario" data-devolver="${p.id}">${t("action.return")}</button>` : ""}
      </td>
    </tr>
  `).join("");
}

// --- Paneles con estado ----------------------------------------------------

function pintarActividad(datos) {
  // Las claves del servidor ("prestamos") se traducen con "activity.prestamos".
  const filas = Object.entries(datos.counters)
    .map(([clave, valor]) => `
      <li><span>${t("activity." + clave)}</span><strong>${valor}</strong></li>
    `).join("");

  panelActividad.innerHTML = `
    <ul class="contadores">
      ${filas || `<li class="vacio">${t("activity.empty")}</li>`}
    </ul>
    <p class="pie">
      ${t("activity.total")}: <strong>${datos.total}</strong>
      ${datos.last_action
        ? ` · ${t("activity.last", {
              action: t("activity." + datos.last_action),
              time: datos.last_action_at,
            })}`
        : ""}
    </p>
  `;
}

function pintarDeseos(datos) {
  deseos = datos.book_ids;

  panelDeseos.innerHTML = datos.books.length === 0
    ? `<p class="vacio">${t("wishlist.empty")}</p>`
    : `<ul class="chips">${datos.books.map((libro) =>
        `<li>${escapar(libro.title)}</li>`).join("")}</ul>`;

  panelDeseos.innerHTML += `<p class="pie">${
    t("wishlist.count", { count: datos.books.length, max: datos.max })
  }</p>`;
}

// --- Recarga general -------------------------------------------------------

async function recargar() {
  // La lista de deseos se pide primero porque el catálogo necesita saber
  // qué libros están marcados para pintar la estrella.
  const listaDeseos = await api("/api/wishlist");
  pintarDeseos(listaDeseos);

  const [libros, prestamos, actividad] = await Promise.all([
    api("/api/books"),
    api("/api/loans"),
    api("/api/activity"),
  ]);

  pintarLibros(libros);
  pintarPrestamos(prestamos);
  pintarActividad(actividad);
}

// --- Acciones del usuario --------------------------------------------------

const formLibro = document.getElementById("form-libro");

formLibro.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limpiarMensaje();

  // Primera barrera: los regex en el navegador. Si algo falla no se envía nada.
  if (!formularioValido(formLibro)) return;

  try {
    await api("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: document.getElementById("titulo").value,
        author: document.getElementById("autor").value,
        year: document.getElementById("anio").value,
        isbn: document.getElementById("isbn").value,
      }),
    });
    limpiarFormulario(formLibro);
    panelExterno.hidden = true;
    mostrarMensaje(t("msg.book_added"), "ok");
    await recargar();
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
});

// Calculadora: llama a los dos endpoints STATELESS.
document.getElementById("form-calculo").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limpiarMensaje();
  resultadoCalculo.hidden = true;

  const fecha = document.getElementById("calc-fecha").value;
  const dias = document.getElementById("calc-dias").value;
  const devolucion = document.getElementById("calc-devolucion").value;

  try {
    const vencimiento = await api(
      `/api/tools/due-date?loan_date=${fecha}&days=${dias}`
    );

    let html = t("calc.result", {
      loan_date: vencimiento.loan_date,
      days: vencimiento.days,
      due_date: vencimiento.due_date,
    });

    if (devolucion) {
      const multa = await api(
        `/api/tools/fine?due_date=${vencimiento.due_date}&reference_date=${devolucion}`
      );
      html += "<br>" + (multa.days_late > 0
        ? t("calc.late", {
            date: devolucion,
            days: multa.days_late,
            fine: moneda(multa.fine),
            rate: moneda(multa.daily_rate),
          })
        : t("calc.ontime", { date: devolucion }));
    }

    resultadoCalculo.innerHTML = html;
    resultadoCalculo.hidden = false;
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
});

document.getElementById("btn-reset-actividad").addEventListener("click", async () => {
  limpiarMensaje();
  try {
    await api("/api/activity/reset", { method: "POST" });
    mostrarMensaje(t("msg.activity_reset"), "ok");
    await recargar();
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
});

document.getElementById("btn-vaciar-deseos").addEventListener("click", async () => {
  limpiarMensaje();
  try {
    await api("/api/wishlist", { method: "DELETE" });
    mostrarMensaje(t("msg.wishlist_cleared"), "ok");
    await recargar();
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
});

document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("button");
  if (!boton) return;

  const { prestar, eliminar, devolver, deseo } = boton.dataset;
  if (!prestar && !eliminar && !devolver && !deseo) return;

  limpiarMensaje();

  try {
    if (deseo) {
      const resultado = await api(`/api/wishlist/${deseo}`, { method: "POST" });
      mostrarMensaje(
        resultado.in_wishlist
          ? t("msg.wishlist_added")
          : t("msg.wishlist_removed"),
        "ok"
      );
    } else if (prestar) {
      abrirFormularioPrestamo(Number(prestar), boton);
      return;                       // el préstamo se registra al enviar el formulario
    } else if (devolver) {
      await api(`/api/loans/${devolver}/return`, { method: "POST" });
      mostrarMensaje(t("msg.book_returned"), "ok");
    } else {
      if (!confirm(t("confirm.delete"))) return;
      await api(`/api/books/${eliminar}`, { method: "DELETE" });
      mostrarMensaje(t("msg.book_deleted"), "ok");
    }
    await recargar();
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
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
//  demasiado» y «no se pudo conectar».
// ===========================================================================

const OPEN_LIBRARY = "https://openlibrary.org/search.json";
const PLAZO_EXTERNO = 8000; // ms antes de darlo por perdido

const panelExterno = document.getElementById("resultado-externo");

function mostrarExterno(html, tipo) {
  panelExterno.className = "externo " + tipo;
  panelExterno.innerHTML = html;
  panelExterno.hidden = false;
}

/** Consulta un ISBN en Open Library. Devuelve los datos del libro o null. */
async function buscarEnOpenLibrary(isbn) {
  // AbortController corta la petición si el servicio externo no responde.
  const corte = new AbortController();
  const temporizador = setTimeout(() => corte.abort(), PLAZO_EXTERNO);

  const url = `${OPEN_LIBRARY}?q=isbn:${encodeURIComponent(isbn)}&limit=1`
            + `&fields=title,author_name,first_publish_year,cover_i`;

  try {
    const respuesta = await fetch(url, { signal: corte.signal });
    if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);

    const datos = await respuesta.json();
    return datos.docs && datos.docs.length ? datos.docs[0] : null;
  } finally {
    clearTimeout(temporizador);
  }
}

document.getElementById("btn-buscar-isbn").addEventListener("click", async () => {
  limpiarMensaje();
  const campoIsbn = document.getElementById("isbn");

  // Se reutiliza el mismo regex del servidor antes de molestar al tercero.
  if (!revisarCampo(campoIsbn)) {
    panelExterno.hidden = true;  // que no quede a la vista un resultado viejo
    return;
  }

  const isbn = campoIsbn.value.trim().replace(/[-\s]/g, "");
  mostrarExterno(`<p class="buscando">${t("ext.searching")}</p>`, "neutro");

  try {
    const libro = await buscarEnOpenLibrary(isbn);

    if (!libro) {
      mostrarExterno(`<p>${t("ext.not_found")}</p>`, "aviso");
      return;
    }

    // Se rellena el formulario con lo que devolvió el servicio externo.
    document.getElementById("titulo").value = libro.title || "";
    document.getElementById("autor").value =
      (libro.author_name && libro.author_name[0]) || "";
    document.getElementById("anio").value = libro.first_publish_year || "";

    // Los campos rellenados se revalidan: lo que llega de fuera tampoco se
    // da por bueno sin comprobarlo.
    ["titulo", "autor", "anio"].forEach((id) =>
      revisarCampo(document.getElementById(id))
    );

    const portada = libro.cover_i
      ? `<img src="https://covers.openlibrary.org/b/id/${libro.cover_i}-M.jpg"
              alt="${escapar(libro.title)}" class="portada">`
      : `<div class="portada vacia">${t("ext.no_cover")}</div>`;

    mostrarExterno(`
      ${portada}
      <div>
        <p><strong>${t("ext.found", { title: escapar(libro.title) })}</strong></p>
        <p>${t("ext.filled")}</p>
        <p class="fuente">${t("ext.source")}</p>
      </div>
    `, "ok");
  } catch (error) {
    const clave = error.name === "AbortError" ? "ext.timeout" : "ext.error";
    mostrarExterno(`<p>${t(clave)}</p>`, "error");
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

const CLAVE_IDENTIDAD = "chat-identidad";

const formChatEntrar = document.getElementById("form-chat-entrar");
const formChatEnviar = document.getElementById("form-chat-enviar");
const salaChat = document.getElementById("chat-sala");
const listaMensajes = document.getElementById("chat-mensajes");
const estadoChat = document.getElementById("chat-estado");
const falloChat = document.getElementById("chat-fallo");

let socket = null;
let identidad = null;
let reconexion = null;

function guardarIdentidad(datos) {
  try {
    sessionStorage.setItem(CLAVE_IDENTIDAD, JSON.stringify(datos));
  } catch (e) { /* modo privado: se sigue sin recordar */ }
}

function leerIdentidad() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_IDENTIDAD) || "null");
  } catch (e) { return null; }
}

/** ¿Está la conexión realmente abierta? */
function chatConectado() {
  return socket && socket.readyState === WebSocket.OPEN;
}

/** Envía por el socket solo si está abierto; si no, avisa y no revienta. */
function enviarPorSocket(objeto) {
  if (!chatConectado()) {
    falloChat.textContent = t("chat.disconnected");
    falloChat.hidden = false;
    return false;
  }
  socket.send(JSON.stringify(objeto));
  return true;
}

/** Bloquea los controles mientras no haya conexión. */
function habilitarControles(activo) {
  document.getElementById("chat-texto").disabled = !activo;
  formChatEnviar.querySelector("button").disabled = !activo;
  formChatEntrar.querySelector("button").disabled = !activo;
}

function pintarEstado(clave, clase) {
  estadoChat.textContent = t(clave);
  estadoChat.className = "estado-conexion " + clase;
}

function anadirLinea(nodo) {
  const vacio = listaMensajes.querySelector(".vacio");
  if (vacio) vacio.remove();
  listaMensajes.appendChild(nodo);
  listaMensajes.scrollTop = listaMensajes.scrollHeight;
}

function pintarMensaje(m) {
  const mio = identidad && m.email === identidad.email;
  const li = document.createElement("li");
  li.className = "chat-mensaje" + (mio ? " mio" : "");
  li.innerHTML = `
    <span class="avatar" style="background:${escapar(m.color)}">${escapar(m.initial)}</span>
    <div class="burbuja">
      <p class="autor">${escapar(m.nickname)}${mio ? ` (${t("chat.you")})` : ""}
         <span class="hora">${escapar(m.at)}</span></p>
      <p class="texto">${escapar(m.text)}</p>
    </div>`;
  anadirLinea(li);
}

function pintarAviso(texto) {
  const li = document.createElement("li");
  li.className = "chat-aviso";
  li.textContent = texto;
  anadirLinea(li);
}

function conectar() {
  const protocolo = location.protocol === "https:" ? "wss:" : "ws:";
  const idioma = document.documentElement.lang || "es";
  socket = new WebSocket(`${protocolo}//${location.host}/ws/chat?lang=${idioma}`);

  socket.addEventListener("open", () => {
    pintarEstado("chat.connected", "ok");
    habilitarControles(true);
    falloChat.hidden = true;
    // Si ya había identidad guardada, se reenvía sin preguntar de nuevo.
    if (identidad) {
      socket.send(JSON.stringify({
        type: "join", name: identidad.nickname, email: identidad.email,
      }));
    }
  });

  socket.addEventListener("message", (evento) => {
    const datos = JSON.parse(evento.data);

    if (datos.type === "welcome") {
      listaMensajes.innerHTML = datos.history.length
        ? "" : `<li class="vacio">${t("chat.empty")}</li>`;
      datos.history.forEach(pintarMensaje);
      pintarConectados(datos.online);

    } else if (datos.type === "joined") {
      identidad = datos.identity;
      guardarIdentidad(identidad);
      entrarEnSala();

    } else if (datos.type === "message") {
      pintarMensaje(datos.message);

    } else if (datos.type === "system") {
      pintarAviso(t(datos.event === "join" ? "chat.joined" : "chat.left",
                    { nickname: datos.nickname }));

    } else if (datos.type === "online") {
      pintarConectados(datos.count);

    } else if (datos.type === "error") {
      falloChat.textContent = datos.error;
      falloChat.hidden = false;
    }
  });

  socket.addEventListener("close", () => {
    pintarEstado("chat.disconnected", "error");
    habilitarControles(false);
    // Reconexión sencilla: si el servidor se reinicia, el chat vuelve solo.
    clearTimeout(reconexion);
    reconexion = setTimeout(conectar, 2000);
  });

  socket.addEventListener("error", () => socket.close());
}

function pintarConectados(n) {
  document.getElementById("chat-conectados").textContent =
    t("chat.online", { count: n });
}

function entrarEnSala() {
  formChatEntrar.hidden = true;
  salaChat.hidden = false;
  document.getElementById("chat-yo").textContent = identidad.nickname;
  document.getElementById("chat-yo").style.background = identidad.color;
  document.getElementById("chat-texto").focus();
}

formChatEntrar.addEventListener("submit", (evento) => {
  evento.preventDefault();
  falloChat.hidden = true;
  if (!formularioValido(formChatEntrar)) return;

  enviarPorSocket({
    type: "join",
    name: document.getElementById("chat-apodo").value,
    email: document.getElementById("chat-correo").value,
  });
});

formChatEnviar.addEventListener("submit", (evento) => {
  evento.preventDefault();
  falloChat.hidden = true;

  const campo = document.getElementById("chat-texto");
  if (!campo.value.trim()) return;

  if (enviarPorSocket({ type: "message", text: campo.value })) {
    campo.value = "";
  }
});

document.getElementById("btn-chat-salir").addEventListener("click", () => {
  try { sessionStorage.removeItem(CLAVE_IDENTIDAD); } catch (e) {}
  identidad = null;
  salaChat.hidden = true;
  formChatEntrar.hidden = false;
  limpiarFormulario(formChatEntrar);
  // Cerrar y reabrir hace que el servidor avise de la salida a los demás.
  clearTimeout(reconexion);
  socket.close();
  setTimeout(conectar, 100);
});

function iniciarChat() {
  identidad = leerIdentidad();
  activarValidacion(formChatEntrar);
  if (identidad) entrarEnSala();
  pintarEstado("chat.connecting", "");
  habilitarControles(false);
  conectar();
}

// --- Formulario de préstamo -----------------------------------------------

const capaPrestamo = document.getElementById("capa-prestamo");
const formPrestamo = document.getElementById("form-prestamo");
let libroAPrestar = null;

function abrirFormularioPrestamo(bookId, boton) {
  libroAPrestar = bookId;
  const fila = boton.closest("tr");
  const titulo = fila.children[1].textContent.trim();

  document.getElementById("prestamo-libro").textContent =
    t("loanform.book") + ": " + titulo;

  limpiarFormulario(formPrestamo);
  capaPrestamo.hidden = false;
  document.getElementById("p-nombre").focus();
}

function cerrarFormularioPrestamo() {
  capaPrestamo.hidden = true;
  libroAPrestar = null;
}

document.getElementById("btn-cancelar-prestamo")
  .addEventListener("click", cerrarFormularioPrestamo);

// Cerrar pulsando fuera del cuadro o con la tecla Escape.
capaPrestamo.addEventListener("click", (e) => {
  if (e.target === capaPrestamo) cerrarFormularioPrestamo();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !capaPrestamo.hidden) cerrarFormularioPrestamo();
});

formPrestamo.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limpiarMensaje();

  if (!formularioValido(formPrestamo)) return;

  try {
    await api("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        book_id: libroAPrestar,
        borrower: document.getElementById("p-nombre").value,
        dni: document.getElementById("p-dni").value,
        email: document.getElementById("p-email").value,
        phone: document.getElementById("p-telefono").value,
      }),
    });
    cerrarFormularioPrestamo();
    mostrarMensaje(t("msg.loan_created"), "ok");
    await recargar();
  } catch (error) {
    // Si el servidor rechaza algo que el navegador dio por bueno, se ve aquí.
    mostrarMensaje(error.message, "error");
  }
});

// Cambiar de idioma: el servidor lo guarda en la sesión y se recarga la página
// para que también los textos fijos (los que pinta Jinja) vengan traducidos.
document.getElementById("selector-idioma").addEventListener("change", async (evento) => {
  await api(`/api/i18n/${evento.target.value}`, { method: "POST" });
  // Se navega SIN ?lang= en la URL: si se recargara tal cual, ese parámetro
  // volvería a imponer el idioma anterior y anularía el cambio recién hecho.
  window.location.href = window.location.pathname;
});

// Al abrir la página, la calculadora se rellena con la fecha de hoy.
document.getElementById("calc-fecha").value = new Date().toISOString().slice(0, 10);

/** Arranque: primero el catálogo de traducciones, después los datos. */
async function iniciar() {
  // El catálogo de idioma y los patrones de validación, antes de pintar nada.
  const [i18n, validacion] = await Promise.all([
    api("/api/i18n"),
    api("/api/validation-rules"),
  ]);

  mensajes = i18n.messages;
  reglas = validacion.patterns;
  document.documentElement.lang = i18n.lang;

  activarValidacion(formLibro);
  activarValidacion(formPrestamo);

  await recargar();
  iniciarChat();
}

iniciar();
