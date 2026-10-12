"""Repositorio de usuarios: todo el SQL de la tabla `users`."""

import sqlite3
from typing import Optional

from entities.user import User


class UserRepository:
    """Lee y guarda cuentas. Comprobar contraseñas y carnets es trabajo del negocio."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> User:
        return User(
            id=row["id"],
            username=row["username"],
            display_name=row["display_name"],
            role=row["role"],
            password_hash=row["password_hash"],
            dni=row["dni"],
            phone=row["phone"],
            email=row["email"],
            card_number=row["card_number"],
            card_expires=row["card_expires"],
        )

    def _get_one(self, query: str, value: object) -> Optional[User]:
        row = self._db.execute(query, (value,)).fetchone()
        return self._to_entity(row) if row else None

    def get_by_id(self, user_id: int) -> Optional[User]:
        return self._get_one("SELECT * FROM users WHERE id = ?", user_id)

    def get_by_username(self, username: str) -> Optional[User]:
        return self._get_one("SELECT * FROM users WHERE username = ?", username)

    def get_by_dni(self, dni: str) -> Optional[User]:
        return self._get_one("SELECT * FROM users WHERE dni = ?", dni)

    def get_by_role(self, role: str) -> list[User]:
        rows = self._db.execute(
            "SELECT * FROM users WHERE role = ? ORDER BY display_name", (role,)
        ).fetchall()
        return [self._to_entity(row) for row in rows]

    def create(self, user: User) -> User:
        cursor = self._db.execute(
            "INSERT INTO users (username, display_name, role, password_hash, dni, "
            "phone, email, card_number, card_expires) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user.username, user.display_name, user.role, user.password_hash,
             user.dni, user.phone, user.email, user.card_number, user.card_expires),
        )
        user.id = cursor.lastrowid
        return user

    def update(self, user: User) -> User:
        """Guarda todo salvo el usuario, que no cambia nunca."""
        self._db.execute(
            "UPDATE users SET display_name = ?, password_hash = ?, dni = ?, phone = ?, "
            "email = ?, card_number = ?, card_expires = ? WHERE id = ?",
            (user.display_name, user.password_hash, user.dni, user.phone,
             user.email, user.card_number, user.card_expires, user.id),
        )
        return user

    def delete_unused(self, username: str) -> None:
        """Borra una cuenta, salvo que algún préstamo apunte a ella."""
        self._db.execute(
            "DELETE FROM users WHERE username = ? AND id NOT IN "
            "(SELECT reader_id FROM loans WHERE reader_id IS NOT NULL)",
            (username,),
        )
