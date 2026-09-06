"""Entidad Loan (Préstamo)."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Loan:
    """El préstamo de un libro a una persona.

    Si `return_date` es None el préstamo sigue activo (el libro no ha vuelto).
    """

    id: Optional[int]
    book_id: int
    borrower: str
    loan_date: str
    return_date: Optional[str] = None

    # Campos calculados: no están en la tabla `loans`. Los rellena la capa de
    # negocio al listar, con los datos del libro y las funciones de cálculo.
    book_title: Optional[str] = None
    due_date: Optional[str] = None
    days_late: int = 0
    fine: float = 0.0

    @property
    def is_active(self) -> bool:
        return self.return_date is None

    def to_dict(self) -> dict:
        """Representación serializable a JSON."""
        return {
            "id": self.id,
            "book_id": self.book_id,
            "book_title": self.book_title,
            "borrower": self.borrower,
            "loan_date": self.loan_date,
            "return_date": self.return_date,
            "is_active": self.is_active,
            "due_date": self.due_date,
            "days_late": self.days_late,
            "fine": self.fine,
        }
