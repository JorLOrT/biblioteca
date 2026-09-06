"""Endpoints STATEFUL — lista de deseos guardada en la sesión del usuario.

Esta capa es la única que conoce la sesión de Flask: lee el estado, se lo pasa
a la capa de negocio y guarda de vuelta el resultado. El negocio sigue sin
saber que existe la web.
"""

from flask import Blueprint, jsonify, session

from business.wishlist_service import MAX_WISHLIST, WishlistService

wishlist_bp = Blueprint("wishlist", __name__, url_prefix="/api/wishlist")
service = WishlistService()

SESSION_KEY = "wishlist"


@wishlist_bp.get("")
def get_wishlist():
    book_ids = session.get(SESSION_KEY, [])
    books = service.detail(book_ids)
    return jsonify(
        {
            "book_ids": book_ids,
            "books": [book.to_dict() for book in books],
            "max": MAX_WISHLIST,
        }
    )


@wishlist_bp.post("/<int:book_id>")
def toggle(book_id: int):
    book_ids = session.get(SESSION_KEY, [])
    updated = service.toggle(book_ids, book_id)

    session[SESSION_KEY] = updated  # <-- aquí se guarda el estado del usuario

    return jsonify({"book_ids": updated, "in_wishlist": book_id in updated})


@wishlist_bp.delete("")
def clear():
    session.pop(SESSION_KEY, None)
    return jsonify({"book_ids": []})
