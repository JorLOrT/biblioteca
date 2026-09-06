"""Lista de deseos — función STATEFUL (estado de sesión, propio de cada usuario).

El estado se conserva entre peticiones, pero a diferencia de `activity_service`
no es compartido: cada navegador tiene su propia lista. Vive en la sesión de
Flask (una cookie firmada), así que si abres la aplicación en otro navegador
verás una lista distinta.

Importante para la arquitectura en capas: esta clase NO conoce a Flask. Recibe
la lista actual como argumento y devuelve la nueva; guardarla en la sesión es
responsabilidad de la capa de presentación (`wishlist_controller`).
"""

from typing import List, Sequence

from business.exceptions import BusinessError, NotFoundError
from data_access.book_repository import BookRepository
from entities.book import Book

MAX_WISHLIST = 5


class WishlistService:
    """Gestiona la lista de libros que un usuario quiere leer más adelante."""

    def __init__(self) -> None:
        self._books = BookRepository()

    def toggle(self, wishlist: Sequence[int], book_id: int) -> List[int]:
        """STATEFUL 2 — Añade el libro a la lista, o lo quita si ya estaba.

        El resultado depende del estado anterior: la MISMA llamada añade la
        primera vez y quita la segunda.
        """
        try:
            book_id = int(book_id)
        except (TypeError, ValueError):
            raise BusinessError("Debe indicar un libro válido.")

        if self._books.get_by_id(book_id) is None:
            raise NotFoundError("No existe un libro con id {}.".format(book_id))

        updated = list(wishlist)

        if book_id in updated:
            updated.remove(book_id)
            return updated

        # Regla: la lista tiene un tamaño máximo.
        if len(updated) >= MAX_WISHLIST:
            raise BusinessError(
                "Tu lista de deseos admite como máximo {} libros.".format(MAX_WISHLIST)
            )

        updated.append(book_id)
        return updated

    def detail(self, wishlist: Sequence[int]) -> List[Book]:
        """Convierte los ids guardados en la sesión en libros completos.

        Ignora los que ya no existan (alguien pudo eliminarlos del catálogo
        mientras la sesión seguía abierta).
        """
        books = []
        for book_id in wishlist:
            book = self._books.get_by_id(book_id)
            if book is not None:
                books.append(book)
        return books
