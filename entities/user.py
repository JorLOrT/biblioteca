"""Entidad User (cuenta con la que se inicia sesión)."""

from dataclasses import dataclass, field
from typing import Optional

from entities.loan import Loan

# Los dos papeles de la aplicación.
LIBRARIAN = "librarian"  # gestiona el catálogo, los lectores y los préstamos
READER = "reader"        # consulta el catálogo, guarda su lista y pregunta por el chat


@dataclass
class User:
    """Una persona que puede iniciar sesión.

    Los lectores tienen además sus datos y su carnet: los pide el bibliotecario
    al crearles la cuenta y se copian en cada préstamo.
    """

    id: Optional[int]
    username: str
    display_name: str
    role: str
    # Nunca la contraseña: solo su hash, que calcula `business/passwords.py`.
    password_hash: str
    dni: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    card_number: Optional[str] = None
    # AAAA-MM-DD. El carnet vale hasta ese día incluido.
    card_expires: Optional[str] = None

    # Campos calculados por el negocio, no están en la tabla `users`.
    card_valid: bool = False
    active_loans: list[Loan] = field(default_factory=list)
    can_borrow: bool = False

    def to_dict(self) -> dict[str, object]:
        """Representación serializable a JSON. Nunca incluye el hash."""
        return {
            "id": self.id,
            "username": self.username,
            "name": self.display_name,
            "role": self.role,
            "dni": self.dni,
            "phone": self.phone,
            "email": self.email,
            "card_number": self.card_number,
            "card_expires": self.card_expires,
            "card_valid": self.card_valid,
            "active_loans": [loan.to_dict() for loan in self.active_loans],
            "can_borrow": self.can_borrow,
        }
