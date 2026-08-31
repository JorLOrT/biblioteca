"""Capa de Entidades: los modelos del dominio.

Es la capa mas baja y no depende de ninguna otra: no sabe nada de SQL,
de HTTP ni de reglas de negocio. Las tres capas superiores la usan para
hablar el mismo lenguaje.
"""

from entities.book import Book
from entities.loan import Loan

__all__ = ["Book", "Loan"]
