"""Chat en tiempo real sobre WebSocket.

Diferencia con el resto de la aplicación: los demás endpoints siguen el ciclo
petición–respuesta (el navegador pregunta, el servidor contesta y la conexión
se cierra). Aquí la conexión queda ABIERTA en los dos sentidos, así que el
servidor puede enviar un mensaje sin que nadie se lo haya pedido. Es lo que
permite que un mensaje escrito en un navegador aparezca en otro al instante,
sin recargar ni preguntar cada pocos segundos.

Por esa misma conexión el servidor avisa de que el catálogo cambió (un
préstamo, una devolución, un libro nuevo), y cada navegador vuelve a pedir los
datos: el lector ve que un libro se prestó sin tener que recargar la página.

Para entrar hay que haber iniciado sesión: la identidad en el chat es la de la
cuenta, así que el bibliotecario está siempre identificado como tal y no hay
que dar ningún apodo.

Reparto de responsabilidades:
  - Esta capa gestiona las conexiones abiertas y el protocolo.
  - `business/chat_service.py` valida y guarda los mensajes, y no sabe que
    existen los WebSockets.

El conjunto de conexiones vive aquí porque un socket abierto es un detalle de
la capa de presentación: al negocio no le sirve de nada.
"""

import contextlib
import json
import logging
import socket
import threading
from dataclasses import dataclass, field
from typing import Callable, Optional, Union
from urllib.parse import urlsplit

from flask import request
from flask_sock import Sock
from simple_websocket import ConnectionClosed, Server

from business import chat_service
from business.chat_service import Identity
from business.exceptions import BusinessError
from entities.user import LIBRARIAN, READER
from presentation.auth import current_user
from presentation.error_handlers import error_payload
from presentation.i18n import normalize
from presentation.json_input import json_object, text_field

logger = logging.getLogger(__name__)
sock = Sock()

# Código con el que se cierra una conexión sin sesión. Los códigos 4000-4999
# son de la aplicación; el navegador lo usa para volver al inicio de sesión
# en lugar de reintentar.
CLOSE_LOGIN_REQUIRED = 4401


# --- Conexiones abiertas (estado de la capa de presentación) ---------------

# eq=False: dos conexiones son distintas aunque tengan los mismos datos, y así
# cada una se puede guardar en un conjunto.
@dataclass(eq=False)
class _Connection:
    """Lo que el servidor sabe de un navegador conectado."""

    ws: Server
    # El idioma llega en la URL del handshake y se fija para toda la conexión:
    # dentro del bucle ya no hay una petición HTTP de la que deducirlo.
    lang: str
    identity: Identity
    # En este socket escriben varios hilos: el de esta conexión y los de quien
    # difunda un mensaje. Sin turnos, dos tramas a la vez se mezclan (y la
    # compresión pierde el orden) y el navegador las recibe rotas.
    send_lock: threading.Lock = field(default_factory=threading.Lock)

    def send(self, payload: dict[str, object]) -> bool:
        """Envía un objeto JSON. Devuelve False si la conexión ya está cerrada."""
        try:
            with self.send_lock:
                self.ws.send(json.dumps(payload, ensure_ascii=False))
        except (ConnectionClosed, OSError) as error:
            logger.info("Conexión de chat perdida al enviar: %s", error)
            return False
        return True


_lock = threading.Lock()
_clients: set[_Connection] = set()


def _broadcast(
    payload: dict[str, object], exclude: Optional[_Connection] = None
) -> None:
    """Envía el mismo mensaje a todas las conexiones abiertas.

    Esto es lo que un endpoint HTTP normal no puede hacer: hablar con clientes
    que no han preguntado nada.
    """
    with _lock:
        recipients = [client for client in _clients if client is not exclude]

    dropped = [client for client in recipients if not client.send(payload)]

    if dropped:
        with _lock:
            _clients.difference_update(dropped)


def _presence() -> dict[str, object]:
    """Cuántas cuentas de cada papel están conectadas.

    Se cuentan cuentas, no pestañas: un lector con dos pestañas abiertas es
    un lector.
    """
    with _lock:
        identities = [client.identity for client in _clients]

    def accounts(role: str) -> int:
        return len({i["username"] for i in identities if i["role"] == role})

    return {"librarians": accounts(LIBRARIAN), "readers": accounts(READER)}


def notify_catalog_changed() -> None:
    """Avisa a todos los navegadores de que el catálogo o los préstamos cambiaron.

    Solo dice QUE cambió, no qué: cada navegador vuelve a pedir lo que su
    papel tiene permitido ver. Así un lector nunca recibe por aquí los datos
    de un préstamo.
    """
    _broadcast({"type": "catalog"})


# --- Un manejador por cada tipo de mensaje que manda el navegador ----------

def _message(connection: _Connection, data: dict[str, object]) -> None:
    message = chat_service.publish(connection.identity, text_field(data, "text"))
    _broadcast({"type": "message", "message": message})


_HANDLERS: dict[str, Callable[[_Connection, dict[str, object]], None]] = {
    "message": _message,
}


def _on_connect(connection: _Connection) -> None:
    with _lock:
        _clients.add(connection)

    # Quien entra recibe la conversación anterior, para no llegar a una sala
    # en blanco, y sabe quién más está conectado.
    connection.send({
        "type": "welcome",
        "history": chat_service.history(),
        **_presence(),
    })
    _broadcast({"type": "presence", **_presence()}, exclude=connection)


def _on_message(connection: _Connection, raw: Union[str, bytes]) -> None:
    """Atiende un mensaje del navegador. Lo que no se entiende se ignora."""
    try:
        data = json_object(json.loads(raw))
    except ValueError:
        return

    handler = _HANDLERS.get(text_field(data, "type"))
    if handler is None:
        return

    try:
        handler(connection, data)
    except BusinessError as error:
        # El negocio lanza una clave; aquí se traduce, igual que en los
        # endpoints HTTP y con el mismo formato.
        connection.send({"type": "error", **error_payload(error, connection.lang)})


def _on_disconnect(connection: _Connection) -> None:
    with _lock:
        _clients.discard(connection)
    _broadcast({"type": "presence", **_presence()})


# --- Apertura y cierre -------------------------------------------------------

def _same_origin() -> bool:
    """¿Abre la conexión una página de esta misma aplicación?

    El navegador manda la cookie de sesión en el handshake. Sin esta
    comprobación, una web ajena podría abrir un WebSocket con la sesión de
    quien la visite y escribir en su nombre.
    """
    origin = request.headers.get("Origin")
    return origin is None or urlsplit(origin).netloc == request.host


def _finish_closing(ws: Server) -> None:
    """Termina el cierre sin que el navegador reciba nada más.

    Al volver `chat`, Werkzeug escribe una respuesta HTTP en el socket, como
    con cualquier ruta. En un WebSocket ya cerrado esos bytes llegan como una
    trama rota y el navegador registra «Invalid frame header». Por eso, cuando
    la conexión ya se cerró, se espera a que el hilo de simple-websocket
    termine el cierre y se cierra la escritura del socket: la respuesta de
    Werkzeug ya no sale, y él lo trata como una conexión cortada.
    """
    if ws.connected:
        return
    ws.thread.join(timeout=1)
    # OSError: el navegador ya había cortado la conexión.
    with contextlib.suppress(OSError):
        ws.sock.shutdown(socket.SHUT_WR)


def _reject(ws: Server) -> None:
    """Cierra una conexión sin sesión (o de otra web) sin atenderla."""
    with contextlib.suppress(ConnectionClosed):
        ws.close(reason=CLOSE_LOGIN_REQUIRED, message="login required")
    _finish_closing(ws)


@sock.route("/ws/chat")
def chat(ws: Server) -> None:
    """Atiende una conexión durante toda su vida.

    Esta función no termina al responder: se queda en el bucle leyendo del
    socket hasta que el navegador se va. Entonces `receive` lanza
    ConnectionClosed, se ejecuta el `finally` y flask-sock cierra la conexión.
    """
    user = current_user()
    if user is None or not _same_origin():
        _reject(ws)
        return

    identity = chat_service.identity_for(user["username"], user["name"], user["role"])
    connection = _Connection(ws, normalize(request.args.get("lang")), identity)
    _on_connect(connection)
    try:
        while True:
            _on_message(connection, ws.receive())
    finally:
        _on_disconnect(connection)
        _finish_closing(ws)
