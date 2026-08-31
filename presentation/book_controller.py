"""Endpoints REST del catálogo de libros."""

from flask import Blueprint, jsonify, request

from business.book_service import BookService

book_bp = Blueprint("books", __name__, url_prefix="/api/books")
service = BookService()


@book_bp.get("")
def list_books():
    only_available = request.args.get("available") == "true"
    books = service.list_books(only_available=only_available)
    return jsonify([book.to_dict() for book in books])


@book_bp.get("/<int:book_id>")
def get_book(book_id: int):
    return jsonify(service.get_book(book_id).to_dict())


@book_bp.post("")
def create_book():
    payload = request.get_json(silent=True) or {}
    book = service.create_book(
        title=payload.get("title", ""),
        author=payload.get("author", ""),
        year=payload.get("year"),
    )
    return jsonify(book.to_dict()), 201


@book_bp.put("/<int:book_id>")
def update_book(book_id: int):
    payload = request.get_json(silent=True) or {}
    book = service.update_book(
        book_id,
        title=payload.get("title", ""),
        author=payload.get("author", ""),
        year=payload.get("year"),
    )
    return jsonify(book.to_dict())


@book_bp.delete("/<int:book_id>")
def delete_book(book_id: int):
    service.delete_book(book_id)
    return jsonify({"message": "Libro eliminado."})
