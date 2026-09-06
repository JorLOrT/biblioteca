# 📚 Biblioteca — Aplicación web con Arquitectura N-Capas

Aplicación web de un catálogo de libros con préstamos y devoluciones.

Construida con **Python + Flask + SQLite**.

---

## 1. La arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│  presentation/     CAPA DE PRESENTACIÓN                      │
│  Recibe peticiones HTTP y devuelve JSON o HTML.              │
│  book_controller · loan_controller · home_controller         │
│  error_handlers · templates/ · static/                       │
└───────────────────────────┬──────────────────────────────────┘
                            │ llama a
┌───────────────────────────▼──────────────────────────────────┐
│  business/         CAPA DE NEGOCIO                           │
│  Valida los datos y aplica las reglas de la biblioteca.      │
│  BookService · LoanService · BusinessError                   │
└───────────────────────────┬──────────────────────────────────┘
                            │ llama a
┌───────────────────────────▼──────────────────────────────────┐
│  data_access/      CAPA DE ACCESO A DATOS                    │
│  Único lugar del proyecto donde se escribe SQL.              │
│  BookRepository · LoanRepository · database                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ consulta
┌───────────────────────────▼──────────────────────────────────┐
│  library.db        BASE DE DATOS (SQLite)                    │
│  Tablas: books · loans                                       │
└──────────────────────────────────────────────────────────────┘

```

### Las tres reglas que se respetan

**1. Dependencia unidireccional hacia abajo.** Una capa solo conoce a la que tiene inmediatamente
debajo. La capa de datos no sabe que existe una web; la capa de negocio no sabe qué es un código
HTTP 400. 

### Recorrido de una petición

Qué ocurre cuando alguien pulsa **Prestar** en la interfaz:

| # | Capa | Qué hace |
|---|------|----------|
| 1 | Navegador | `POST /api/loans` con `{"book_id": 1, "borrower": "Juan"}` |
| 2 | **Presentación** — `loan_controller.lend_book()` | Lee el JSON y llama a `LoanService.lend_book()` |
| 3 | **Negocio** — `LoanService.lend_book()` | Valida el nombre, pide el libro al repositorio y comprueba que **esté disponible** |
| 4 | **Acceso a datos** — `LoanRepository.create()` | `INSERT INTO loans ...` |
| 5 | **Acceso a datos** — `BookRepository.update()` | `UPDATE books SET available = 0 ...` |
| 6 | **Presentación** | Convierte la entidad `Loan` a JSON y responde `201` |

Si el libro ya estaba prestado, el paso 3 lanza un `BusinessError`, los pasos 4 y 5 nunca se
ejecutan, y `error_handlers` lo traduce a un `400` con el mensaje que se ve en pantalla.

---

## 2. Reglas de negocio

Todas viven en `business/`.

**Libros** (`BookService`)
- El título y el autor son obligatorios.
- El año debe estar entre 1450 (imprenta de Gutenberg) y el año actual.
- Un libro recién registrado entra siempre como disponible.
- No se puede eliminar un libro que alguien tiene prestado.

**Préstamos** (`LoanService`)
- **Un libro solo se puede prestar si está disponible** ← la regla central.
- El nombre de quien se lleva el libro es obligatorio.
- Al prestar, el libro pasa a *no disponible*; al devolverlo, vuelve a *disponible*.
- Un préstamo ya devuelto no se puede devolver otra vez.

---

## 3. Cómo ejecutarla

### Opción A — Python local

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Abrir **http://127.0.0.1:5001**

### Opción B — Docker

```bash
docker build -t biblioteca .
docker run -p 5001:5001 biblioteca. # usé mac por eso el puerto
```

La primera vez se crea `library.db` con **6 libros de ejemplo**.

---

## 4. La API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | La página web de la biblioteca |
| `GET` | `/api/books` | Lista los libros (`?available=true` filtra los disponibles) |
| `GET` | `/api/books/<id>` | Obtiene un libro |
| `POST` | `/api/books` | Crea un libro — `{title, author, year}` |
| `PUT` | `/api/books/<id>` | Actualiza un libro |
| `DELETE` | `/api/books/<id>` | Elimina un libro |
| `GET` | `/api/loans` | Lista los préstamos (activos e historial) |
| `POST` | `/api/loans` | Presta un libro — `{book_id, borrower}` |
| `POST` | `/api/loans/<id>/return` | Registra la devolución |
| `GET` | `/api/tools/due-date` | *Stateless* — calcula el vencimiento de un préstamo |
| `GET` | `/api/tools/fine` | *Stateless* — calcula los días de retraso y la multa |
| `GET` | `/api/activity` | *Stateful* — contadores en la memoria del servidor |
| `POST` | `/api/activity/reset` | *Stateful* — pone los contadores a cero |
| `GET` | `/api/wishlist` | *Stateful* — la lista de deseos de tu sesión |
| `POST` | `/api/wishlist/<id>` | *Stateful* — añade o quita un libro de tu lista |
| `DELETE` | `/api/wishlist` | *Stateful* — vacía tu lista |

Códigos de respuesta: `200`/`201` correcto · `400` regla de negocio incumplida · `404` no existe.

---

## 5. Funciones stateful y stateless

La aplicación incluye dos funciones de cada tipo, para ver el contraste.

### Sin estado (*stateless*) — `business/library_calculator.py`

Funciones **puras**: el resultado depende únicamente de los argumentos. No leen ni escriben la base
de datos, no miran la sesión, no consultan el reloj y no recuerdan nada entre llamadas.

| Función | Qué hace |
|---|---|
| `calculate_due_date(loan_date, days)` | Fecha límite para devolver un libro |
| `calculate_fine(due_date, reference_date)` | Días de retraso y multa acumulada |

Se usan de verdad en `LoanService.list_loans()`, que calcula el vencimiento y la multa de cada
préstamo antes de devolverlos. La prueba de que no tienen estado es que la misma petición siempre
responde lo mismo:

```bash
curl "localhost:5001/api/tools/due-date?loan_date=2026-03-01&days=15"
# -> {"due_date": "2026-03-16", ...}   por muchas veces que la repitas

curl "localhost:5001/api/tools/fine?due_date=2026-03-16&reference_date=2026-03-20"
# -> {"days_late": 4, "fine": 2.0}
```

### Con estado (*stateful*)

Aquí el resultado depende de lo que ocurrió antes, no solo de los argumentos.

**1. `activity_service.record(action)` — memoria del servidor, compartida.**
Los contadores viven en una variable de módulo protegida con un `Lock`. Los ve igual cualquiera que
abra la aplicación y se pierden al reiniciar el proceso, porque no están en la base de datos.

```bash
curl localhost:5001/api/activity
# -> {"counters": {"prestamos": 2, "devoluciones": 1}, "total": 3, ...}
```

**2. `WishlistService.toggle(wishlist, book_id)` — sesión, propia de cada usuario.**
La lista de deseos se guarda en una cookie de sesión firmada, así que cada navegador tiene la suya y
se conserva entre peticiones. La misma llamada añade la primera vez y quita la segunda:

```bash
curl -c cookies -b cookies -X POST localhost:5001/api/wishlist/4   # -> {"book_ids": [4],  "in_wishlist": true}
curl -c cookies -b cookies -X POST localhost:5001/api/wishlist/4   # -> {"book_ids": [],   "in_wishlist": false}
```

---

## 6. Estructura de archivos

```
App-N-Capas/
├── app.py                      # Ensambla las capas y arranca Flask
├── requirements.txt
├── Dockerfile
├── library.db                  # Se genera al primer arranque
│
├── entities/                   # CAPA DE ENTIDADES
│   ├── book.py                 #   Book
│   └── loan.py                 #   Loan
│
├── data_access/                # CAPA DE ACCESO A DATOS
│   ├── database.py             #   Conexión, esquema y datos de ejemplo
│   ├── book_repository.py      #   SQL de la tabla books
│   └── loan_repository.py      #   SQL de la tabla loans
│
├── business/                   # CAPA DE NEGOCIO
│   ├── exceptions.py           #   BusinessError, NotFoundError
│   ├── book_service.py         #   Reglas del catálogo
│   ├── loan_service.py         #   Reglas de préstamo y devolución
│   ├── library_calculator.py   #   STATELESS: cálculos puros
│   ├── activity_service.py     #   STATEFUL: contadores en memoria
│   └── wishlist_service.py     #   STATEFUL: lista de deseos (sesión)
│
└── presentation/               # CAPA DE PRESENTACIÓN
    ├── home_controller.py      #   Sirve la página
    ├── book_controller.py      #   /api/books
    ├── loan_controller.py      #   /api/loans
    ├── tools_controller.py     #   /api/tools    (stateless)
    ├── activity_controller.py  #   /api/activity (stateful)
    ├── wishlist_controller.py  #   /api/wishlist (stateful, sesión)
    ├── error_handlers.py       #   Errores de negocio -> códigos HTTP
    ├── templates/index.html
    └── static/{app.js, styles.css}
```
