// Los puertos y la clave de las dos aplicaciones que arranca Playwright. Los
// usan la configuración y las pruebas, así que viven aquí y no en dos sitios.

// Solo para las pruebas. Las del JWT la necesitan para fabricar un token vencido.
export const SECRET_KEY = "solo-para-las-pruebas-e2e";

export const PORT = Number(process.env.E2E_PORT ?? 5055);
export const PORT_SIN_PAISES = PORT + 1;

export const URL_APP = `http://127.0.0.1:${PORT}`;
// La misma aplicación, pero con el servicio de países caído.
export const URL_SIN_PAISES = `http://127.0.0.1:${PORT_SIN_PAISES}`;
