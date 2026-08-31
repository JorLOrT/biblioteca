"""Conexión a SQLite, creación del esquema y datos de ejemplo."""

import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

# La base de datos es un único archivo en la raíz del proyecto.
DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "library.db"
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT    NOT NULL,
    author    TEXT    NOT NULL,
    year      INTEGER,
    available INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS loans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id),
    borrower    TEXT    NOT NULL,
    loan_date   TEXT    NOT NULL,
    return_date TEXT
);
"""

SEED_BOOKS = [
    ("Cien años de soledad", "Gabriel García Márquez", 1967),
    ("Don Quijote de la Mancha", "Miguel de Cervantes", 1605),
    ("La ciudad y los perros", "Mario Vargas Llosa", 1963),
    ("Rayuela", "Julio Cortázar", 1963),
    ("Ficciones", "Jorge Luis Borges", 1944),
    ("El túnel", "Ernesto Sabato", 1948),
]


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Abre una conexión a SQLite, confirma los cambios y siempre la cierra.

    Las filas son accesibles por nombre de columna (``row["title"]``).
    """
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    """Crea las tablas si no existen y carga los libros de ejemplo la primera vez."""
    with get_connection() as connection:
        connection.executescript(SCHEMA)

        already_loaded = connection.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        if already_loaded == 0:
            connection.executemany(
                "INSERT INTO books (title, author, year, available) VALUES (?, ?, ?, 1)",
                SEED_BOOKS,
            )
