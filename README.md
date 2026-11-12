# 📚 Biblioteca — Aplicación web con Arquitectura N-Capas

Catálogo de libros con préstamos y devoluciones, construido con **Python + Flask + SQLite**
para practicar la arquitectura en capas. Tiene dos vistas: la del **bibliotecario**, que presta,
recibe, mantiene el catálogo y crea las cuentas de los lectores, y la del **lector**, que consulta
qué hay, ve su carnet, guarda su lista y habla con la biblioteca por un chat privado.

---

## Cómo ejecutarla

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
.venv/bin/python app.py
```

Abrir **http://127.0.0.1:5001** — la primera vez se crea `library.db` con 6 libros de ejemplo y
estas cuentas de prueba (la pantalla de inicio de sesión las muestra para entrar con un clic):

| Usuario | Contraseña | Papel | Para probar |
|---|---|---|---|
| `jorge` | `jorge123` | Bibliotecario | |
| `pepito` | `pepito123` | Lector | Carnet vigente por un año |
| `juanita` | `juanita123` | Lector | Carnet ya vencido: no se le presta hasta renovarlo |

La `SECRET_KEY` firma la cookie de sesión. No hay una por defecto escrita en el código: si
falta, la aplicación se niega a arrancar.

Con Docker (la imagen usa Gunicorn y guarda la base de datos en `/data`):

```bash
docker build -t biblioteca .
docker run -p 5001:5001 -e SECRET_KEY="$SECRET_KEY" -v biblioteca-datos:/data biblioteca
```

| Variable | Por defecto | Para qué |
|---|---|---|
| `SECRET_KEY` | — (obligatoria) | Firmar la cookie de sesión |
| `HOST` | `127.0.0.1` | Interfaz donde escucha `python app.py`. En Docker, `0.0.0.0` |
| `PORT` | `5001` | En macOS el 5000 lo ocupa AirPlay Receiver |
| `FLASK_DEBUG` | apagado | Con `1`, recarga automática y depurador. Nunca en producción |
| `LIBRARY_DB` | `library.db` | Otra base de datos. En Docker, `/data/library.db` |
| `SESSION_COOKIE_SECURE` | apagado | Con `1`, la cookie de sesión solo viaja por HTTPS |
| `TZ` | `America/Lima` (Docker) | Zona horaria de las fechas de préstamo, vencimientos y multas |
| `COUNTRIES_API_URL` | `https://countries.dev` | Dirección del servicio de países |
| `JWT_EXPIRES_MINUTES` | `60` | Minutos que vale un token de `/api/auth/token` |
| `GUNICORN_THREADS` | `100` | Conexiones a la vez en Docker; cada chat abierto ocupa una |

---

## Las dos vistas

**Bibliotecario.** Arriba, la actividad del servidor (préstamos, devoluciones y cambios del
catálogo desde que arrancó). Debajo, tres pestañas:

- **Préstamos**: los libros que están fuera, con quién los tiene, su carnet, cómo contactarlo y
  cuánto falta para que venzan; los vencidos salen primero, con su multa. *Registrar devolución*
  confirma el libro, la persona y la multa antes de cerrarlo.
- **Catálogo**: cada libro con su portada, su ISBN y su estado, con búsqueda por título, autor o
  ISBN (sin distinguir mayúsculas ni tildes). Se presta, se recibe, se edita o se elimina desde
  su fila. *Agregar libro* empieza por el ISBN: en cuanto es válido, los datos llegan solos de
  Open Library.
- **Lectores**: sus cuentas, con DNI, celular, correo y carnet. *Nuevo lector* pide esos datos y
  crea la cuenta con un carnet numerado y su fecha de vigencia; desde cada fila se presta, se
  renueva el carnet, se editan los datos o se le escribe.

*Nuevo préstamo* deja elegir el libro y el lector: sus datos se rellenan solos desde su cuenta
y se ve, antes de registrar, si se le puede prestar. Para eso su carnet tiene que estar vigente
y no puede tener ya otro libro; el servidor lo vuelve a comprobar.

Al lado, siempre, el chat: una conversación privada por lector, con los mensajes sin leer y
quién está conectado.

**Lector.** Arriba, su carnet: si está vigente y qué libro tiene, con su vencimiento. Debajo, el
catálogo con portadas y búsqueda: qué está disponible y cuándo vuelve lo prestado, sin ver a
quién. Marca ☆ para guardar un libro en *Mi lista*, y *Pedir* deja escrito en su chat un mensaje
al bibliotecario con el título y el ISBN (si ahora no se le puede prestar, el botón dice por
qué). *Plazos y multas* calcula hasta cuándo tendría el libro y cuánto pagaría si lo devolviera
tarde.

**Países e idiomas.** Desde la barra superior, para los dos papeles. Dos listas desplegables
encadenadas: al elegir la **región** (África, América, Asia, Europa, Oceanía o Antártida) se
vuelve a llenar la lista de **países**, y al elegir un país aparece una tabla con sus
**idiomas** y el **nombre nativo** de cada uno (Bolivia: español → *Español*, aimara → *aymar
aru*, quechua → *Runa Simi*), junto con el nombre del país en su propia lengua. Los datos vienen
del servicio externo [countries.dev](https://countries.dev) (antes apicountries.com); la lista
de regiones es fija.

Las dos vistas se actualizan solas: cuando se presta o se devuelve un libro, o cambia un lector,
el servidor avisa por el WebSocket y cada navegador vuelve a pedir los datos.

---

## Pruebas de punta a punta, en paralelo

En `e2e/` hay 22 pruebas con [Playwright](https://playwright.dev). Catorce usan la aplicación
desde Chrome como lo haría una persona: inicio de sesión, búsqueda en el catálogo, la vista de
países y el token Bearer que envía el navegador. Las otras ocho llaman a la API con un JWT,
sin navegador. Playwright arranca la aplicación sola, en los puertos 5055 y 5056, con una base de
datos nueva, y la apaga al terminar.

```bash
cd e2e
npm install
PYTHON=../.venv/bin/python npx playwright test             # 4 workers a la vez
PYTHON=../.venv/bin/python npx playwright test --workers=1 # una tras otra, para comparar
npx playwright show-report                                 # el reporte HTML
```

Cada worker es un proceso con su propio navegador, y cada prueba recibe un contexto nuevo
con sus propias cookies, así que dos pruebas pueden entrar con la misma cuenta a la vez. Con
`fullyParallel` el reparto es prueba a prueba, no archivo a archivo. Cada prueba guarda una
captura en `e2e/evidencia/pruebas/` con el worker que la ejecutó y la hora. El reporter
`reporters/linea-de-tiempo.js` imprime qué worker ejecutó cada prueba y escribe
`e2e/evidencia/linea-de-tiempo-<n>-workers.html`. Usa el Google Chrome instalado: no hace
falta descargar navegadores.

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
│  El único lugar con SQL o con URLs de otro servicio. │
└─────────────────────────┬────────────────────────────┘
                          │ consulta
┌─────────────────────────▼────────────────────────────┐
│  library.db      SQLite — tablas books, loans, users │
│  countries.dev   API REST de países e idiomas        │
└──────────────────────────────────────────────────────┘

entities/  Book, Loan, User (con el carnet del lector), Country y Language: el modelo que
           comparten las tres capas.
```

**La regla:** cada capa solo conoce a la de abajo. Se puede comprobar sobre el código —
las tres búsquedas salen vacías:

```bash
grep -rnE "^(from|import) (sqlite3|data_access)" presentation/       # la presentación no toca la BD
grep -rnE "^(from|import) (flask|presentation)" business/            # el negocio no conoce la web
grep -rnE "^(from|import) (business|presentation)" data_access/      # los datos no conocen el negocio
```

### Recorrido de una petición

Al pulsar **Registrar préstamo**:

| Capa | Qué hace |
|---|---|
| Navegador | `POST /api/loans` con el libro, el lector y la cookie de sesión |
| Presentación | `loan_controller` comprueba que la sesión sea del bibliotecario, lee el JSON y llama al servicio |
| Negocio | `LoanService` comprueba que el carnet del lector **esté vigente**, que **no tenga ya otro libro** y que el libro **esté disponible**, y copia los datos del lector en el préstamo |
| Acceso a datos | `INSERT INTO loans` + `UPDATE books SET available = 0`, en **una** transacción |
| Presentación | Devuelve el préstamo como JSON con un `201` y avisa a los navegadores por el WebSocket |

Si alguna regla no se cumple, el negocio lanza un `BusinessError`, no se escribe nada y
`error_handlers` lo convierte en un `400` traducido al idioma del usuario. Si la segunda
escritura fallara, la transacción deshace también la primera: nunca queda un préstamo de un
libro que figura como disponible. Y como la transacción reserva la escritura desde el
principio, dos préstamos a la vez para el mismo lector no pueden salir bien los dos.

---

## Qué implementa

| Tema | Dónde | En una línea |
|---|---|---|
| **Reglas de negocio** | `business/book_service.py`<br>`business/loan_service.py`<br>`business/lending_rules.py` | Un libro solo se presta si está disponible y a un lector con el carnet vigente que no tenga ya otro; no se elimina un libro prestado; un préstamo no se devuelve dos veces |
| **Cuentas y papeles** | `business/auth_service.py`<br>`business/passwords.py`<br>`presentation/auth.py` | Contraseñas guardadas como hash PBKDF2. Sin sesión, `401`; con el papel equivocado, `403` |
| **Autenticación con JWT** | `business/token_service.py`<br>`presentation/auth.py`<br>`presentation/auth_controller.py`<br>`presentation/static/js/core.js` | El login entrega un JWT firmado con HS256 que vale una hora; el navegador y los clientes de la API lo envían en `Authorization: Bearer`. Un token alterado, vencido o con `alg: none` responde `401` |
| **Lectores y carnet** | `business/reader_service.py` | El bibliotecario crea y edita cuentas (nombre, DNI, celular, correo) y renueva carnets; ni el usuario ni el DNI se repiten |
| **Búsqueda** | `data_access/book_repository.py` | `?q=` busca en título, autor e ISBN con `LIKE` sobre una función `fold` de SQLite que quita mayúsculas y tildes |
| **Transacciones** | `data_access/unit_of_work.py` | Prestar, devolver y eliminar escriben en dos tablas: o se guardan las dos escrituras o ninguna |
| **Funciones sin estado** | `business/library_calculator.py` | `calculate_due_date` y `calculate_fine`: puras, misma entrada → misma salida. Las usan el préstamo, la devolución y *Plazos y multas* |
| **Funciones con estado** | `business/activity_service.py`<br>`business/wishlist_service.py` | Contadores en la RAM del servidor (la actividad del bibliotecario) y lista de deseos en la sesión del lector |
| **Internacionalización** | `presentation/i18n/` | Español e inglés con menú desplegable. El negocio lanza claves de error; la presentación las traduce |
| **Validación con regex** | `business/validators.py` | 12 patrones definidos una sola vez y publicados en `/api/validation-rules` para que el navegador use los mismos |
| **Servicio externo** | `presentation/static/js/librarian.js`<br>`presentation/static/js/core.js` | El navegador consulta Open Library por ISBN para rellenar el formulario y pide las portadas, sin pasar por Flask |
| **Servicio externo por capas** | `data_access/country_gateway.py`<br>`business/country_service.py`<br>`presentation/country_controller.py` | Países e idiomas de countries.dev. Esta vez la consulta la hace el servidor: el negocio valida la región y el código, la pasarela habla HTTP con caché de 24 h, y si el servicio no responde el usuario recibe un `503` traducido |
| **Chat en tiempo real** | `presentation/chat_socket.py`<br>`business/chat_service.py` | WebSocket en `/ws/chat`, privado entre cada lector y la biblioteca. La identidad es la cuenta de la sesión. El servidor envía los mensajes y los cambios sin que nadie los pida |

Dos detalles que conviene entender:

- **La validación del navegador es comodidad; la del servidor es la que manda.** Llamar a la
  API con `curl` salta el formulario, pero no los regex.
- **El regex valida el formato, no el significado.** El año `3000` pasa `^\d{4}$` y aun así
  lo rechaza la regla de negocio por estar fuera de rango.

---

## La API

Todo exige identificarse, salvo el inicio de sesión, las traducciones y las reglas de
validación. Los servicios se identifican con un JWT en `Authorization: Bearer <token>`:

- **El navegador** entra con `POST /api/auth/login`, que abre la cookie de sesión y entrega un
  JWT. El JavaScript lo guarda en `sessionStorage` y lo envía en cada llamada a la API: se ve en
  la pestaña Red de las herramientas del navegador. Cuando le queda menos de un minuto, o si el
  servidor lo rechaza, pide otro a `POST /api/auth/session/token` con la cookie, sin volver a
  pedir la contraseña. La cookie sigue haciendo falta para las páginas y el chat, porque el
  navegador no les añade cabeceras propias.
- **Un cliente de la API** pide un JWT al servicio de login `POST /api/auth/token` y lo envía
  igual, en cada petición.

Si la cabecera llega, manda ella: un token malo responde `401` aunque también llegue una cookie
válida. Las peticiones sin cabecera, como las del chat, se identifican por la cookie.

```bash
TOKEN=$(curl -s -H 'Content-Type: application/json' \
     -d '{"username": "jorge", "password": "jorge123"}' \
     http://127.0.0.1:5001/api/auth/token | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])')
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:5001/api/loans
```

El token es un JWT firmado con HS256. Lleva la cuenta (`sub`), su nombre, su papel, cuándo se
emitió y cuándo vence; el servidor no guarda nada, le basta comprobar la firma y la fecha. Se
firma con una clave derivada de la `SECRET_KEY`, distinta de la que firma la cookie. No hay
forma de anularlo antes de que venza, por eso vale solo una hora: para "cerrar sesión", el
cliente lo descarta.

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| `GET` | `/` · `/login` | — | La vista de cada papel y el inicio de sesión |
| `POST` | `/api/auth/login` · `/api/auth/logout` | — | El navegador entra `{username, password}`, recibe la cookie y un JWT, y sale |
| `POST` | `/api/auth/session/token` | Con la cookie de sesión | Un JWT nuevo para el navegador, sin la contraseña |
| `POST` | `/api/auth/token` | — | Servicio de login con JWT `{username, password}` → `{access_token, token_type, expires_in, user}` |
| `GET` | `/api/auth/me` | Cualquiera identificado | Quién hace la petición y si llegó por `bearer` o por `session` |
| `GET` | `/api/books` · `/api/books/<id>` | Cualquiera con sesión | Libros (`?q=` busca, `?available=true` filtra); los prestados traen `due_date` |
| `POST` `PUT` `DELETE` | `/api/books` · `/api/books/<id>` | Bibliotecario | Crear, actualizar y eliminar — `{title, author, year, isbn}` |
| `GET` `POST` | `/api/loans` | Bibliotecario | Préstamos activos e historial · prestar `{book_id, reader_id}` |
| `POST` | `/api/loans/<id>/return` | Bibliotecario | Registrar la devolución |
| `GET` `POST` | `/api/readers` | Bibliotecario | Lectores con su carnet · crear `{username, password, name, dni, phone, email, card_expires}` |
| `PUT` · `POST` | `/api/readers/<id>` · `/api/readers/<id>/renew` | Bibliotecario | Editar (contraseña vacía: no cambia) · renovar el carnet un año |
| `GET` | `/api/readers/me` | Lector | Su cuenta, su carnet y lo que tiene prestado |
| `GET` `POST` | `/api/activity` · `/api/activity/reset` | Bibliotecario | *Stateful* — contadores del servidor |
| `GET` | `/api/tools/due-date` · `/api/tools/fine` | Cualquiera con sesión | *Stateless* — vencimiento y multa |
| `GET` `POST` `DELETE` | `/api/wishlist` · `/api/wishlist/<id>` | Cualquiera con sesión | *Stateful* — lista de deseos de la sesión |
| `GET` `POST` | `/api/i18n` · `/api/i18n/<lang>` | — | Catálogo de traducciones e idioma elegido |
| `GET` | `/api/validation-rules` | — | Los patrones regex, para el navegador |
| `GET` | `/countries` | Cualquiera con sesión | La vista de países e idiomas |
| `GET` | `/api/countries?region=Americas` | Cualquiera con sesión | Los países de una región, con su nombre en el idioma del usuario |
| `GET` | `/api/countries/<código>` | Cualquiera con sesión | Un país por su código ISO de tres letras (`PER`, `GMB`), con sus idiomas y su nombre nativo |

`200`/`201` correcto · `400` regla de negocio incumplida · `401` sin sesión ni token,
credenciales incorrectas o token inválido o vencido, con la cabecera `WWW-Authenticate: Bearer`
· `403` la cuenta no tiene permiso · `404` no existe · `503` el servicio de países no responde.

Aparte de esta API, el navegador abre conexiones que no siguen el ciclo petición–respuesta:

- `WS /ws/chat?lang=es` — el chat privado y los avisos de cambios. La conexión queda abierta en
  los dos sentidos, así que el servidor puede enviar un mensaje sin que el navegador lo haya
  pedido. Cada mensaje llega solo a su lector y al bibliotecario (que escribe con `to`, el
  usuario del lector). Sin sesión, o desde otra web, se cierra con el código `4401`.
- `https://openlibrary.org/search.json?q=isbn:…` y `https://covers.openlibrary.org/b/isbn/…` —
  un servicio externo, llamado directamente desde el navegador.

---

## Estructura del proyecto

```
App-N-Capas/
├── app.py                      # Ensambla las capas y arranca Flask
├── requirements.txt
├── Dockerfile · docker-compose.yml · .env.example   # Despliegue (Dokploy)
├── gunicorn.conf.py            # Servidor de producción: un proceso con hilos
├── e2e/                        # Pruebas de punta a punta con Playwright, en paralelo
│
├── entities/                   # ENTIDADES
│   └── book.py · loan.py · user.py · country.py
│
├── data_access/                # ACCESO A DATOS
│   ├── database.py             #   Conexión, esquema, migraciones y datos de ejemplo
│   ├── unit_of_work.py         #   Una transacción para todo un caso de uso
│   ├── book_repository.py · loan_repository.py · user_repository.py
│   └── country_gateway.py      #   HTTP con countries.dev, con caché
│
├── business/                   # NEGOCIO
│   ├── book_service.py · loan_service.py
│   ├── country_service.py      #   Regiones fijas y consulta de países e idiomas
│   ├── lending_rules.py        #   Vencimiento, multa y si a un lector se le puede prestar
│   ├── reader_service.py       #   Cuentas de los lectores y su carnet
│   ├── auth_service.py         #   Inicio de sesión, papeles y cuentas de prueba
│   ├── passwords.py            #   Hash de las contraseñas
│   ├── token_service.py        #   Emite y comprueba los JWT
│   ├── validators.py           #   Los patrones regex
│   ├── library_calculator.py   #   Funciones sin estado
│   ├── activity_service.py     #   Estado en memoria
│   ├── wishlist_service.py     #   Estado de sesión
│   ├── chat_service.py         #   Conversaciones privadas y quién lee cada mensaje
│   └── exceptions.py           #   Errores con clave de mensaje
│
└── presentation/               # PRESENTACIÓN
    ├── i18n/                   #   es.json · en.json · translate()
    ├── auth.py                 #   La sesión: quién inició sesión y con qué papel
    ├── *_controller.py         #   home · auth · books · loans · readers · countries · tools · activity · wishlist · i18n · validation
    ├── chat_socket.py          #   WebSocket /ws/chat
    ├── json_input.py           #   Lee el JSON del cliente sin fiarse de su forma
    ├── error_handlers.py       #   Clave de error → HTTP + idioma
    ├── templates/              #   base · login · librarian · reader · countries (+ _chat, _search y _confirm)
    └── static/                 #   styles.css · js/core · chat · login · librarian · reader · countries
```
