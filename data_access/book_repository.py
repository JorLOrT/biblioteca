"""Repositorio de libros: todo el SQL de la tabla `books`."""

import sqlite3
from typing import List, Optional

from data_access.database import get_connection
from entities.book import Book


class BookRepository:
    """Operaciones CRUD sobre la tabla `books`.

    No valida datos ni aplica reglas: eso es trabajo de la capa de negocio.
    """

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> Book:
        """Convierte una fila de SQLite en una entidad Book."""
        return Book(
            id=row["id"],
            title=row["title"],
            author=row["author"],
            year=row["year"],
            available=bool(row["available"]),
        )

    def get_all(self, only_available: bool = False) -> List[Book]:
        query = "SELECT * FROM books"
        if only_available:
            query += " WHERE available = 1"
        query += " ORDER BY title"

        with get_connection() as connection:
            rows = connection.execute(query).fetchall()
        return [self._to_entity(row) for row in rows]

    def get_by_id(self, book_id: int) -> Optional[Book]:
        with get_connection() as connection:
            row = connection.execute(
                "SELECT * FROM books WHERE id = ?", (book_id,)
            ).fetchone()
        return self._to_entity(row) if row else None

    def create(self, book: Book) -> Book:
        with get_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO books (title, author, year, available) VALUES (?, ?, ?, ?)",
                (book.title, book.author, book.year, int(book.available)),
            )
            book.id = cursor.lastrowid
        return book

    def update(self, book: Book) -> Book:
        with get_connection() as connection:
            connection.execute(
                "UPDATE books SET title = ?, author = ?, year = ?, available = ? WHERE id = ?",
                (book.title, book.author, book.year, int(book.available), book.id),
            )
        return book

    def delete(self, book_id: int) -> None:
        with get_connection() as connection:
            connection.execute("DELETE FROM books WHERE id = ?", (book_id,))
