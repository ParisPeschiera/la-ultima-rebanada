# La Última Rebanada

Sistema web de pedidos y delivery de pizzas con seguimiento en tiempo real. Proyecto del curso Integrador I, Sistemas Software.

El cliente arma su pedido en la web y ve en un mapa dónde va su repartidor. La cocina, el repartidor y el administrador tienen cada uno su propio panel, y todo se actualiza al instante entre las pantallas.

## Qué incluye

- **Cliente:** carta con personalización, carrito, cupones, pago (efectivo, tarjeta o Yape/Plin), seguimiento en vivo con mapa y calificación del pedido y del repartidor.
- **Cocina:** cola de pedidos en orden de llegada, con los pasos cocinando, horno y listo.
- **Repartidor:** pedidos asignados, mapa, cobro y entrega con el código de 4 dígitos del cliente. Puede armar una ruta con varias paradas y la hora de llegada se calcula por cada una.
- **Administrador:** asignación de repartidores, cuentas del personal, inventario, reportes de ventas, demanda y hora pico, historial y opiniones. También abre y cierra el negocio.
- **Fuera de zona:** si el distrito del cliente no está en la cobertura, el administrador evalúa y fija un recargo antes de que se cree el pedido.

Hecho con Node.js, Express, Socket.IO y SQLite. El frontend es HTML, CSS y JavaScript sin frameworks.

## Cómo iniciarlo en tu computadora

Necesitas tener instalado [Node.js](https://nodejs.org) versión 20 o superior.

1. Abre una terminal dentro de la carpeta del proyecto. En Windows, abre la carpeta en el Explorador, escribe `cmd` en la barra de direcciones y presiona Enter.
2. Instala las dependencias (solo la primera vez):

   ```bash
   npm install
   ```

3. Arranca el servidor:

   ```bash
   npm start
   ```

4. Abre <http://localhost:3000> en el navegador.

La base de datos se crea sola en la carpeta `data/` la primera vez, con datos de ejemplo. Para detener el servidor presiona `Ctrl + C` en la terminal.

### Cuentas de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Cliente | `U-cliente` | `1234` |
| Cocinero | `C-cocinero` | `1234` |
| Repartidor | `D-delivery`, `D-kevin` o `D-rosa` | `1234` |
| Administrador | `admin` | `1234` |

Para ver el tiempo real, abre una pestaña por cada rol. Para probarlo desde el celular, conéctalo a la misma red Wi-Fi y entra a `http://IP-de-tu-PC:3000`.

### Pruebas

```bash
npm test
```

## Variables de entorno

Todas son opcionales. Para usarlas copia `.env.example` a `.env`, cambia los valores y arranca con `npm run start:env`.

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto del servidor (3000 por defecto). |
| `DB_FILE` | Ruta del archivo de la base de datos. |
| `JWT_SECRET` | Texto largo y aleatorio que firma las sesiones. |
| `BASE_URL` | Dirección pública del sitio, para los enlaces de los correos. |
| `CLAVE_DEMO` | Contraseña de las cuentas de ejemplo (1234 por defecto). |
| `TRUST_PROXY` | Pon `1` cuando el sitio está detrás de un proxy, como en Railway. |
| `SEED_HISTORIAL` | Pon `0` para no generar el historial de ejemplo de 90 días. |
| `TZ_HORAS` | Zona horaria del negocio respecto a UTC (Lima es `-5`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Correo real. Sin esto los correos se simulan y el administrador los ve en su panel. |

## Subirlo a GitHub

Crea un repositorio vacío en GitHub, sin README ni `.gitignore`, y desde la carpeta del proyecto ejecuta:

```bash
git init
git add .
git commit -m "La Última Rebanada"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/la-ultima-rebanada.git
git push -u origin main
```

El archivo `.gitignore` evita que se suban `node_modules`, la base de datos y el archivo `.env`.

GitHub Pages no sirve para este proyecto porque solo hospeda archivos estáticos y aquí hace falta un servidor.

## Publicarlo en Railway

1. En [railway.com](https://railway.com) crea un proyecto con **Deploy from GitHub repo** y elige el repositorio. Railway detecta Node y ejecuta `npm start`.
2. En el servicio, entra a **Settings → Volumes** y crea un volumen montado en `/data`. Sin volumen, la base de datos se borra en cada despliegue.
3. En **Variables** agrega:

   ```
   DB_FILE=/data/rebanada.db
   JWT_SECRET=un-texto-largo-y-aleatorio
   TRUST_PROXY=1
   CLAVE_DEMO=una-clave-que-no-sea-1234
   BASE_URL=https://tu-dominio.up.railway.app
   ```

4. En **Settings → Networking** presiona **Generate Domain** para obtener la dirección pública y pon esa misma dirección en `BASE_URL`.

Cada vez que hagas `git push`, Railway vuelve a desplegar solo. Revisa los límites del plan gratuito antes de dejarlo publicado.
