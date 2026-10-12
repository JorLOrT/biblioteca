"""Entidad Book (Libro)."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Book:
    """Un libro del catálogo de la biblioteca."""

    id: Optional[int]
    title: str
    author: str
    year: Optional[int]
    isbn: Optional[str] = None
    available: bool = True
    # Calculado por el negocio, no está en la tabla: si el libro está
    # prestado, la fecha en que debe volver.
    due_date: Optional[str] = None

    def to_dict(self) -> dict[str, object]:
        """Representación serializable a JSON."""
        return {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "year": self.year,
            "isbn": self.isbn,
            "available": self.available,
            "due_date": self.due_date,
        }
