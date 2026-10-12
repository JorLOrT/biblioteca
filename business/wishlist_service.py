"""Lista de deseos — función STATEFUL (estado de sesión, propio de cada usuario).

El estado se conserva entre peticiones, pero a diferencia de `activity_service`
no es compartido: cada navegador tiene su propia lista. Vive en la sesión de
Flask (una cookie firmada), así que si abres la aplicación en otro navegador
verás una lista distinta.

Importante para la arquitectura en capas: esta clase NO conoce a Flask. Recibe
la lista actual como argumento y devuelve la nueva; guardarla en la sesión es
responsabilidad de la capa de presentación (`wishlist_controller`).
"""

from collections.abc import Sequence

from business.book_service import require_book, with_due_dates
from business.exceptions import BusinessError
from data_access.unit_of_work import unit_of_work
from entities.book import Book

MAX_WISHLIST = 5


class WishlistService:
    """Gestiona la lista de libros que un usuario quiere leer más adelante."""

    def toggle(self, wishlist: Sequence[int], book_id: int) -> list[int]:
        """STATEFUL 2 — Añade el libro a la lista, o lo quita si ya estaba.

        El resultado depende del estado anterior: la MISMA llamada añade la
        primera vez y quita la segunda.
        """
        with unit_of_work() as uow:
            require_book(uow, book_id)

        updated = list(wishlist)

        if book_id in updated:
            updated.remove(book_id)
            return updated

        # Regla: la lista tiene un tamaño máximo.
        if len(updated) >= MAX_WISHLIST:
            raise BusinessError("error.wishlist_full", max=MAX_WISHLIST)

        updated.append(book_id)
        return updated

    def detail(self, wishlist: Sequence[int]) -> list[Book]:
        """Convierte los ids guardados en la sesión en libros completos.

        Ignora los que ya no existan (alguien pudo eliminarlos del catálogo
        mientras la sesión seguía abierta).
        """
        with unit_of_work() as uow:
            found = [uow.books.get_by_id(book_id) for book_id in wishlist]
            books = [book for book in found if book is not None]
            # Como en el catálogo: si está prestado, cuándo vuelve.
            return with_due_dates(uow, books)
