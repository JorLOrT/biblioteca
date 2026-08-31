"""Endpoints REST de los préstamos."""

from flask import Blueprint, jsonify, request

from business.loan_service import LoanService

loan_bp = Blueprint("loans", __name__, url_prefix="/api/loans")
service = LoanService()


@loan_bp.get("")
def list_loans():
    loans = service.list_loans()
    return jsonify([loan.to_dict() for loan in loans])


@loan_bp.post("")
def lend_book():
    payload = request.get_json(silent=True) or {}
    loan = service.lend_book(
        book_id=payload.get("book_id"),
        borrower=payload.get("borrower", ""),
    )
    return jsonify(loan.to_dict()), 201


@loan_bp.post("/<int:loan_id>/return")
def return_book(loan_id: int):
    loan = service.return_book(loan_id)
    return jsonify(loan.to_dict())
