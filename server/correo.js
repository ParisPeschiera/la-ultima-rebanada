const nodemailer = require("nodemailer");

const BASE_URL = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
const FROM = process.env.MAIL_FROM || "La Última Rebanada <no-responder@ultimarebanada.pe>";

const transporte = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    })
    : null;

const modo = transporte ? "smtp" : "simulacion";

const bandeja = [];
let contador = 0;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "S/ " + Number(n).toFixed(2);

async function enviar({ para, asunto, html }) {
    const registro = { id: ++contador, para, asunto, ts: Date.now(), estado: "simulado", html: modo === "simulacion" ? html : undefined };
    if (transporte) {
        try {
            await transporte.sendMail({ from: FROM, to: para, subject: asunto, html });
            registro.estado = "enviado";
        } catch (e) {
            registro.estado = "error";
            registro.error = e.message;
            console.error("[correo] No se pudo enviar a", para, "-", e.message);
        }
    }
    bandeja.unshift(registro);
    bandeja.length = Math.min(bandeja.length, 40);
    return registro;
}

function plantilla({ titulo, cuerpo, pie }) {
    return `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f6efe4;font-family:Arial,Helvetica,sans-serif;color:#231815">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6efe4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#d62828;color:#ffffff;padding:22px 26px">
    <div style="font-size:26px;font-weight:bold">🍕 La Última Rebanada</div>
    <div style="font-size:14px;opacity:.9;margin-top:4px">${esc(titulo)}</div>
  </td></tr>
  <tr><td style="padding:24px 26px;font-size:15px;line-height:1.5">${cuerpo}</td></tr>
  <tr><td style="background:#faf5ec;padding:16px 26px;font-size:12px;color:#6b625d;line-height:1.5">${pie || ""}
    <div style="margin-top:6px">La Última Rebanada · Av. Larco 1234, Miraflores, Lima</div>
  </td></tr>
</table></td></tr></table></body></html>`;
}

const boton = (url, texto) =>
    `<p style="text-align:center;margin:22px 0"><a href="${esc(url)}" style="background:#d62828;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:999px;display:inline-block">${esc(texto)}</a></p>`;

function comprobantePedido(pedido, usuario) {
    const fecha = new Date(pedido.creado).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" });
    const filas = pedido.items.map(i => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eadfd0">${i.cant} × <strong>${esc(i.nombre)}</strong>${i.detalle ? `<br><span style="color:#6b625d;font-size:12.5px">${esc(i.detalle)}</span>` : ""}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eadfd0;text-align:right;white-space:nowrap">${money(i.precio * i.cant)}</td>
      </tr>`).join("");
    const linea = (txt, val, fuerte) =>
        `<tr><td style="padding:3px 0;${fuerte ? "font-weight:bold;font-size:17px;" : ""}">${txt}</td><td style="padding:3px 0;text-align:right;${fuerte ? "font-weight:bold;font-size:17px;" : ""}">${val}</td></tr>`;
    const pagos = { efectivo: "Efectivo", tarjeta: "Tarjeta (POS al recibir)", yape: "Yape / Plin" };
    const entrega = pedido.tipo === "recojo"
        ? `<strong>Recojo en tienda</strong><br>Av. Larco 1234, Miraflores`
        : `<strong>Delivery</strong><br>${esc(pedido.direccion)}, ${esc(pedido.distrito)}${pedido.referencia ? `<br><span style="color:#6b625d">Ref.: ${esc(pedido.referencia)}</span>` : ""}`;

    const cuerpo = `
      <p style="margin:0 0 14px">Hola <strong>${esc(usuario.nombre)}</strong>, ¡gracias por tu compra! Este es el comprobante de tu pedido.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ec;border-radius:12px;margin-bottom:18px"><tr>
        <td style="padding:14px 16px"><div style="font-size:12px;color:#6b625d">N.º de pedido</div><div style="font-size:26px;font-weight:bold">#${pedido.id}</div></td>
        <td style="padding:14px 16px;text-align:right"><div style="font-size:12px;color:#6b625d">Fecha</div><div style="font-size:14px;font-weight:bold">${esc(fecha)}</div></td>
      </tr></table>
      <p style="margin:0 0 4px;font-size:12px;color:#6b625d;text-transform:uppercase;letter-spacing:.05em">Entrega</p>
      <p style="margin:0 0 18px">${entrega}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#6b625d;text-transform:uppercase;letter-spacing:.05em">Detalle</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
        ${linea("Subtotal", money(pedido.subtotal))}
        ${pedido.descuento ? linea(`Descuento${pedido.cupon ? " (" + esc(pedido.cupon) + ")" : ""}`, "− " + money(pedido.descuento)) : ""}
        ${linea("Envío", pedido.envio ? money(pedido.envio) : "Gratis")}
        ${linea("Total", money(pedido.total), true)}
      </table>
      <p style="margin:14px 0 0;color:#6b625d;font-size:13.5px">Método de pago: <strong style="color:#231815">${esc(pagos[pedido.pago] || pedido.pago)}</strong></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#fff8e1;border:2px dashed #f4b942;border-radius:12px"><tr><td style="padding:14px;text-align:center">
        <div style="font-size:13px">Tu código de entrega</div>
        <div style="font-size:38px;font-weight:bold;letter-spacing:.3em;padding-left:.3em">${esc(pedido.codigo)}</div>
        <div style="font-size:12px;color:#6b625d">Díselo ${pedido.tipo === "recojo" ? "al personal en caja" : "al repartidor"} solo cuando recibas tu pedido. No lo compartas por chat.</div>
      </td></tr></table>
      ${boton(`${BASE_URL}/html/index.html?pedido=${pedido.id}#pedido`, "Seguir mi pedido en vivo")}
      <p style="margin:0;color:#6b625d;font-size:13px;text-align:center">¿Cerraste la página? Con este botón vuelves a ver tu pedido en el mapa.</p>`;

    return {
        para: usuario.email,
        asunto: `Comprobante de tu pedido #${pedido.id} — La Última Rebanada`,
        html: plantilla({
            titulo: `Comprobante de pedido #${pedido.id}`,
            cuerpo,
            pie: "Este documento es un comprobante informativo de tu pedido y no reemplaza una boleta o factura electrónica."
        })
    };
}

function pedidoEntregado(pedido, usuario) {
    const cuerpo = `
      <p style="margin:0 0 12px">Hola <strong>${esc(usuario.nombre)}</strong>, tu pedido <strong>#${pedido.id}</strong> fue entregado. ¡Que lo disfrutes! 🍕</p>
      <p style="margin:0">Total pagado: <strong>${money(pedido.total)}</strong></p>
      ${boton(`${BASE_URL}/html/index.html?pedido=${pedido.id}#pedido`, "Calificar mi pedido")}
      <p style="margin:0;color:#6b625d;font-size:13px;text-align:center">Tu opinión nos ayuda a mejorar y a otros clientes a elegir.</p>`;
    return {
        para: usuario.email,
        asunto: `Tu pedido #${pedido.id} fue entregado — cuéntanos qué tal estuvo`,
        html: plantilla({ titulo: `Pedido #${pedido.id} entregado`, cuerpo })
    };
}

function bienvenida(usuario) {
    const cuerpo = `
      <p style="margin:0 0 12px">¡Hola <strong>${esc(usuario.nombre)}</strong>, bienvenido a La Última Rebanada!</p>
      <p style="margin:0 0 12px">Tu usuario es <strong>${esc(usuario.usuario)}</strong>. Cada vez que compres te enviaremos el comprobante a este correo, con un enlace para seguir tu pedido en vivo.</p>
      <p style="margin:0">Como regalo, usa el cupón <strong style="background:#f4b942;padding:2px 8px;border-radius:6px">BIENVENIDO</strong> (S/ 8 de descuento desde S/ 40).</p>
      ${boton(`${BASE_URL}/html/index.html#menu`, "Ver la carta")}`;
    return {
        para: usuario.email,
        asunto: "¡Bienvenido a La Última Rebanada!",
        html: plantilla({ titulo: "Tu cuenta está lista", cuerpo })
    };
}

const enviarEnSegundoPlano = (mensaje) => {
    if (!mensaje.para) return;
    setImmediate(() => enviar(mensaje).catch(e => console.error("[correo]", e.message)));
};

module.exports = { modo, bandeja, enviar, enviarEnSegundoPlano, comprobantePedido, pedidoEntregado, bienvenida, BASE_URL };
