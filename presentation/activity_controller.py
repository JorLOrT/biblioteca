"""Endpoints STATEFUL — contadores guardados en la memoria del servidor.

Son compartidos: los ve igual cualquiera que abra la aplicación, y se pierden
cuando el servidor se reinicia.
"""

from flask import Blueprint, jsonify

from business import activity_service

activity_bp = Blueprint("activity", __name__, url_prefix="/api/activity")


@activity_bp.get("")
def summary():
    """Lo que el servidor recuerda desde que arrancó."""
    return jsonify(activity_service.summary())


@activity_bp.post("/reset")
def reset():
    activity_service.reset()
    return jsonify({"message": "Contadores reiniciados."})
