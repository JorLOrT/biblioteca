"""Entidad Book (Libro)."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Book:
    """Un libro del catalogo de la biblioteca."""

    id: Optional[int]
    title: str
    author: str
    year: Optional[int]
    available: bool = True

    def to_dict(self) -> dict:
        """Representacion serializable a JSON."""
        return {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "year": self.year,
            "available": self.available,
        }
