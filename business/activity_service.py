"""Registro de actividad — función STATEFUL (estado en la memoria del servidor).

Los contadores viven en una variable de módulo, así que su valor SOBREVIVE de
una petición a la siguiente: el resultado de `summary()` no depende de lo que
le pasen, sino de todo lo que ha ocurrido antes en este proceso.

Es el contraste exacto con `library_calculator`:
  - `calculate_due_date("2026-03-01")` devuelve siempre lo mismo.
  - `record("prestamos")`             devuelve 1, luego 2, luego 3...

Al reiniciar el servidor los contadores vuelven a cero, porque no están en la
base de datos sino en la RAM del proceso. El `Lock` evita que dos peticiones
simultáneas se pisen al incrementar.
"""

import threading
from datetime import datetime
from typing import Dict, Optional

_lock = threading.Lock()

# --- EL ESTADO: estas variables son la memoria del servidor -------------------
_counters: Dict[str, int] = {}
_last_action: Dict[str, Optional[str]] = {"action": None, "at": None}


def record(action: str) -> int:
    """STATEFUL 1 — Anota que ha ocurrido `action` y devuelve el total acumulado.

    Cada llamada modifica el estado del servidor: la misma entrada produce una
    salida distinta cada vez.
    """
    with _lock:
        _counters[action] = _counters.get(action, 0) + 1
        _last_action["action"] = action
        _last_action["at"] = datetime.now().strftime("%H:%M:%S")
        return _counters[action]


def summary() -> dict:
    """Devuelve una copia del estado acumulado desde que arrancó el servidor."""
    with _lock:
        return {
            "counters": dict(_counters),
            "total": sum(_counters.values()),
            "last_action": _last_action["action"],
            "last_action_at": _last_action["at"],
        }


def reset() -> None:
    """Vuelve a poner los contadores a cero."""
    with _lock:
        _counters.clear()
        _last_action["action"] = None
        _last_action["at"] = None
