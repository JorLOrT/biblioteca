"""Repositorio de libros: todo el SQL de la tabla `books`."""

import re
import sqlite3
from typing import Optional

from data_access.database import fold
from entities.book import Book


def _like_pattern(text: str) -> str:
    """`%texto%` para LIKE, con `%` y `_` escapados: se buscan tal cual."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _search_clause(search: str) -> tuple[str, list[str]]:
    """La condición de búsqueda en el título, el autor y el ISBN.

    `fold` (registrada en la conexión) quita mayúsculas y tildes en los dos
    lados, así que «garcia» encuentra a «García Márquez». El ISBN se compara
    solo por sus cifras: da igual escribirlo con guiones o sin ellos.
    """
    pattern = _like_pattern(fold(search))
    clause = "fold(title) LIKE ? ESCAPE '\\' OR fold(author) LIKE ? ESCAPE '\\'"
    params = [pattern, pattern]
    digits = re.sub(r"\D", "", search)
    if digits:
        clause += " OR isbn LIKE ?"
        params.append(f"%{digits}%")
    return f"({clause})", params


class BookRepository:
    """Operaciones CRUD sobre la tabla `books`.

    No valida datos ni aplica reglas: eso es trabajo de la capa de negocio.
    Trabaja sobre la conexión que le da la unidad de trabajo, así que no abre
    ni confirma transacciones por su cuenta.
    """

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> Book:
        """Convierte una fila de SQLite en una entidad Book."""
        return Book(
            id=row["id"],
            title=row["title"],
            author=row["author"],
            year=row["year"],
            isbn=row["isbn"],
            available=bool(row["available"]),
        )

    def get_all(self, only_available: bool = False, search: str = "") -> list[Book]:
        """Los libros por título; solo los disponibles, o los que coincidan."""
        conditions: list[str] = []
        params: list[str] = []
        if only_available:
            conditions.append("available = 1")
        if search:
            clause, search_params = _search_clause(search)
            conditions.append(clause)
            params += search_params

        query = "SELECT * FROM books"
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        rows = self._db.execute(query + " ORDER BY title", params).fetchall()
        return [self._to_entity(row) for row in rows]

    def get_by_id(self, book_id: int) -> Optional[Book]:
        row = self._db.execute(
            "SELECT * FROM books WHERE id = ?", (book_id,)
        ).fetchone()
        return self._to_entity(row) if row else None

    def create(self, book: Book) -> Book:
        cursor = self._db.execute(
            "INSERT INTO books (title, author, year, isbn, available) "
            "VALUES (?, ?, ?, ?, ?)",
            (book.title, book.author, book.year, book.isbn, int(book.available)),
        )
        book.id = cursor.lastrowid
        return book

    def update(self, book: Book) -> Book:
        self._db.execute(
            "UPDATE books SET title = ?, author = ?, year = ?, isbn = ?, "
            "available = ? WHERE id = ?",
            (book.title, book.author, book.year, book.isbn,
             int(book.available), book.id),
        )
        return book

    def set_available(self, book_id: int, available: bool) -> None:
        self._db.execute(
            "UPDATE books SET available = ? WHERE id = ?", (int(available), book_id)
        )

    def delete(self, book_id: int) -> None:
        self._db.execute("DELETE FROM books WHERE id = ?", (book_id,))
