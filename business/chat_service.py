"""Chat de la biblioteca — reglas y memoria de la conversación.

El chat no exige registro. Para escribir basta con dar un apodo y un correo que
identifiquen a la persona; el correo se comprueba con la MISMA expresión
regular que usa el resto de la aplicación, así que no hay dos criterios
distintos para validar lo mismo.

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
    """Quién escribe. Solo vale mientras dura su conexión."""

    nickname: str
    email: str
    initial: str
    color: str


class ChatMessage(TypedDict):
    id: int
    nickname: str
    email: str
    initial: str
    color: str
    text: str
    at: str


_lock = threading.Lock()
# Con `maxlen`, al llegar al tope el mensaje más viejo sale solo.
_history: deque[ChatMessage] = deque(maxlen=MAX_HISTORY)
_next_id = itertools.count(1)


def _color_for(email: str) -> str:
    """Un color estable por persona, derivado de su correo.

    Siempre el mismo para el mismo correo, así cada quien se reconoce en la
    conversación sin necesidad de guardar nada. El hash solo reparte colores,
    no protege nada; de ahí `usedforsecurity=False`.
    """
    digest = hashlib.md5(
        email.strip().lower().encode("utf-8"), usedforsecurity=False
    ).hexdigest()
    hue = int(digest[:4], 16) % 360
    return f"hsl({hue}, 62%, 42%)"


def identify(nickname: str, email: str) -> Identity:
    """Valida los datos de quien entra y devuelve su identidad en el chat.

    No crea ninguna cuenta: la identidad vale solo mientras dure la conexión.
    """
    clean_nickname = validate_field("nickname", nickname)
    clean_email = validate_field("email", email)

    return {
        "nickname": clean_nickname,
        "email": clean_email,
        "initial": clean_nickname[0].upper(),
        "color": _color_for(clean_email),
    }


def publish(identity: Identity, text: str) -> ChatMessage:
    """Valida un mensaje, lo guarda en el historial y lo devuelve."""
    content = validate_field("message", text)

    with _lock:
        message: ChatMessage = {
            "id": next(_next_id),
            "nickname": identity["nickname"],
            "email": identity["email"],
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
