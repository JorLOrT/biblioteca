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
import threading
from datetime import datetime
from typing import Dict, List

from business.validators import validate_field

MAX_HISTORIAL = 80  # mensajes que se recuerdan; los más viejos se descartan

_lock = threading.Lock()
_historial: List[dict] = []
_siguiente_id = 1


def _color_de(correo: str) -> str:
    """Un color estable por persona, derivado de su correo.

    Siempre el mismo para el mismo correo, así cada quien se reconoce en la
    conversación sin necesidad de guardar nada.
    """
    digest = hashlib.md5(correo.strip().lower().encode("utf-8")).hexdigest()
    tono = int(digest[:4], 16) % 360
    return "hsl({}, 62%, 42%)".format(tono)


def identificar(nickname: str, email: str) -> dict:
    """Valida los datos de quien entra y devuelve su identidad en el chat.

    No crea ninguna cuenta: la identidad vale solo mientras dure la conexión.
    """
    apodo = validate_field("nickname", nickname)
    correo = validate_field("email", email)

    return {
        "nickname": apodo,
        "email": correo,
        "initial": apodo[0].upper(),
        "color": _color_de(correo),
    }


def publicar(identidad: dict, texto: str) -> dict:
    """Valida un mensaje, lo guarda en el historial y lo devuelve."""
    contenido = validate_field("message", texto)

    global _siguiente_id
    with _lock:
        mensaje = {
            "id": _siguiente_id,
            "nickname": identidad["nickname"],
            "email": identidad["email"],
            "initial": identidad["initial"],
            "color": identidad["color"],
            "text": contenido,
            "at": datetime.now().strftime("%H:%M"),
        }
        _siguiente_id += 1

        _historial.append(mensaje)
        if len(_historial) > MAX_HISTORIAL:
            del _historial[0 : len(_historial) - MAX_HISTORIAL]

    return mensaje


def historial() -> List[dict]:
    """Copia de la conversación, para quien acaba de entrar."""
    with _lock:
        return list(_historial)


def limpiar() -> None:
    """Vacía la conversación (se usa en las pruebas)."""
    global _siguiente_id
    with _lock:
        _historial.clear()
        _siguiente_id = 1


def resumen() -> Dict[str, int]:
    with _lock:
        return {"messages": len(_historial), "max": MAX_HISTORIAL}
