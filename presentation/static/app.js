// Cliente de la API REST. Solo habla HTTP con la capa de presentación:
// no conoce ni las reglas de negocio ni la base de datos.

const mensaje = document.getElementById("mensaje");
const tablaLibros = document.getElementById("tabla-libros");
const tablaPrestamos = document.getElementById("tabla-prestamos");
const panelActividad = document.getElementById("actividad");
const panelDeseos = document.getElementById("lista-deseos");
const resultadoCalculo = document.getElementById("resultado-calculo");

let deseos = []; // copia local de la lista de deseos que guarda la sesión

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
    throw new Error(datos.error || "Ocurrió un error inesperado.");
  }
  return datos;
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto == null ? "" : texto;
  return div.innerHTML;
}

const soles = (valor) => "S/ " + Number(valor).toFixed(2);

// --- Pintado de las tablas -------------------------------------------------

function pintarLibros(libros) {
  if (libros.length === 0) {
    tablaLibros.innerHTML = '<tr><td colspan="6" class="vacio">No hay libros en el catálogo.</td></tr>';
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
        <td>
          <span class="badge ${libro.available ? "disponible" : "prestado"}">
            ${libro.available ? "Disponible" : "Prestado"}
          </span>
        </td>
        <td class="acciones">
          <button class="estrella ${deseado ? "activa" : ""}" data-deseo="${libro.id}"
                  title="${deseado ? "Quitar de mi lista" : "Añadir a mi lista"}">
            ${deseado ? "★" : "☆"}
          </button>
          ${libro.available ? `<button data-prestar="${libro.id}">Prestar</button>` : ""}
          <button class="peligro" data-eliminar="${libro.id}">Eliminar</button>
        </td>
      </tr>
    `;
  }).join("");
}

function pintarPrestamos(prestamos) {
  if (prestamos.length === 0) {
    tablaPrestamos.innerHTML = '<tr><td colspan="7" class="vacio">Todavía no se ha prestado ningún libro.</td></tr>';
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
          ? `<span class="badge prestado">${p.days_late} d · ${soles(p.fine)}</span>`
          : ""}
      </td>
      <td>${p.return_date || "—"}</td>
      <td class="acciones">
        ${p.is_active ? `<button class="secundario" data-devolver="${p.id}">Devolver</button>` : ""}
      </td>
    </tr>
  `).join("");
}

// --- Paneles con estado ----------------------------------------------------

function pintarActividad(datos) {
  const nombres = {
    prestamos: "Préstamos",
    devoluciones: "Devoluciones",
    libros_registrados: "Libros registrados",
    libros_eliminados: "Libros eliminados",
  };

  const filas = Object.entries(datos.counters)
    .map(([clave, valor]) => `
      <li><span>${nombres[clave] || clave}</span><strong>${valor}</strong></li>
    `).join("");

  panelActividad.innerHTML = `
    <ul class="contadores">
      ${filas || '<li class="vacio">Sin actividad todavía.</li>'}
    </ul>
    <p class="pie">
      Total de acciones: <strong>${datos.total}</strong>
      ${datos.last_action ? ` · última: ${escapar(datos.last_action)} a las ${datos.last_action_at}` : ""}
    </p>
  `;
}

function pintarDeseos(datos) {
  deseos = datos.book_ids;

  panelDeseos.innerHTML = datos.books.length === 0
    ? '<p class="vacio">Tu lista está vacía.</p>'
    : `<ul class="chips">${datos.books.map((libro) =>
        `<li>${escapar(libro.title)}</li>`).join("")}</ul>`;

  panelDeseos.innerHTML += `<p class="pie">${datos.books.length} de ${datos.max} libros.</p>`;
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

document.getElementById("form-libro").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limpiarMensaje();

  const titulo = document.getElementById("titulo");
  const autor = document.getElementById("autor");
  const anio = document.getElementById("anio");

  try {
    await api("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titulo.value,
        author: autor.value,
        year: anio.value,
      }),
    });
    titulo.value = autor.value = anio.value = "";
    mostrarMensaje("Libro agregado al catálogo.", "ok");
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

    let html = `Prestado el <strong>${vencimiento.loan_date}</strong> con
                ${vencimiento.days} días de plazo →
                vence el <strong>${vencimiento.due_date}</strong>.`;

    if (devolucion) {
      const multa = await api(
        `/api/tools/fine?due_date=${vencimiento.due_date}&reference_date=${devolucion}`
      );
      html += multa.days_late > 0
        ? `<br>Devuelto el ${devolucion}: <strong>${multa.days_late} días</strong>
           de retraso → multa de <strong>${soles(multa.fine)}</strong>
           (${soles(multa.daily_rate)} por día).`
        : `<br>Devuelto el ${devolucion}: dentro del plazo, sin multa.`;
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
    mostrarMensaje("Contadores del servidor reiniciados.", "ok");
    await recargar();
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
});

document.getElementById("btn-vaciar-deseos").addEventListener("click", async () => {
  limpiarMensaje();
  try {
    await api("/api/wishlist", { method: "DELETE" });
    mostrarMensaje("Lista de deseos vaciada.", "ok");
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
          ? "Libro añadido a tu lista de deseos."
          : "Libro quitado de tu lista de deseos.",
        "ok"
      );
    } else if (prestar) {
      const persona = prompt("¿A quién se le presta el libro?");
      if (persona === null) return;
      await api("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: Number(prestar), borrower: persona }),
      });
      mostrarMensaje("Préstamo registrado.", "ok");
    } else if (devolver) {
      await api(`/api/loans/${devolver}/return`, { method: "POST" });
      mostrarMensaje("Libro devuelto al catálogo.", "ok");
    } else {
      if (!confirm("¿Eliminar este libro del catálogo?")) return;
      await api(`/api/books/${eliminar}`, { method: "DELETE" });
      mostrarMensaje("Libro eliminado.", "ok");
    }
    await recargar();
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
});

// Al abrir la página, la calculadora se rellena con la fecha de hoy.
document.getElementById("calc-fecha").value = new Date().toISOString().slice(0, 10);

recargar();
