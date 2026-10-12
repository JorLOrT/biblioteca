"""Chat de la biblioteca — reglas y memoria de las conversaciones.

El chat es PRIVADO entre cada lector y la biblioteca: cada lector tiene una
sola conversación, que se identifica con su usuario. El lector solo escribe y
lee en la suya; el bibliotecario ve todas y elige en cuál contesta. Ningún
lector ve lo que escribe otro.

Quien escribe es siempre una cuenta con la sesión iniciada. La identidad sale
de esa cuenta y no de lo que mande el navegador, así que nadie puede hacerse
pasar por el bibliotecario ni escribir en la conversación de otro. El texto se
comprueba con la misma expresión regular de `validators` que el resto.

Las conversaciones viven en la memoria del proceso, igual que los contadores
de `activity_service`: se pierden al reiniciar el servidor.

Esta capa NO sabe qué es un WebSocket. Recibe datos y devuelve datos; quien
abre la conexión y reparte los mensajes es la capa de presentación.
"""

import itertools
import threading
from collections import deque
from datetime import datetime
from typing import TypedDict

from business.exceptions import BusinessError
from business.validators import validate_field
from data_access.unit_of_work import unit_of_work
from entities.user import LIBRARIAN, READER

MAX_HISTORY = 80  # mensajes que se recuerdan por conversación


class Identity(TypedDict):
    """Quién escribe: la cuenta con la que inició sesión."""

    username: str
    nickname: str
    role: str


class ChatMessage(TypedDict):
    id: int
    # El usuario del lector dueño de la conversación.
    conversation: str
    username: str
    nickname: str
    role: str
    text: str
    at: str


_lock = threading.Lock()
# Una cola por conversación. Con `maxlen`, el mensaje más viejo sale solo.
_conversations: dict[str, deque[ChatMessage]] = {}
_next_id = itertools.count(1)


def identity_for(username: str, display_name: str, role: str) -> Identity:
    """La identidad en el chat de una cuenta que ya inició sesión."""
    return {"username": username, "nickname": display_name, "role": role}


def _is_reader(username: str) -> bool:
    with unit_of_work() as uow:
        user = uow.users.get_by_username(username)
    return user is not None and user.role == READER


def _conversation_for(identity: Identity, to: str) -> str:
    """En qué conversación se escribe.

    El lector, siempre en la suya: lo que mande en `to` no cuenta. El
    bibliotecario, en la del lector que elija, que tiene que existir.
    """
    if identity["role"] != LIBRARIAN:
        return identity["username"]
    if not to or not _is_reader(to):
        raise BusinessError("error.chat_no_reader")
    return to


def publish(identity: Identity, text: str, to: str = "") -> ChatMessage:
    """Valida un mensaje, lo guarda en su conversación y lo devuelve."""
    content = validate_field("message", text)
    conversation = _conversation_for(identity, to)

    with _lock:
        message: ChatMessage = {
            "id": next(_next_id),
            "conversation": conversation,
            "username": identity["username"],
            "nickname": identity["nickname"],
            "role": identity["role"],
            "text": content,
            "at": datetime.now().strftime("%H:%M"),
        }
        queue = _conversations.setdefault(conversation, deque(maxlen=MAX_HISTORY))
        queue.append(message)

    return message


def can_read(identity: Identity, message: ChatMessage) -> bool:
    """Regla de privacidad: el bibliotecario lee todo; un lector, solo lo suyo."""
    if identity["role"] == LIBRARIAN:
        return True
    return message["conversation"] == identity["username"]


def history_for(identity: Identity) -> dict[str, list[ChatMessage]]:
    """Las conversaciones que puede leer quien acaba de conectarse."""
    with _lock:
        return {
            owner: list(messages)
            for owner, messages in _conversations.items()
            if identity["role"] == LIBRARIAN or owner == identity["username"]
        }
