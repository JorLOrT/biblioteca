"""Repositorio de usuarios: todo el SQL de la tabla `users`."""

import sqlite3
from typing import Optional

from entities.user import User


class UserRepository:
    """Lee y crea cuentas. Comprobar contraseñas es trabajo del negocio."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    def get_by_username(self, username: str) -> Optional[User]:
        row = self._db.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is None:
            return None
        return User(
            id=row["id"],
            username=row["username"],
            display_name=row["display_name"],
            role=row["role"],
            password_hash=row["password_hash"],
        )

    def create(self, user: User) -> User:
        cursor = self._db.execute(
            "INSERT INTO users (username, display_name, role, password_hash) "
            "VALUES (?, ?, ?, ?)",
            (user.username, user.display_name, user.role, user.password_hash),
        )
        user.id = cursor.lastrowid
        return user
