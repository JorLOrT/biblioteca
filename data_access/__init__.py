"""Capa de Acceso a Datos: el único lugar del proyecto donde se escribe SQL.

Solo depende de la capa de Entidades. Su trabajo es traducir filas de SQLite
a objetos Book/Loan y viceversa. No valida nada ni conoce reglas de negocio.

La capa de negocio entra por `unit_of_work`, que agrupa en una transacción
las operaciones de un mismo caso de uso.
"""
