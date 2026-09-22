# 📚 Biblioteca — Aplicación web con Arquitectura N-Capas

Catálogo de libros con préstamos y devoluciones, construido con **Python + Flask + SQLite**
para practicar la arquitectura en capas.

---

## Cómo ejecutarla

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Abrir **http://127.0.0.1:5001** — la primera vez se crea `library.db` con 6 libros de ejemplo.

Con Docker:

```bash
docker build -t biblioteca .
docker run -p 5001:5001 biblioteca
```

> Uso el puerto 5001 porque en macOS el 5000 lo ocupa AirPlay Receiver.
> Se puede cambiar con `PORT=8080` y la base de datos con `LIBRARY_DB=/ruta/otra.db`.

---

## La arquitectura

```
┌──────────────────────────────────────────────────────┐
│  presentation/   PRESENTACIÓN                        │
│  HTTP y HTML. Controladores, plantillas, i18n.       │
└─────────────────────────┬────────────────────────────┘
                          │ llama a
┌─────────────────────────▼────────────────────────────┐
│  business/       NEGOCIO                             │
│  Las reglas de la biblioteca. Ni HTTP ni SQL.        │
└─────────────────────────┬────────────────────────────┘
                          │ llama a
┌─────────────────────────▼────────────────────────────┐
│  data_access/    ACCESO A DATOS                      │
│  El único lugar del proyecto donde se escribe SQL.   │
└─────────────────────────┬────────────────────────────┘
                          │ consulta
┌─────────────────────────▼────────────────────────────┐
│  library.db      SQLite — tablas books y loans       │
└──────────────────────────────────────────────────────┘

entities/  Book y Loan: el modelo que comparten las tres capas.
```

**La regla:** cada capa solo conoce a la de abajo. Se puede comprobar sobre el código —
las tres búsquedas salen vacías:

```bash
grep -rn "sqlite3\|Repository" presentation/   # la presentación no toca la BD
grep -rn "flask\|session"      business/       # el negocio no conoce la web
grep -rn "business"            data_access/    # los datos no conocen el negocio
```

### Recorrido de una petición

Al pulsar **Prestar**:

| Capa | Qué hace |
|---|---|
| Navegador | `POST /api/loans` con los datos del prestatario |
| Presentación | `loan_controller` lee el JSON y llama al servicio |
| Negocio | `LoanService` valida y comprueba que el libro **esté disponible** |
| Acceso a datos | `INSERT INTO loans` + `UPDATE books SET available = 0` |
| Presentación | Devuelve el préstamo como JSON con un `201` |

Si el libro ya estaba prestado, el negocio lanza un `BusinessError`, no se escribe nada y
`error_handlers` lo convierte en un `400` traducido al idioma del usuario.

---

## Qué implementa

| Tema | Dónde | En una línea |
|---|---|---|
| **Reglas de negocio** | `business/book_service.py`<br>`business/loan_service.py` | Un libro solo se presta si está disponible; no se elimina un libro prestado; un préstamo no se devuelve dos veces |
| **Funciones sin estado** | `business/library_calculator.py` | `calculate_due_date` y `calculate_fine`: puras, misma entrada → misma salida |
| **Funciones con estado** | `business/activity_service.py`<br>`business/wishlist_service.py` | Contadores en la RAM del servidor y lista de deseos en la sesión del usuario |
| **Internacionalización** | `presentation/i18n/` | Español e inglés con menú desplegable. El negocio lanza claves de error; la presentación las traduce |
| **Validación con regex** | `business/validators.py` | 8 patrones definidos una sola vez y publicados en `/api/validation-rules` para que el navegador use los mismos |
| **Servicio externo** | `presentation/static/app.js` | El navegador consulta Open Library por ISBN y rellena el formulario, sin pasar por Flask |

Dos detalles que conviene entender:

- **La validación del navegador es comodidad; la del servidor es la que manda.** Llamar a la
  API con `curl` salta el formulario, pero no los regex.
- **El regex valida el formato, no el significado.** El año `3000` pasa `^\d{4}$` y aun así
  lo rechaza la regla de negocio por estar fuera de rango.

---

## La API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | La página web |
| `GET` | `/api/books` | Lista libros (`?available=true` filtra) |
| `GET` `POST` | `/api/books` `/api/books/<id>` | Obtener y crear — `{title, author, year, isbn}` |
| `PUT` `DELETE` | `/api/books/<id>` | Actualizar y eliminar |
| `GET` | `/api/loans` | Préstamos activos e historial |
| `POST` | `/api/loans` | Prestar — `{book_id, borrower, dni, email, phone}` |
| `POST` | `/api/loans/<id>/return` | Registrar la devolución |
| `GET` | `/api/tools/due-date` · `/api/tools/fine` | *Stateless* — vencimiento y multa |
| `GET` `POST` | `/api/activity` · `/api/activity/reset` | *Stateful* — contadores del servidor |
| `GET` `POST` `DELETE` | `/api/wishlist` · `/api/wishlist/<id>` | *Stateful* — lista de deseos de la sesión |
| `GET` `POST` | `/api/i18n` · `/api/i18n/<lang>` | Catálogo de traducciones e idioma elegido |
| `GET` | `/api/validation-rules` | Los patrones regex, para el navegador |

`200`/`201` correcto · `400` regla de negocio incumplida · `404` no existe.

Aparte de esta API, el navegador llama a un servicio externo:
`GET https://openlibrary.org/search.json?q=isbn:…`

---

## Estructura del proyecto

```
App-N-Capas/
├── app.py                      # Ensambla las capas y arranca Flask
├── requirements.txt · Dockerfile
│
├── entities/                   # ENTIDADES
│   └── book.py · loan.py
│
├── data_access/                # ACCESO A DATOS
│   ├── database.py             #   Conexión, esquema, migraciones y datos de ejemplo
│   └── book_repository.py · loan_repository.py
│
├── business/                   # NEGOCIO
│   ├── book_service.py · loan_service.py
│   ├── validators.py           #   Los patrones regex
│   ├── library_calculator.py   #   Funciones sin estado
│   ├── activity_service.py     #   Estado en memoria
│   ├── wishlist_service.py     #   Estado de sesión
│   └── exceptions.py           #   Errores con clave de mensaje
│
└── presentation/               # PRESENTACIÓN
    ├── i18n/                   #   es.json · en.json · translate()
    ├── *_controller.py         #   books · loans · tools · activity · wishlist · i18n · validation
    ├── error_handlers.py       #   Clave de error → HTTP + idioma
    ├── templates/index.html
    └── static/app.js · styles.css
```
