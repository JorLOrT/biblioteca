"""Endpoints STATEFUL — contadores guardados en la memoria del servidor.

Son compartidos: los ve igual cualquier bibliotecario que abra la aplicación,
y se pierden cuando el servidor se reinicia.
"""

from flask import Blueprint, Response, jsonify

from business import activity_service
from presentation.auth import librarian_required
from presentation.i18n import translate

activity_bp = Blueprint("activity", __name__, url_prefix="/api/activity")
activity_bp.before_request(librarian_required)


@activity_bp.get("")
def summary() -> Response:
    """Lo que el servidor recuerda desde que arrancó."""
    return jsonify(activity_service.summary())


@activity_bp.post("/reset")
def reset() -> Response:
    activity_service.reset()
    return jsonify({"message": translate("msg.activity_reset")})
