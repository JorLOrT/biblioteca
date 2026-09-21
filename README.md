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
| `POST` | `/api/books` | Crea un libro — `{title, author, year, isbn}` |
| `PUT` | `/api/books/<id>` | Actualiza un libro |
| `DELETE` | `/api/books/<id>` | Elimina un libro |
| `GET` | `/api/loans` | Lista los préstamos (activos e historial) |
| `POST` | `/api/loans` | Presta un libro — `{book_id, borrower, dni, email, phone}` |
| `POST` | `/api/loans/<id>/return` | Registra la devolución |
| `GET` | `/api/tools/due-date` | *Stateless* — calcula el vencimiento de un préstamo |
| `GET` | `/api/tools/fine` | *Stateless* — calcula los días de retraso y la multa |
| `GET` | `/api/activity` | *Stateful* — contadores en la memoria del servidor |
| `POST` | `/api/activity/reset` | *Stateful* — pone los contadores a cero |
| `GET` | `/api/wishlist` | *Stateful* — la lista de deseos de tu sesión |
| `POST` | `/api/wishlist/<id>` | *Stateful* — añade o quita un libro de tu lista |
| `DELETE` | `/api/wishlist` | *Stateful* — vacía tu lista |
| `GET` | `/api/i18n` | Catálogo de traducciones del idioma actual |
| `POST` | `/api/i18n/<lang>` | Guarda el idioma elegido en la sesión |
| `GET` | `/api/validation-rules` | Expresiones regulares de validación, para el navegador |

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

## 6. Internacionalización (i18n)

La aplicación está disponible en **español e inglés**, incluidos los mensajes de error.

### Dónde vive el idioma

El idioma es una cuestión de **presentación**, no de negocio. Por eso el módulo de traducción está
dentro de `presentation/i18n/` y la capa de negocio nunca escribe texto en un idioma concreto:
lanza una **clave** de mensaje y sus parámetros.

```python
# business/loan_service.py — el negocio solo dice QUÉ pasó
raise BusinessError("error.book_already_lent", title=book.title, borrower=holder)

# presentation/error_handlers.py — la presentación decide CÓMO contarlo
{"error": translate(error.key, **error.params), "code": error.key}
```

Gracias a esto, `grep -rn "i18n\|translate" business/` no devuelve nada: el negocio no sabe en qué
idioma se le hablará al usuario.

### Cómo se elige el idioma

1. `?lang=en` en la URL (además lo guarda en la sesión)
2. el idioma guardado en la sesión
3. la cabecera `Accept-Language` del navegador
4. español por defecto

### Añadir un idioma nuevo

No hace falta tocar Python: se copia `presentation/i18n/es.json`, se traduce y se añade el código a
`SUPPORTED` en `presentation/i18n/__init__.py`.

```bash
# El mismo error de negocio, en los dos idiomas
curl -X POST 'localhost:5001/api/loans?lang=es' -H 'Content-Type: application/json' \
     -d '{"book_id":1,"borrower":"Ana"}'
# -> {"code":"error.book_already_lent","error":"El libro «...» ya está prestado a Luis."}

curl -X POST 'localhost:5001/api/loans?lang=en' -H 'Content-Type: application/json' \
     -d '{"book_id":1,"borrower":"Ana"}'
# -> {"code":"error.book_already_lent","error":"The book \"...\" is already on loan to Luis."}
```

---

## 7. Validación de formularios con expresiones regulares

Los dos formularios de la aplicación se validan con **regex**: el de alta de libros y el de
préstamo (que sustituye al antiguo `prompt()`).

### Una sola fuente de verdad

Los patrones se definen **una vez**, en la capa de negocio ([business/validators.py](business/validators.py)),
y la capa de presentación los publica en `GET /api/validation-rules` para que el navegador use
exactamente los mismos. Así no pueden quedar desincronizados.

| Campo | Expresión regular | Qué acepta |
|---|---|---|
| `title` | `^(?!\s*$).{2,120}$` | 2–120 caracteres, no solo espacios |
| `author` | `^[A-Za-zÁÉÍ…][A-Za-zÁÉÍ….'\- ]{2,79}$` | Letras, espacios, puntos, apóstrofos y guiones |
| `year` | `^\d{4}$` | Exactamente cuatro cifras |
| `isbn` | `^97[89][-\s]?(?:\d[-\s]?){9}\d$` | ISBN-13 con separadores opcionales |
| `borrower` | `^[A-Za-zÁÉÍ…]{2,}(?: [A-Za-zÁÉÍ…]{2,})+$` | Dos palabras o más, sin cifras |
| `dni` | `^\d{8}$` | DNI peruano, ocho cifras |
| `email` | `^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$` | Correo electrónico |
| `phone` | `^9\d{8}$` | Celular peruano, nueve cifras desde 9 |

### Dos barreras, una autoridad

El navegador valida **para avisar**; el servidor valida **porque manda**. Saltarse el JavaScript no
sirve de nada:

```bash
curl -X POST localhost:5001/api/loans -H 'Content-Type: application/json' \
     -d '{"book_id":2,"borrower":"Ana","dni":"123","email":"ana.pe","phone":"12345"}'
# -> 400 {"code":"error.invalid_borrower",
#         "error":"El nombre debe tener al menos dos palabras y ninguna cifra."}
```

Los mensajes están internacionalizados como el resto: el negocio lanza `error.invalid_dni` y la
presentación lo traduce al idioma del usuario.

### Formato y significado son cosas distintas

El regex comprueba el **formato**; la regla de negocio comprueba el **significado**. Por eso el año
`3000` pasa el regex (son cuatro cifras) y aun así se rechaza:

```bash
# -> 400 "El año debe estar entre 1450 y 2026."
```

---

## 8. Documentación y capturas

- `capturas/` — 14 capturas de la ejecución (español, inglés, errores traducidos, stateless,
  stateful y validación por regex).
- `Internacionalizacion_i18n.docx` — memoria del trabajo con esas capturas.
- `docs/generar_documento.py` — regenera el documento: `.venv/bin/python docs/generar_documento.py`
  (requiere `pip install -r docs/requirements.txt`).

Las capturas se toman de forma automatizada contra una base de datos aparte, sin tocar la real:

```bash
LIBRARY_DB=/tmp/demo.db PORT=5003 .venv/bin/python app.py
```

---

## 9. Estructura de archivos

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
│   ├── validators.py           #   VALIDACIÓN POR REGEX (fuente de verdad)
│   ├── library_calculator.py   #   STATELESS: cálculos puros
│   ├── activity_service.py     #   STATEFUL: contadores en memoria
│   └── wishlist_service.py     #   STATEFUL: lista de deseos (sesión)
│
└── presentation/               # CAPA DE PRESENTACIÓN
    ├── i18n/                   #   INTERNACIONALIZACIÓN
    │   ├── __init__.py         #     elección de idioma + translate()
    │   ├── es.json             #     catálogo español (86 claves)
    │   └── en.json             #     catálogo inglés  (86 claves)
    ├── i18n_controller.py      #   /api/i18n
    ├── validation_controller.py#   /api/validation-rules
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
