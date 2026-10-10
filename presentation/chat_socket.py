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
import threading
from typing import Optional, Set

from flask_sock import Sock

from business import chat_service
from business.exceptions import BusinessError
from presentation.i18n import normalize, translate

sock = Sock()

# --- Conexiones abiertas (estado de la capa de presentación) ---------------
_lock = threading.Lock()
_clientes: Set[object] = set()


def _enviar(ws, carga: dict) -> bool:
    """Envía un objeto JSON por un socket. Devuelve False si ya está cerrado."""
    try:
        ws.send(json.dumps(carga, ensure_ascii=False))
        return True
    except Exception:
        return False


def _difundir(carga: dict, excepto=None) -> None:
    """Envía el mismo mensaje a todas las conexiones abiertas.

    Esto es lo que un endpoint HTTP normal no puede hacer: hablar con clientes
    que no han preguntado nada.
    """
    with _lock:
        destinatarios = [c for c in _clientes if c is not excepto]

    caidos = [ws for ws in destinatarios if not _enviar(ws, carga)]

    if caidos:
        with _lock:
            _clientes.difference_update(caidos)


def _conectados() -> int:
    with _lock:
        return len(_clientes)


@sock.route("/ws/chat")
def chat(ws):
    """Atiende una conexión durante toda su vida.

    Esta función no termina al responder: se queda en el bucle leyendo del
    socket hasta que el navegador se va.
    """
    # El idioma llega en la URL del handshake; se fija una vez para toda la
    # conexión, porque dentro del bucle ya no hay una petición HTTP de la que
    # deducirlo.
    from flask import request

    idioma = normalize(request.args.get("lang"))
    identidad: Optional[dict] = None

    with _lock:
        _clientes.add(ws)

    # Quien entra recibe la conversación anterior, para no llegar a una sala
    # en blanco.
    _enviar(ws, {
        "type": "welcome",
        "history": chat_service.historial(),
        "online": _conectados(),
    })
    _difundir({"type": "online", "count": _conectados()}, excepto=ws)

    try:
        while True:
            crudo = ws.receive()
            if crudo is None:          # el navegador cerró la pestaña
                break

            try:
                entrante = json.loads(crudo)
            except ValueError:
                continue

            tipo = entrante.get("type")

            try:
                if tipo == "join":
                    identidad = chat_service.identificar(
                        entrante.get("name", ""), entrante.get("email", "")
                    )
                    _enviar(ws, {"type": "joined", "identity": identidad})
                    _difundir({
                        "type": "system",
                        "event": "join",
                        "nickname": identidad["nickname"],
                    }, excepto=ws)

                elif tipo == "message":
                    if identidad is None:
                        raise BusinessError("error.chat_not_joined")
                    mensaje = chat_service.publicar(
                        identidad, entrante.get("text", "")
                    )
                    _difundir({"type": "message", "message": mensaje})

            except BusinessError as error:
                # El negocio lanza una clave; aquí se traduce, igual que en
                # los endpoints HTTP.
                _enviar(ws, {
                    "type": "error",
                    "code": error.key,
                    "error": translate(error.key, lang=idioma, **error.params),
                })

    finally:
        with _lock:
            _clientes.discard(ws)

        if identidad is not None:
            _difundir({
                "type": "system",
                "event": "leave",
                "nickname": identidad["nickname"],
            })
        _difundir({"type": "online", "count": _conectados()})
