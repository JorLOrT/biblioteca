"""Chat en tiempo real sobre WebSocket.

Diferencia con el resto de la aplicación: los demás endpoints siguen el ciclo
petición–respuesta (el navegador pregunta, el servidor contesta y la conexión
se cierra). Aquí la conexión queda ABIERTA en los dos sentidos, así que el
servidor puede enviar un mensaje sin que nadie se lo haya pedido. Es lo que
permite que un mensaje escrito en un navegador aparezca en otro al instante,
sin recargar ni preguntar cada pocos segundos.

Reparto de responsabilidades:
  - Esta capa gestiona las conexiones abiertas y el protocolo.
  - `business/chat_service.py` valida y guarda los mensajes, y no sabe que
    existen los WebSockets.

El conjunto de conexiones vive aquí porque un socket abierto es un detalle de
la capa de presentación: al negocio no le sirve de nada.
"""

import json
import logging
import threading
from dataclasses import dataclass
from typing import Callable, Optional, Union

from flask import request
from flask_sock import Sock
from simple_websocket import ConnectionClosed, Server

from business import chat_service
from business.chat_service import Identity
from business.exceptions import BusinessError
from presentation.error_handlers import error_payload
from presentation.i18n import normalize
from presentation.json_input import json_object, text_field

logger = logging.getLogger(__name__)
sock = Sock()

# --- Conexiones abiertas (estado de la capa de presentación) ---------------
_lock = threading.Lock()
_clients: set[Server] = set()


@dataclass
class _Connection:
    """Lo que el servidor sabe de un navegador conectado."""

    ws: Server
    # El idioma llega en la URL del handshake y se fija para toda la conexión:
    # dentro del bucle ya no hay una petición HTTP de la que deducirlo.
    lang: str
    identity: Optional[Identity] = None


def _send(ws: Server, payload: dict[str, object]) -> bool:
    """Envía un objeto JSON por un socket. Devuelve False si ya está cerrado."""
    try:
        ws.send(json.dumps(payload, ensure_ascii=False))
    except (ConnectionClosed, OSError) as error:
        logger.info("Conexión de chat perdida al enviar: %s", error)
        return False
    return True


def _broadcast(payload: dict[str, object], exclude: Optional[Server] = None) -> None:
    """Envía el mismo mensaje a todas las conexiones abiertas.

    Esto es lo que un endpoint HTTP normal no puede hacer: hablar con clientes
    que no han preguntado nada.
    """
    with _lock:
        recipients = [ws for ws in _clients if ws is not exclude]

    dropped = [ws for ws in recipients if not _send(ws, payload)]

    if dropped:
        with _lock:
            _clients.difference_update(dropped)


def _online() -> int:
    with _lock:
        return len(_clients)


# --- Un manejador por cada tipo de mensaje que manda el navegador ----------

def _join(connection: _Connection, data: dict[str, object]) -> None:
    identity = chat_service.identify(
        text_field(data, "name"), text_field(data, "email")
    )
    connection.identity = identity
    _send(connection.ws, {"type": "joined", "identity": identity})
    _broadcast(
        {"type": "system", "event": "join", "nickname": identity["nickname"]},
        exclude=connection.ws,
    )


def _message(connection: _Connection, data: dict[str, object]) -> None:
    if connection.identity is None:
        raise BusinessError("error.chat_not_joined")
    message = chat_service.publish(connection.identity, text_field(data, "text"))
    _broadcast({"type": "message", "message": message})


_HANDLERS: dict[str, Callable[[_Connection, dict[str, object]], None]] = {
    "join": _join,
    "message": _message,
}


def _on_connect(connection: _Connection) -> None:
    with _lock:
        _clients.add(connection.ws)

    # Quien entra recibe la conversación anterior, para no llegar a una sala
    # en blanco.
    _send(connection.ws, {
        "type": "welcome",
        "history": chat_service.history(),
        "online": _online(),
    })
    _broadcast({"type": "online", "count": _online()}, exclude=connection.ws)


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
        _send(connection.ws, {"type": "error", **error_payload(error, connection.lang)})


def _on_disconnect(connection: _Connection) -> None:
    with _lock:
        _clients.discard(connection.ws)

    if connection.identity is not None:
        _broadcast({
            "type": "system",
            "event": "leave",
            "nickname": connection.identity["nickname"],
        })
    _broadcast({"type": "online", "count": _online()})


@sock.route("/ws/chat")
def chat(ws: Server) -> None:
    """Atiende una conexión durante toda su vida.

    Esta función no termina al responder: se queda en el bucle leyendo del
    socket hasta que el navegador se va. Entonces `receive` lanza
    ConnectionClosed, se ejecuta el `finally` y flask-sock cierra la conexión.
    """
    connection = _Connection(ws, lang=normalize(request.args.get("lang")))
    _on_connect(connection)
    try:
        while True:
            _on_message(connection, ws.receive())
    finally:
        _on_disconnect(connection)
