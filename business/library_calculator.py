"""Cálculos de la biblioteca — funciones STATELESS (sin estado).

Son funciones PURAS: el resultado depende únicamente de los argumentos que
reciben. No leen ni escriben la base de datos, no consultan la sesión, no miran
el reloj y no guardan nada entre llamadas.

Llamarlas mil veces con los mismos datos devuelve siempre exactamente lo mismo
y no deja rastro en ninguna parte. Por eso se pueden probar sin levantar un
servidor y se podrían ejecutar en cualquier máquina indistintamente.
"""

from datetime import date, timedelta

from business.exceptions import BusinessError

DEFAULT_LOAN_DAYS = 15  # plazo estándar de un préstamo
DAILY_FINE = 0.50       # multa por cada día de retraso


def _parse_date(value: str, field: str) -> date:
    """Convierte un texto AAAA-MM-DD en fecha, o lanza un error de negocio."""
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise BusinessError(
            "La fecha {} debe tener el formato AAAA-MM-DD.".format(field)
        )


def calculate_due_date(loan_date: str, days: int = DEFAULT_LOAN_DAYS) -> str:
    """STATELESS 1 — Fecha límite para devolver un libro.

    Entrada: la fecha del préstamo y el plazo en días.
    Salida: la fecha de vencimiento, en formato AAAA-MM-DD.

    >>> calculate_due_date("2026-03-01", 15)
    '2026-03-16'
    """
    try:
        days_value = int(days)
    except (TypeError, ValueError):
        raise BusinessError("El plazo debe ser un número de días.")

    if days_value <= 0:
        raise BusinessError("El plazo debe ser mayor que cero días.")

    return (_parse_date(loan_date, "de préstamo") + timedelta(days=days_value)).isoformat()


def calculate_fine(
    due_date: str, reference_date: str, daily_rate: float = DAILY_FINE
) -> dict:
    """STATELESS 2 — Días de retraso y multa acumulada de un préstamo.

    Entrada: la fecha de vencimiento y la fecha con la que se compara (la de
    devolución si ya se devolvió, o la de hoy si sigue prestado).
    Salida: los días de retraso y la multa. Si no hay retraso, ambos son cero.

    >>> calculate_fine("2026-03-16", "2026-03-20")
    {'days_late': 4, 'fine': 2.0}
    """
    due = _parse_date(due_date, "de vencimiento")
    reference = _parse_date(reference_date, "de referencia")

    days_late = max(0, (reference - due).days)
    return {"days_late": days_late, "fine": round(days_late * daily_rate, 2)}
