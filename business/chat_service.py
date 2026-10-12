"""Chat de la biblioteca — reglas y memoria de la conversación.

Quien escribe es siempre una cuenta con la sesión iniciada: el bibliotecario o
un lector. La identidad sale de esa cuenta y no de lo que mande el navegador,
así que nadie puede hacerse pasar por el bibliotecario. El texto del mensaje
se comprueba con la misma expresión regular de `validators` que el resto.

El historial vive en la memoria del proceso, igual que los contadores de
`activity_service`: es estado compartido por todos los conectados y se pierde
al reiniciar el servidor. Guardarlo en SQLite sería fácil, pero para un chat de
sala única no aporta nada y complicaría el ejemplo.

Esta capa NO sabe qué es un WebSocket. Recibe datos y devuelve datos; quien
abre la conexión y reparte los mensajes es la capa de presentación.
"""

import hashlib
import itertools
import threading
from collections import deque
from datetime import datetime
from typing import TypedDict

from business.validators import validate_field

MAX_HISTORY = 80  # mensajes que se recuerdan; los más viejos se descartan


class Identity(TypedDict):
    """Quién escribe: la cuenta con la que inició sesión."""

    username: str
    nickname: str
    role: str
    initial: str
    color: str


class ChatMessage(TypedDict):
    id: int
    username: str
    nickname: str
    role: str
    initial: str
    color: str
    text: str
    at: str


_lock = threading.Lock()
# Con `maxlen`, al llegar al tope el mensaje más viejo sale solo.
_history: deque[ChatMessage] = deque(maxlen=MAX_HISTORY)
_next_id = itertools.count(1)


def _color_for(username: str) -> str:
    """Un color estable por cuenta, derivado de su nombre de usuario.

    Siempre el mismo para la misma cuenta, así cada quien se reconoce en la
    conversación sin necesidad de guardar nada. El hash solo reparte colores,
    no protege nada; de ahí `usedforsecurity=False`.
    """
    digest = hashlib.md5(username.encode("utf-8"), usedforsecurity=False).hexdigest()
    hue = int(digest[:4], 16) % 360
    return f"hsl({hue}, 55%, 40%)"


def identity_for(username: str, display_name: str, role: str) -> Identity:
    """La identidad en el chat de una cuenta que ya inició sesión."""
    return {
        "username": username,
        "nickname": display_name,
        "role": role,
        "initial": display_name[:1].upper(),
        "color": _color_for(username),
    }


def publish(identity: Identity, text: str) -> ChatMessage:
    """Valida un mensaje, lo guarda en el historial y lo devuelve."""
    content = validate_field("message", text)

    with _lock:
        message: ChatMessage = {
            "id": next(_next_id),
            "username": identity["username"],
            "nickname": identity["nickname"],
            "role": identity["role"],
            "initial": identity["initial"],
            "color": identity["color"],
            "text": content,
            "at": datetime.now().strftime("%H:%M"),
        }
        _history.append(message)

    return message


def history() -> list[ChatMessage]:
    """Copia de la conversación, para quien acaba de entrar."""
    with _lock:
        return list(_history)
