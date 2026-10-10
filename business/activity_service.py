"""Registro de actividad — función STATEFUL (estado en la memoria del servidor).

Los contadores viven en una variable de módulo, así que su valor SOBREVIVE de
una petición a la siguiente: el resultado de `summary()` no depende de lo que
le pasen, sino de todo lo que ha ocurrido antes en este proceso.

Es el contraste exacto con `library_calculator`:
  - `calculate_due_date("2026-03-01")` devuelve siempre lo mismo.
  - `record(LOANS)`                    devuelve 1, luego 2, luego 3...

Al reiniciar el servidor los contadores vuelven a cero, porque no están en la
base de datos sino en la RAM del proceso. El `Lock` evita que dos peticiones
simultáneas se pisen al incrementar.
"""

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, TypedDict

# Las acciones que se cuentan. La presentación muestra cada una con la clave
# de traducción `activity.<acción>`.
BOOKS_CREATED = "books_created"
BOOKS_DELETED = "books_deleted"
LOANS = "loans"
RETURNS = "returns"


class ActivitySummary(TypedDict):
    counters: dict[str, int]
    total: int
    last_action: Optional[str]
    last_action_at: Optional[str]


@dataclass
class _ActivityState:
    counters: dict[str, int] = field(default_factory=dict)
    last_action: Optional[str] = None
    last_action_at: Optional[str] = None


_lock = threading.Lock()

# --- EL ESTADO: este objeto es la memoria del servidor ---------------------
_state = _ActivityState()


def record(action: str) -> int:
    """STATEFUL 1 — Anota que ha ocurrido `action` y devuelve el total acumulado.

    Cada llamada modifica el estado del servidor: la misma entrada produce una
    salida distinta cada vez.
    """
    with _lock:
        _state.counters[action] = _state.counters.get(action, 0) + 1
        _state.last_action = action
        _state.last_action_at = datetime.now().strftime("%H:%M:%S")
        return _state.counters[action]


def summary() -> ActivitySummary:
    """Devuelve una copia del estado acumulado desde que arrancó el servidor."""
    with _lock:
        return {
            "counters": dict(_state.counters),
            "total": sum(_state.counters.values()),
            "last_action": _state.last_action,
            "last_action_at": _state.last_action_at,
        }


def reset() -> None:
    """Vuelve a poner los contadores a cero."""
    with _lock:
        _state.counters.clear()
        _state.last_action = None
        _state.last_action_at = None
