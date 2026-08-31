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

Códigos de respuesta: `200`/`201` correcto · `400` regla de negocio incumplida · `404` no existe.

---

## 5. Estructura de archivos

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
│   └── loan_service.py         #   Reglas de préstamo y devolución
│
└── presentation/               # CAPA DE PRESENTACIÓN
    ├── home_controller.py      #   Sirve la página
    ├── book_controller.py      #   /api/books
    ├── loan_controller.py      #   /api/loans
    ├── error_handlers.py       #   Errores de negocio -> códigos HTTP
    ├── templates/index.html
    └── static/{app.js, styles.css}
```
