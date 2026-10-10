"""Capa de Negocio: las reglas de la biblioteca.

Es la capa intermedia. Recibe peticiones de la capa de Presentación, valida,
aplica las reglas del dominio y coordina a los repositorios de la capa de
Acceso a Datos. No sabe nada de HTTP ni de SQL.

Contiene los dos tipos de función:
  - STATELESS: `library_calculator` — funciones puras, sin memoria.
  - STATEFUL : `activity_service` (memoria del servidor) y `WishlistService`
               (estado de sesión, que le entrega la capa de presentación).
"""
