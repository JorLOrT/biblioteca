"""Entidad User (cuenta con la que se inicia sesión)."""

from dataclasses import dataclass
from typing import Optional

# Los dos papeles de la aplicación.
LIBRARIAN = "librarian"  # gestiona el catálogo y registra préstamos y devoluciones
READER = "reader"        # consulta el catálogo, guarda su lista y pregunta por el chat


@dataclass
class User:
    """Una persona que puede iniciar sesión."""

    id: Optional[int]
    username: str
    display_name: str
    role: str
    # Nunca la contraseña: solo su hash, que calcula `auth_service`.
    password_hash: str
