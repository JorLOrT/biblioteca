// Cliente de la API REST. Solo habla HTTP con la capa de presentación:
// no conoce ni las reglas de negocio ni la base de datos.

const mensaje = document.getElementById("mensaje");
const tablaLibros = document.getElementById("tabla-libros");
const tablaPrestamos = document.getElementById("tabla-prestamos");

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

// --- Pintado de las tablas -------------------------------------------------

function pintarLibros(libros) {
  if (libros.length === 0) {
    tablaLibros.innerHTML = '<tr><td colspan="6" class="vacio">No hay libros en el catálogo.</td></tr>';
    return;
  }

  tablaLibros.innerHTML = libros.map((libro) => `
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
        ${libro.available ? `<button data-prestar="${libro.id}">Prestar</button>` : ""}
        <button class="peligro" data-eliminar="${libro.id}">Eliminar</button>
      </td>
    </tr>
  `).join("");
}

function pintarPrestamos(prestamos) {
  if (prestamos.length === 0) {
    tablaPrestamos.innerHTML = '<tr><td colspan="6" class="vacio">Todavía no se ha prestado ningún libro.</td></tr>';
    return;
  }

  tablaPrestamos.innerHTML = prestamos.map((prestamo) => `
    <tr>
      <td>${prestamo.id}</td>
      <td>${escapar(prestamo.book_title)}</td>
      <td>${escapar(prestamo.borrower)}</td>
      <td>${prestamo.loan_date}</td>
      <td>${prestamo.return_date || "—"}</td>
      <td class="acciones">
        ${prestamo.is_active ? `<button class="secundario" data-devolver="${prestamo.id}">Devolver</button>` : ""}
      </td>
    </tr>
  `).join("");
}

async function recargar() {
  const [libros, prestamos] = await Promise.all([
    api("/api/books"),
    api("/api/loans"),
  ]);
  pintarLibros(libros);
  pintarPrestamos(prestamos);
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

document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("button");
  if (!boton) return;

  const idPrestar = boton.dataset.prestar;
  const idEliminar = boton.dataset.eliminar;
  const idDevolver = boton.dataset.devolver;
  if (!idPrestar && !idEliminar && !idDevolver) return;

  limpiarMensaje();

  try {
    if (idPrestar) {
      const persona = prompt("¿A quién se le presta el libro?");
      if (persona === null) return;
      await api("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: Number(idPrestar), borrower: persona }),
      });
      mostrarMensaje("Préstamo registrado.", "ok");
    } else if (idDevolver) {
      await api(`/api/loans/${idDevolver}/return`, { method: "POST" });
      mostrarMensaje("Libro devuelto al catálogo.", "ok");
    } else {
      if (!confirm("¿Eliminar este libro del catálogo?")) return;
      await api(`/api/books/${idEliminar}`, { method: "DELETE" });
      mostrarMensaje("Libro eliminado.", "ok");
    }
    await recargar();
  } catch (error) {
    mostrarMensaje(error.message, "error");
  }
});

recargar();
