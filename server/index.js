const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const express = require("express");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");

const db = require("./db");
const cat = require("./catalogo");
const correo = require("./correo");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

function obtenerSecreto() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.DB_FILE === ":memory:") return crypto.randomBytes(48).toString("hex");
    const file = path.join(process.env.DB_FILE ? path.dirname(process.env.DB_FILE) : path.join(__dirname, "..", "data"), ".jwt_secret");
    try { return fs.readFileSync(file, "utf8"); } catch (e) {  }
    const s = crypto.randomBytes(48).toString("hex");
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, s, { mode: 0o600 }); } catch (e) {  }
    return s;
}
const JWT_SECRET = obtenerSecreto();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
app.use(express.json({ limit: "50kb" }));
app.use((req, res, next) => {
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "geolocation=(self)"
    });
    next();
});

const avisarCambio = (pedidoId = null) => io.emit("cambio", { pedidoId });

const ahora = () => Date.now();
const texto = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const err = (res, status, mensaje) => res.status(status).json({ error: mensaje });
const ROLES = ["cliente", "cocinero", "delivery", "admin"];
const PREFIJOS = { cliente: "U-", cocinero: "C-", delivery: "D-", admin: "" };
const FINALES = ["entregado", "cancelado"];

const limiteAuth = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === "test" ? 10000 : 30,
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." }
});

const publico = (u) => ({ usuario: u.usuario, rol: u.rol, nombre: u.nombre, telefono: u.telefono, email: u.email || "" });
const firmar = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: u.rol === "cliente" ? "30d" : "12h" });

function autenticar(req, res, next) {
    const h = req.get("Authorization") || "";
    if (h.startsWith("Bearer ")) {
        try {
            const { id } = jwt.verify(h.slice(7), JWT_SECRET);
            const u = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
            if (u && !u.activo) return err(res, 401, "Tu cuenta fue inhabilitada. Comunícate con administración.");
            if (u) req.user = u;
        } catch (e) {
            return err(res, 401, "Sesión vencida. Vuelve a iniciar sesión.");
        }
    }
    next();
}
app.use("/api", autenticar);

const exigir = (...roles) => (req, res, next) => {
    if (!req.user) return err(res, 401, "Debes iniciar sesión.");
    if (!roles.includes(req.user.rol)) return err(res, 403, "No tienes permiso para esta acción.");
    next();
};

app.get("/api/catalogo", (req, res) => {
    res.json({
        tienda: cat.TIENDA, radioKm: cat.RADIO_KM,
        menu: cat.MENU, categorias: cat.CATEGORIAS, tamanos: cat.TAMANOS, masas: cat.MASAS,
        toppings: cat.TOPPINGS, cupones: cat.CUPONES, etiquetasRepartidor: cat.ETIQUETAS_REPARTIDOR, envio: cat.ENVIO, distritos: cat.DISTRITOS, envioFuera: cat.ENVIO_FUERA, distritosExtra: cat.DISTRITOS_EXTRA.map(d => d.nombre),
        negocio: estadoTienda()
    });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const etiquetasDe = (txt) => (txt ? String(txt).split(",").filter(Boolean) : []);
const fechaCorta = (ts) => new Date(ts + cat.TZ_HORAS * 3600000).toISOString().slice(0, 10).split("-").reverse().join("/");

function crearUsuario({ nombre, rol, password, telefono, email, dni, porAdmin = false }) {
    const limpio = texto(nombre, 40).toLowerCase().replace(/\s+/g, "");
    if (!limpio || !/^[\p{L}\p{N}._-]+$/u.test(limpio)) return { error: "El usuario solo puede tener letras, números, punto, guion y guion bajo." };
    if (!ROLES.includes(rol)) return { error: "Rol no válido." };
    if (typeof password !== "string" || password.length < 4 || password.length > 72) return { error: "La contraseña debe tener entre 4 y 72 caracteres." };

    const correoLimpio = texto(email, 120).toLowerCase();
    if (rol === "cliente" && !correoLimpio) return { error: "Escribe tu correo electrónico: ahí te enviaremos el comprobante." };
    if (correoLimpio && !EMAIL_RE.test(correoLimpio)) return { error: "El correo electrónico no es válido." };

    const dniLimpio = texto(dni, 12).replace(/\s/g, "");
    if (rol !== "cliente") {
        if (!/^\d{8}$/.test(dniLimpio)) return { error: "El DNI del personal es obligatorio (8 dígitos)." };
        const previo = db.prepare("SELECT * FROM usuarios WHERE dni = ?").get(dniLimpio);
        if (previo) {
            return previo.activo
                ? { error: `Ya existe una cuenta del personal con el DNI ${dniLimpio} (${previo.usuario}).` }
                : { error: `Esta persona (DNI ${dniLimpio}) fue INHABILITADA el ${fechaCorta(previo.inhabilitado_en)}: "${previo.inhabilitado_motivo}". No puede volver a trabajar en el establecimiento.`, bloqueada: true };
        }
    }
    if (correoLimpio) {
        const previoMail = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(correoLimpio);
        if (previoMail) {
            if (porAdmin && !previoMail.activo && previoMail.rol !== "cliente") {
                return { error: `Ese correo pertenece a ${previoMail.nombre}, personal INHABILITADO el ${fechaCorta(previoMail.inhabilitado_en)}. No puede volver a trabajar en el establecimiento.`, bloqueada: true };
            }
            return { error: "Ese correo ya está registrado. Inicia sesión." };
        }
    }

    const usuario = PREFIJOS[rol] + limpio;
    if (db.prepare("SELECT 1 FROM usuarios WHERE usuario = ?").get(usuario)) return { error: `El usuario "${usuario}" ya existe.` };
    const info = db.prepare("INSERT INTO usuarios (usuario,password_hash,rol,nombre,telefono,email,dni,creado) VALUES (?,?,?,?,?,?,?,?)")
        .run(usuario, bcrypt.hashSync(password, 10), rol, texto(nombre, 60), texto(telefono, 20), correoLimpio || null, rol === "cliente" ? null : dniLimpio, ahora());
    return { user: db.prepare("SELECT * FROM usuarios WHERE id = ?").get(info.lastInsertRowid) };
}

app.post("/api/auth/login", limiteAuth, (req, res) => {
    const { usuario, password } = req.body || {};
    const ident = texto(usuario, 120);
    const u = db.prepare("SELECT * FROM usuarios WHERE usuario = ? OR email = ?").get(ident, ident.toLowerCase());
    if (!u || typeof password !== "string" || !bcrypt.compareSync(password, u.password_hash)) {
        return err(res, 401, "Usuario o contraseña incorrectos.");
    }
    if (!u.activo) return err(res, 403, "Tu cuenta está inhabilitada. Comunícate con administración.");
    res.json({ token: firmar(u), usuario: publico(u) });
});

app.post("/api/auth/register", limiteAuth, (req, res) => {
    const { nombre, password, telefono, email } = req.body || {};
    const r = crearUsuario({ nombre, rol: "cliente", password, telefono, email });
    if (r.error) return err(res, 400, r.error);
    correo.enviarEnSegundoPlano(correo.bienvenida(r.user));
    res.status(201).json({ token: firmar(r.user), usuario: publico(r.user) });
});

app.get("/api/auth/me", exigir(...ROLES), (req, res) => res.json({ usuario: publico(req.user) }));

const qItems = db.prepare("SELECT producto_id id, categoria cat, nombre, detalle, precio, cantidad cant FROM detalle_pedido WHERE pedido_id = ? ORDER BY id");
const qHist = db.prepare("SELECT estado, ts FROM historial_estados WHERE pedido_id = ? ORDER BY id");
const qUsuarioId = db.prepare("SELECT usuario, nombre, telefono FROM usuarios WHERE id = ?");

function paradasAntes(p) {
    if (!p.ruta_orden || !p.repartidor_id || !["recogido", "camino"].includes(p.estado)) return 0;
    return db.prepare(`SELECT COUNT(*) n FROM pedidos WHERE repartidor_id = ? AND id != ? AND estado IN ('recogido','camino')
        AND ruta_orden IS NOT NULL AND ruta_orden < ?`).get(p.repartidor_id, p.id, p.ruta_orden).n;
}

const KMH_REPARTO = 24, DESVIO_CALLES = 1.35, MIN_ENTREGA = 3;
function etaRuta(p) {
    if (!p.ruta_orden || !p.repartidor_id || !["recogido", "camino"].includes(p.estado)) return null;
    const previos = db.prepare(`SELECT * FROM pedidos WHERE repartidor_id = ? AND estado IN ('recogido','camino')
        AND ruta_orden IS NOT NULL AND ruta_orden <= ? ORDER BY ruta_orden`).all(p.repartidor_id, p.ruta_orden);
    let t = ahora(), punto = null;
    previos.forEach((h, i) => {
        const desde = h.estado === "camino" && h.rep_lat != null ? { lat: h.rep_lat, lng: h.rep_lng }
            : i === 0 ? (h.origen_lat != null ? { lat: h.origen_lat, lng: h.origen_lng } : cat.TIENDA) : punto;
        const km = cat.distanciaKm(desde, { lat: h.lat, lng: h.lng }) * DESVIO_CALLES;
        t += (km / KMH_REPARTO) * 3600000 + (i > 0 ? MIN_ENTREGA * 60000 : 0);
        punto = { lat: h.lat, lng: h.lng };
    });
    return Math.round(t);
}

function serializar(p, vista) {
    const rep = p.repartidor_id ? qUsuarioId.get(p.repartidor_id) : null;
    const distrito = cat.DISTRITOS.find(d => d.nombre === p.distrito);
    const o = {
        id: p.id, tipo: p.tipo, estado: p.estado, distrito: p.distrito,
        items: qItems.all(p.id), historial: qHist.all(p.id),
        subtotal: p.subtotal, envio: p.envio, recargoZona: p.recargo_zona || 0, descuento: p.descuento, cupon: p.cupon, total: p.total, pago: p.pago,
        creado: p.creado, eta: etaRuta(p) || p.eta, progreso: p.progreso,
        repLat: p.rep_lat, repLng: p.rep_lng,
        parada: p.ruta_orden || null, paradasAntes: paradasAntes(p),
        origenLat: p.origen_lat, origenLng: p.origen_lng,
        repartidor: rep ? rep.usuario : null, repartidorNombre: rep ? rep.nombre : null,
        calificacion: p.cal_estrellas ? { estrellas: p.cal_estrellas, comentario: p.cal_comentario || "" } : null,
        cliente: { nombre: p.cliente_nombre },
        lat: p.lat, lng: p.lng
    };
    if (vista === "dueno" || vista === "admin") {
        o.calRepartidor = p.rep_estrellas ? { estrellas: p.rep_estrellas, comentario: p.rep_comentario || "", etiquetas: etiquetasDe(p.rep_etiquetas) } : null;
    }
    if (vista === "cocina") {
        o.notas = p.notas;
        o.lat = o.lng = null;
    } else if (vista === "publico") {
        o.lat = distrito ? distrito.lat : null;
        o.lng = distrito ? distrito.lng : null;
    } else {
        o.cliente.telefono = p.cliente_telefono;
        o.direccion = p.direccion; o.referencia = p.referencia; o.notas = p.notas; o.pagaCon = p.paga_con;
        if (vista === "dueno" || vista === "admin") o.repartidorTelefono = rep ? rep.telefono : null;
        if (vista === "dueno") { o.codigo = p.codigo; o.mio = true; }
    }
    return o;
}

const esDueno = (p, req) => !!req.user && p.cliente_id === req.user.id;

function crearPedidoDB({ clienteId, nombre, telefono, tipo, direccion, distrito, referencia, lat, lng, items, t, recargo = 0, pago, pagaCon, notas }) {
    const creado = ahora();
    const eta = creado + (tipo === "recojo" ? cat.ENVIO.minutosRecojo : cat.ENVIO.minutosDelivery) * 60000;
    const codigo = String(crypto.randomInt(1000, 10000));
    const envio = cat.redondear(t.envio + recargo), total = cat.redondear(t.total + recargo);
    return db.transaction(() => {
        const info = db.prepare(`INSERT INTO pedidos (cliente_id,cliente_nombre,cliente_telefono,tipo,direccion,distrito,referencia,lat,lng,
            subtotal,envio,descuento,cupon,total,pago,paga_con,notas,estado,codigo,creado,eta,recargo_zona)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'cola',?,?,?,?)`)
            .run(clienteId, nombre, telefono, tipo, direccion, distrito, referencia, lat, lng,
                t.subtotal, envio, t.descuento, t.cupon, total, pago, pagaCon, notas, codigo, creado, eta, recargo);
        const pid = info.lastInsertRowid;
        const ins = db.prepare("INSERT INTO detalle_pedido (pedido_id,producto_id,categoria,nombre,detalle,precio,cantidad) VALUES (?,?,?,?,?,?,?)");
        items.forEach(i => ins.run(pid, i.id, i.cat, i.nombre, i.detalle, i.precio, i.cant));
        db.prepare("INSERT INTO historial_estados (pedido_id,estado,ts,usuario_id) VALUES (?,?,?,?)").run(pid, "cola", creado, clienteId);
        notificar("info", pid, `Nuevo pedido #${pid} (${tipo === "recojo" ? "recojo" : "delivery"}) por S/ ${total.toFixed(2)}${recargo > 0 ? ` · incluye recargo por zona S/ ${recargo.toFixed(2)}` : ""}`);
        return pid;
    })();
}

const metaGet = (k, d = "") => { const r = db.prepare("SELECT valor FROM meta WHERE clave = ?").get(k); return r ? r.valor : d; };
const metaSet = (k, v) => db.prepare("INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(k, String(v));
function estadoTienda() {
    return { abierta: metaGet("tienda_abierta", "1") === "1", mensaje: metaGet("tienda_mensaje"), desde: Number(metaGet("tienda_desde", "0")) || null };
}
function negocioCerrado(res) {
    const t = estadoTienda();
    if (t.abierta) return false;
    err(res, 409, "😴 Estamos cerrados por ahora y no recibimos pedidos." + (t.mensaje ? " " + t.mensaje : ""));
    return true;
}
app.get("/api/tienda", (req, res) => res.json(estadoTienda()));
app.put("/api/tienda", exigir("admin"), (req, res) => {
    const b = req.body || {};
    if (typeof b.abierta !== "boolean") return err(res, 400, "Indica si el negocio está abierto o cerrado.");
    const antes = estadoTienda();
    metaSet("tienda_abierta", b.abierta ? "1" : "0");
    metaSet("tienda_mensaje", b.abierta ? "" : texto(b.mensaje, 120));
    if (antes.abierta !== b.abierta) metaSet("tienda_desde", ahora());
    const enCurso = db.prepare("SELECT COUNT(*) n FROM pedidos WHERE estado NOT IN ('entregado','cancelado')").get().n;
    notificar("info", null, b.abierta ? "El negocio volvió a recibir pedidos" : `El negocio cerró${enCurso ? ` (${enCurso} pedidos en curso siguen su flujo)` : ""}`);
    avisarCambio();
    res.json({ ...estadoTienda(), enCurso });
});

app.post("/api/pedidos", (req, res, next) => {
    if (!req.user) return err(res, 401, "Para comprar necesitas iniciar sesión o crear una cuenta.");
    if (req.user.rol !== "cliente") return err(res, 403, "Las cuentas de personal no pueden realizar compras.");
    next();
}, (req, res) => {
    if (negocioCerrado(res)) return;
    const b = req.body || {};
    const tipo = b.tipo === "recojo" ? "recojo" : b.tipo === "delivery" ? "delivery" : null;
    if (!tipo) return err(res, 400, "Tipo de servicio no válido.");

    const nombre = texto(b.cliente && b.cliente.nombre, 60);
    const telefono = texto(b.cliente && b.cliente.telefono, 20);
    if (!nombre) return err(res, 400, "Escribe tu nombre.");
    if (telefono.replace(/\D/g, "").length < 7) return err(res, 400, "Escribe un celular válido.");

    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) return err(res, 400, "El pedido no tiene productos válidos.");
    const items = [];
    for (const e of b.items) {
        const r = cat.calcularItem(e || {});
        if (!r.ok) return err(res, 400, r.error);
        items.push(r.item);
    }

    let direccion = "", distrito = "", referencia = "", lat = null, lng = null;
    if (tipo === "delivery") {
        direccion = texto(b.direccion, 150);
        const d = cat.DISTRITOS.find(x => x.nombre === b.distrito);
        if (!direccion) return err(res, 400, "Escribe la dirección de entrega.");
        if (!d) return err(res, 400, "Selecciona un distrito de nuestra zona de cobertura.");
        distrito = d.nombre;
        referencia = texto(b.referencia, 120);
        const pin = (Number.isFinite(b.lat) && Number.isFinite(b.lng) && Math.abs(b.lat) <= 90 && Math.abs(b.lng) <= 180)
            ? { lat: b.lat, lng: b.lng } : { lat: d.lat, lng: d.lng };
        const km = cat.distanciaKm(cat.TIENDA, pin);
        if (km > cat.RADIO_KM) return err(res, 400, `Tu ubicación está a ${km.toFixed(1)} km: fuera de nuestro radio de ${cat.RADIO_KM} km.`);
        lat = pin.lat; lng = pin.lng;
    }

    const pago = cat.PAGOS.includes(b.pago) ? b.pago : null;
    if (!pago) return err(res, 400, "Método de pago no válido.");
    const pagaCon = Number.isFinite(b.pagaCon) && b.pagaCon > 0 && b.pagaCon < 5000 ? b.pagaCon : null;

    const t = cat.calcularTotales(items, tipo, b.cupon);
    const id = crearPedidoDB({ clienteId: req.user.id, nombre, telefono, tipo, direccion, distrito, referencia, lat, lng, items, t, pago, pagaCon, notas: texto(b.notas, 200) });

    avisarCambio(id);
    const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id);
    const dueno = serializar(p, "dueno");
    correo.enviarEnSegundoPlano(correo.comprobantePedido({ ...dueno, direccion: p.direccion, referencia: p.referencia }, req.user));
    res.status(201).json(dueno);
});

function notificar(tipo, pedidoId, textoMsg) {
    db.prepare("INSERT INTO notificaciones (tipo,pedido_id,texto,ts) VALUES (?,?,?,?)").run(tipo, pedidoId, textoMsg, ahora());
}

app.get("/api/pedidos", exigir("cocinero", "delivery", "admin"), (req, res) => {
    const rol = req.user.rol;
    let filas;
    if (rol === "cocinero") filas = db.prepare("SELECT * FROM pedidos WHERE estado IN ('cola','cocinando','horno','listo') ORDER BY creado").all();
    else if (rol === "delivery") filas = db.prepare("SELECT * FROM pedidos WHERE repartidor_id = ? ORDER BY creado DESC LIMIT 100").all(req.user.id);
    else filas = db.prepare("SELECT * FROM pedidos ORDER BY creado DESC LIMIT 300").all();
    const vista = rol === "cocinero" ? "cocina" : rol === "delivery" ? "reparto" : "admin";
    res.json(filas.map(p => serializar(p, vista)));
});

app.get("/api/mis-pedidos", exigir("cliente"), (req, res) => {
    const filas = db.prepare("SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY creado DESC LIMIT 30").all(req.user.id);
    res.json(filas.map(p => serializar(p, "dueno")));
});

app.get("/api/seguimiento/:id", (req, res) => {
    const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(Number(req.params.id));
    if (!p) return err(res, 404, "Pedido no encontrado.");
    res.json(serializar(p, esDueno(p, req) ? "dueno" : "publico"));
});

const COCINA = { cola: "cocinando", cocinando: "horno", horno: "listo" };

function descontarInsumos(pedidoId) {
    const lineas = db.prepare("SELECT producto_id, categoria, cantidad FROM detalle_pedido WHERE pedido_id = ?").all(pedidoId);
    const restar = db.prepare("UPDATE inventario SET stock = MAX(0, ROUND(stock - ?, 2)) WHERE id = ?");
    for (const l of lineas) for (const [insumo, n] of Object.entries(cat.insumosDe(l.categoria, l.producto_id, l.cantidad))) restar.run(n, insumo);
}

app.patch("/api/pedidos/:id/estado", exigir("cocinero", "delivery", "admin"), (req, res) => {
    const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(Number(req.params.id));
    if (!p) return err(res, 404, "Pedido no encontrado.");
    const rol = req.user.rol;
    const { estado: nuevo, codigo, repartidor } = req.body || {};
    const desde = p.estado;

    const rechazo = (m, s = 409) => err(res, s, m);
    if (FINALES.includes(desde)) return rechazo("Este pedido ya está cerrado.");

    const verificarCodigo = () => String(codigo || "").trim() === p.codigo;

    if (nuevo === "cancelado") {
        if (rol !== "admin") return rechazo("Solo administración puede cancelar pedidos.", 403);
    }
    else if (COCINA[desde] === nuevo) {
        if (rol !== "cocinero" && rol !== "admin") return rechazo("Solo cocina puede preparar pedidos.", 403);
        if (nuevo === "cocinando") descontarInsumos(p.id);
    }
    else if (desde === "listo" && nuevo === "entregado" && p.tipo === "recojo") {
        if (rol !== "cocinero" && rol !== "admin") return rechazo("No tienes permiso para entregar en tienda.", 403);
        if (!verificarCodigo()) return rechazo("Código incorrecto.", 400);
    }
    else if (desde === "listo" && nuevo === "asignado" && p.tipo === "delivery") {
        if (rol !== "admin") return rechazo("Solo administración asigna repartidores.", 403);
        const r = db.prepare("SELECT * FROM usuarios WHERE usuario = ? AND rol = 'delivery'").get(texto(repartidor, 60));
        if (!r) return rechazo("Repartidor no válido.", 400);
        if (!r.activo) return rechazo("Ese repartidor está inhabilitado y no puede recibir pedidos.", 409);
        db.prepare("UPDATE pedidos SET repartidor_id = ? WHERE id = ?").run(r.id, p.id);
        p.repartidor_id = r.id;
    }
    else if ((desde === "asignado" && nuevo === "recogido") || (desde === "recogido" && nuevo === "camino") || (desde === "camino" && nuevo === "entregado")) {
        if (rol !== "delivery" && rol !== "admin") return rechazo("Solo el repartidor puede hacer esto.", 403);
        if (rol === "delivery" && p.repartidor_id !== req.user.id) return rechazo("Este pedido no es tuyo.", 403);
        if (nuevo === "entregado" && !verificarCodigo()) return rechazo("Código incorrecto: no se puede finalizar la entrega.", 400);
        if (nuevo === "camino" && db.prepare("SELECT 1 FROM pedidos WHERE repartidor_id = ? AND estado = 'camino' AND id != ?").get(p.repartidor_id, p.id))
            return rechazo("Termina primero la entrega que tienes en camino.");
        if (nuevo === "recogido") db.prepare("UPDATE pedidos SET progreso = 0, rep_lat = NULL, rep_lng = NULL WHERE id = ?").run(p.id);
        if (nuevo === "entregado") db.prepare("UPDATE pedidos SET progreso = 1, ruta_orden = NULL WHERE id = ?").run(p.id);
    }
    else {
        return rechazo(`Transición no permitida: ${desde} → ${nuevo}.`);
    }

    db.transaction(() => {
        db.prepare("UPDATE pedidos SET estado = ? WHERE id = ?").run(nuevo, p.id);
        db.prepare("INSERT INTO historial_estados (pedido_id,estado,ts,usuario_id) VALUES (?,?,?,?)").run(p.id, nuevo, ahora(), req.user.id);
        if (nuevo === "listo") {
            notificar("listo", p.id, p.tipo === "recojo"
                ? `#${p.id} está listo para que el cliente lo recoja`
                : `#${p.id} está listo y espera repartidor (${p.distrito})`);
        } else if (nuevo === "asignado") {
            const r = qUsuarioId.get(p.repartidor_id);
            notificar("info", p.id, `#${p.id} asignado a ${r.nombre}`);
        } else if (nuevo === "cancelado") {
            notificar("info", p.id, `Pedido #${p.id} cancelado por administración`);
        }
    })();

    if (nuevo === "entregado" && p.cliente_id) {
        const cli = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(p.cliente_id);
        if (cli && cli.email) correo.enviarEnSegundoPlano(correo.pedidoEntregado(p, cli));
    }
    if (nuevo === "entregado" && p.tipo === "delivery") avanzarRuta(p);
    avisarCambio(p.id);
    res.json(serializar(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(p.id), rol === "cocinero" ? "cocina" : rol === "delivery" ? "reparto" : "admin"));
});

const MAX_PARADAS = 8;

function avanzarRuta(entregado) {
    if (!entregado.repartidor_id) return;
    if (db.prepare("SELECT 1 FROM pedidos WHERE repartidor_id = ? AND estado = 'camino'").get(entregado.repartidor_id)) return;
    const sig = db.prepare(`SELECT * FROM pedidos WHERE repartidor_id = ? AND estado = 'recogido' AND ruta_orden IS NOT NULL
        ORDER BY ruta_orden LIMIT 1`).get(entregado.repartidor_id);
    if (!sig) return;
    db.transaction(() => {
        db.prepare("UPDATE pedidos SET estado='camino', progreso=0, origen_lat=?, origen_lng=?, rep_lat=?, rep_lng=? WHERE id=?")
            .run(entregado.lat, entregado.lng, entregado.lat, entregado.lng, sig.id);
        db.prepare("INSERT INTO historial_estados (pedido_id,estado,ts,usuario_id) VALUES (?,?,?,?)").run(sig.id, "camino", ahora(), entregado.repartidor_id);
    })();
    avisarCambio(sig.id);
}

app.post("/api/ruta", exigir("delivery"), (req, res) => {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number) : [];
    if (!ids.length) return err(res, 400, "Elige al menos un pedido para la ruta.");
    if (ids.length > MAX_PARADAS) return err(res, 400, `Una ruta admite hasta ${MAX_PARADAS} paradas.`);
    if (ids.some(n => !Number.isInteger(n)) || new Set(ids).size !== ids.length) return err(res, 400, "Lista de pedidos no válida.");
    const filas = ids.map(id => db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id));
    if (filas.some(f => !f || f.repartidor_id !== req.user.id || f.tipo !== "delivery")) return err(res, 403, "Algún pedido no es tuyo.");
    if (filas.some(f => !["asignado", "recogido"].includes(f.estado))) return err(res, 409, "Solo puedes ordenar pedidos por recoger o ya recogidos.");

    const actual = db.prepare("SELECT ruta_orden FROM pedidos WHERE repartidor_id = ? AND estado = 'camino'").get(req.user.id);
    const base = actual ? (actual.ruta_orden || 0) : 0;
    db.transaction(() => {
        filas.forEach((f, i) => {
            if (f.estado === "asignado") {
                db.prepare("UPDATE pedidos SET estado='recogido', progreso=0, rep_lat=NULL, rep_lng=NULL, origen_lat=NULL, origen_lng=NULL WHERE id=?").run(f.id);
                db.prepare("INSERT INTO historial_estados (pedido_id,estado,ts,usuario_id) VALUES (?,?,?,?)").run(f.id, "recogido", ahora(), req.user.id);
            }
            db.prepare("UPDATE pedidos SET ruta_orden = ? WHERE id = ?").run(base + i + 1, f.id);
        });
        if (!actual) {
            const primero = filas[0];
            db.prepare("UPDATE pedidos SET estado='camino', progreso=0, origen_lat=NULL, origen_lng=NULL WHERE id=?").run(primero.id);
            db.prepare("INSERT INTO historial_estados (pedido_id,estado,ts,usuario_id) VALUES (?,?,?,?)").run(primero.id, "camino", ahora(), req.user.id);
        }
    })();
    filas.forEach(f => avisarCambio(f.id));
    res.json({ ok: true, paradas: ids.length });
});

app.post("/api/pedidos/:id/cancelar", (req, res) => {
    const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(Number(req.params.id));
    if (!p) return err(res, 404, "Pedido no encontrado.");
    if (!esDueno(p, req)) return err(res, 403, "Este pedido no es tuyo.");
    if (p.estado !== "cola") return err(res, 409, "Ya no se puede cancelar: la cocina empezó a prepararlo.");
    db.transaction(() => {
        db.prepare("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?").run(p.id);
        db.prepare("INSERT INTO historial_estados (pedido_id,estado,ts,usuario_id) VALUES (?,?,?,?)").run(p.id, "cancelado", ahora(), req.user ? req.user.id : null);
        notificar("info", p.id, `El cliente canceló el pedido #${p.id}`);
    })();
    avisarCambio(p.id);
    res.json({ ok: true });
});

app.post("/api/pedidos/:id/ubicacion", exigir("delivery"), (req, res) => {
    const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(Number(req.params.id));
    if (!p || p.repartidor_id !== req.user.id) return err(res, 403, "Este pedido no es tuyo.");
    if (!["recogido", "camino"].includes(p.estado)) return err(res, 409, "El pedido no está en reparto.");
    const { lat, lng, progreso } = req.body || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return err(res, 400, "Ubicación no válida.");
    const prog = Number.isFinite(progreso) ? Math.min(0.97, Math.max(0, progreso)) : p.progreso;
    db.prepare("UPDATE pedidos SET rep_lat = ?, rep_lng = ?, progreso = ? WHERE id = ?").run(lat, lng, prog, p.id);
    avisarCambio(p.id);
    res.json({ ok: true });
});

app.post("/api/pedidos/:id/calificacion", (req, res) => {
    const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(Number(req.params.id));
    if (!p) return err(res, 404, "Pedido no encontrado.");
    const b = req.body || {};
    if (!esDueno(p, req)) return err(res, 403, "Este pedido no es tuyo.");
    if (p.estado !== "entregado") return err(res, 409, "Solo puedes calificar pedidos entregados.");
    if (p.cal_estrellas) return err(res, 409, "Este pedido ya fue calificado.");
    const e = Number(b.estrellas);
    if (!Number.isInteger(e) || e < 1 || e > 5) return err(res, 400, "Elige de 1 a 5 estrellas.");
    db.prepare("UPDATE pedidos SET cal_estrellas = ?, cal_comentario = ? WHERE id = ?").run(e, texto(b.comentario, 300), p.id);
    avisarCambio(p.id);
    res.json({ ok: true });
});

app.get("/api/usuarios", exigir("admin"), (req, res) => {
    res.json(db.prepare(`SELECT u.usuario, u.rol, u.nombre, u.telefono, u.email, u.dni, u.activo, u.creado,
            u.inhabilitado_en inhabilitadoEn, u.inhabilitado_motivo motivo, a.nombre inhabilitadoPor
        FROM usuarios u LEFT JOIN usuarios a ON a.id = u.inhabilitado_por ORDER BY u.id`).all()
        .map(u => ({ ...u, activo: !!u.activo })));
});

app.post("/api/usuarios", exigir("admin"), (req, res) => {
    const r = crearUsuario({ ...(req.body || {}), porAdmin: true });
    if (r.error) return err(res, r.bloqueada ? 409 : 400, r.error);
    avisarCambio();
    res.status(201).json(publico(r.user));
});

app.delete("/api/usuarios/:usuario", exigir("admin"), (req, res) =>
    err(res, 405, "Las cuentas no se eliminan: se inhabilitan para conservar el historial."));

app.post("/api/usuarios/:usuario/inhabilitar", exigir("admin"), (req, res) => {
    const u = db.prepare("SELECT * FROM usuarios WHERE usuario = ?").get(req.params.usuario);
    if (!u) return err(res, 404, "Usuario no encontrado.");
    const motivo = texto((req.body || {}).motivo, 300);
    if (motivo.length < 5) return err(res, 400, "Escribe el motivo de la inhabilitación (mínimo 5 caracteres): queda en el registro.");
    if (!u.activo) return err(res, 409, "Esa cuenta ya está inhabilitada.");
    if (u.id === req.user.id) return err(res, 409, "No puedes inhabilitar tu propia cuenta.");
    if (u.rol === "admin" && db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol = 'admin' AND activo = 1").get().n <= 1) {
        return err(res, 409, "Debe quedar al menos un administrador activo.");
    }
    if (db.prepare("SELECT 1 FROM pedidos WHERE repartidor_id = ? AND estado IN ('asignado','recogido','camino')").get(u.id)) {
        return err(res, 409, "Ese repartidor tiene una entrega en curso. Espera a que termine para inhabilitarlo.");
    }
    db.transaction(() => {
        db.prepare("UPDATE usuarios SET activo = 0, inhabilitado_en = ?, inhabilitado_motivo = ?, inhabilitado_por = ? WHERE id = ?")
            .run(ahora(), motivo, req.user.id, u.id);
        notificar("info", null, `Cuenta ${u.usuario} (${u.nombre}) inhabilitada por ${req.user.nombre}`);
    })();
    avisarCambio();
    res.json({ ok: true });
});

app.post("/api/usuarios/:usuario/reactivar", exigir("admin"), (req, res) => {
    const u = db.prepare("SELECT * FROM usuarios WHERE usuario = ?").get(req.params.usuario);
    if (!u) return err(res, 404, "Usuario no encontrado.");
    if (u.activo) return err(res, 409, "Esa cuenta ya está activa.");
    if (u.rol !== "cliente") return err(res, 403, "El personal inhabilitado no puede volver a trabajar: la inhabilitación es definitiva.");
    db.prepare("UPDATE usuarios SET activo = 1, inhabilitado_en = NULL, inhabilitado_motivo = NULL, inhabilitado_por = NULL WHERE id = ?").run(u.id);
    avisarCambio();
    res.json({ ok: true });
});

app.get("/api/inventario", exigir("admin"), (req, res) => res.json(db.prepare("SELECT * FROM inventario").all()));

app.post("/api/inventario/:id/reponer", exigir("admin"), (req, res) => {
    const r = db.prepare("UPDATE inventario SET stock = minimo * 2 WHERE id = ?").run(req.params.id);
    if (!r.changes) return err(res, 404, "Insumo no encontrado.");
    avisarCambio();
    res.json({ ok: true });
});

app.get("/api/notificaciones", exigir("admin"), (req, res) => {
    res.json(db.prepare("SELECT id,tipo,pedido_id pedidoId,texto,ts,leida FROM notificaciones ORDER BY id DESC LIMIT 30").all()
        .map(n => ({ ...n, leida: !!n.leida })));
});

app.post("/api/notificaciones/leidas", exigir("admin"), (req, res) => {
    db.prepare("UPDATE notificaciones SET leida = 1").run();
    avisarCambio();
    res.json({ ok: true });
});

app.post("/api/pedidos/:id/calificar-repartidor", (req, res) => {
    const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(Number(req.params.id));
    if (!p) return err(res, 404, "Pedido no encontrado.");
    if (!esDueno(p, req)) return err(res, 403, "Este pedido no es tuyo.");
    if (p.estado !== "entregado") return err(res, 409, "Solo puedes calificar pedidos entregados.");
    if (p.tipo !== "delivery" || !p.repartidor_id) return err(res, 409, "Este pedido no tuvo repartidor.");
    if (p.rep_estrellas) return err(res, 409, "Ya calificaste a este repartidor.");
    const b = req.body || {};
    const e = Number(b.estrellas);
    if (!Number.isInteger(e) || e < 1 || e > 5) return err(res, 400, "Elige de 1 a 5 estrellas.");
    let etiquetas = [];
    if (b.etiquetas !== undefined) {
        if (!Array.isArray(b.etiquetas) || b.etiquetas.length > 6) return err(res, 400, "Etiquetas no válidas.");
        const validas = new Set(cat.ETIQUETAS_REPARTIDOR.map(x => x.id));
        if (!b.etiquetas.every(x => typeof x === "string" && validas.has(x))) return err(res, 400, "Etiquetas no válidas.");
        etiquetas = [...new Set(b.etiquetas)];
    }
    db.prepare("UPDATE pedidos SET rep_estrellas = ?, rep_comentario = ?, rep_etiquetas = ? WHERE id = ?")
        .run(e, texto(b.comentario, 300), etiquetas.join(",") || null, p.id);
    if (etiquetas.includes("mal_estado") || etiquetas.includes("incompleto")) {
        const rp = db.prepare("SELECT nombre FROM usuarios WHERE id = ?").get(p.repartidor_id);
        const motivo = [etiquetas.includes("mal_estado") && "pedido en mal estado", etiquetas.includes("incompleto") && "pedido incompleto"].filter(Boolean).join(" y ");
        notificar("alerta", p.id, `⚠️ Reporte de entrega: pedido #${p.id} — ${motivo} (repartidor: ${rp ? rp.nombre : "—"})`);
    }
    avisarCambio(p.id);
    res.json({ ok: true });
});

app.get("/api/mi-calificacion", exigir("delivery"), (req, res) => {
    const r = db.prepare("SELECT COUNT(rep_estrellas) total, ROUND(AVG(rep_estrellas), 1) promedio FROM pedidos WHERE repartidor_id = ?").get(req.user.id);
    res.json({ total: r.total, promedio: r.promedio || 0 });
});

const ESTADOS_ABIERTOS = ["pendiente", "cotizada"];

function serSolicitud(r, vista) {
    const datos = JSON.parse(r.pedido_json);
    const items = (datos.items || []).map(e => cat.calcularItem(e)).filter(x => x.ok).map(x => x.item);
    const t = cat.calcularTotales(items, "delivery", datos.cupon);
    const o = {
        id: r.id, estado: r.estado, distrito: r.distrito, direccion: r.direccion, referencia: r.referencia || "",
        kmLinea: r.km_linea, kmRuta: r.km_ruta, recargo: r.recargo, notaAdmin: r.nota_admin || "",
        items: items.map(i => ({ nombre: i.nombre, detalle: i.detalle, cant: i.cant, precio: i.precio })),
        subtotal: t.subtotal, descuento: t.descuento, envio: t.envio, cupon: t.cupon, totalBase: t.total,
        total: r.recargo != null ? cat.redondear(t.total + r.recargo) : null,
        pago: datos.pago, creado: r.creado, cotizadoEn: r.cotizado_en, resueltoEn: r.resuelto_en, pedidoId: r.pedido_id
    };
    if (vista === "admin") {
        o.cliente = { nombre: r.cliente_nombre, telefono: r.cliente_telefono };
        o.lat = r.lat; o.lng = r.lng; o.notas = datos.notas || "";
        o.sugerido = cat.recargoSugerido(r.km_linea);
    }
    return o;
}

app.post("/api/solicitudes-zona", exigir("cliente"), (req, res) => {
    if (negocioCerrado(res)) return;
    const b = req.body || {};
    const nombre = texto(b.cliente && b.cliente.nombre, 60), telefono = texto(b.cliente && b.cliente.telefono, 20);
    if (!nombre) return err(res, 400, "Escribe tu nombre.");
    if (telefono.replace(/\D/g, "").length < 7) return err(res, 400, "Escribe un celular válido.");
    const distrito = texto(b.distrito, 50), direccion = texto(b.direccion, 150);
    if (distrito.length < 2) return err(res, 400, "Escribe el distrito donde quieres recibir tu pedido.");
    if (!direccion) return err(res, 400, "Escribe la dirección de entrega.");
    if (cat.buscarDistrito(distrito, cat.DISTRITOS)) return err(res, 400, "Ese distrito está dentro de nuestra zona: haz tu pedido normal, sin evaluación.");
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) return err(res, 400, "El pedido no tiene productos válidos.");
    const items = [];
    for (const e of b.items) { const r = cat.calcularItem(e || {}); if (!r.ok) return err(res, 400, r.error); items.push(r.item); }
    const pago = cat.PAGOS.includes(b.pago) ? b.pago : null;
    if (!pago) return err(res, 400, "Método de pago no válido.");

    let lat = null, lng = null, km = null;
    if (Number.isFinite(b.lat) && Number.isFinite(b.lng) && Math.abs(b.lat) <= 90 && Math.abs(b.lng) <= 180) { lat = b.lat; lng = b.lng; }
    else { const x = cat.buscarDistrito(distrito, cat.DISTRITOS_EXTRA); if (x) { lat = x.lat; lng = x.lng; } }
    if (lat != null) km = Math.round(cat.distanciaKm(cat.TIENDA, { lat, lng }) * 10) / 10;
    if (km != null && km > cat.ENVIO_FUERA.maxKm) return err(res, 400, `Tu ubicación está a unos ${km} km: demasiado lejos para hacer delivery. Puedes recoger en tienda.`);

    const abiertas = db.prepare("SELECT COUNT(*) n FROM solicitudes_zona WHERE cliente_id = ? AND estado IN ('pendiente','cotizada')").get(req.user.id).n;
    if (abiertas >= 3) return err(res, 429, "Ya tienes 3 solicitudes en evaluación. Espera la respuesta o cancela alguna.");

    const datos = { items: b.items.map(e => ({ id: e.id, cant: e.cant, opts: e.opts })), pago, pagaCon: Number.isFinite(b.pagaCon) && b.pagaCon > 0 && b.pagaCon < 5000 ? b.pagaCon : null, notas: texto(b.notas, 200), cupon: b.cupon || null };
    const info = db.prepare(`INSERT INTO solicitudes_zona (cliente_id,cliente_nombre,cliente_telefono,distrito,direccion,referencia,lat,lng,km_linea,pedido_json,creado)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, nombre, telefono, distrito, direccion, texto(b.referencia, 120), lat, lng, km, JSON.stringify(datos), ahora());
    const id = info.lastInsertRowid;
    const t = cat.calcularTotales(items, "delivery", b.cupon);
    notificar("alerta", null, `📍 Pedido fuera de zona (solicitud #${id}): ${distrito}${km != null ? `, ~${km} km` : ", distancia por estimar"} · S/ ${t.total.toFixed(2)} sin recargo. Evalúa el recargo.`);
    avisarCambio();
    res.status(201).json(serSolicitud(db.prepare("SELECT * FROM solicitudes_zona WHERE id = ?").get(id), "dueno"));
});

app.get("/api/solicitudes-zona", exigir("cliente", "admin"), (req, res) => {
    if (req.user.rol === "admin") {
        const filas = db.prepare(`SELECT * FROM solicitudes_zona WHERE estado IN ('pendiente','cotizada')
            UNION ALL SELECT * FROM (SELECT * FROM solicitudes_zona WHERE estado NOT IN ('pendiente','cotizada') ORDER BY id DESC LIMIT 15) ORDER BY id DESC`).all();
        return res.json(filas.map(r => serSolicitud(r, "admin")));
    }
    const filas = db.prepare("SELECT * FROM solicitudes_zona WHERE cliente_id = ? ORDER BY id DESC LIMIT 20").all(req.user.id);
    res.json(filas.map(r => serSolicitud(r, "dueno")));
});

const cargarSolicitud = (req, res) => {
    const r = db.prepare("SELECT * FROM solicitudes_zona WHERE id = ?").get(Number(req.params.id));
    if (!r) { err(res, 404, "Solicitud no encontrada."); return null; }
    return r;
};

app.post("/api/solicitudes-zona/:id/cotizar", exigir("admin"), (req, res) => {
    const r = cargarSolicitud(req, res); if (!r) return;
    if (!ESTADOS_ABIERTOS.includes(r.estado)) return err(res, 409, "Esta solicitud ya fue resuelta.");
    const b = req.body || {};
    const recargo = Math.round(Number(b.recargo) * 100) / 100;
    if (!Number.isFinite(recargo) || recargo < 0 || recargo > cat.ENVIO_FUERA.maxRecargo) return err(res, 400, `El recargo debe estar entre S/ 0 y S/ ${cat.ENVIO_FUERA.maxRecargo}.`);
    const kmRuta = b.kmRuta === undefined || b.kmRuta === "" || b.kmRuta === null ? null : Number(b.kmRuta);
    if (kmRuta !== null && (!Number.isFinite(kmRuta) || kmRuta < 0 || kmRuta > 200)) return err(res, 400, "La distancia no es válida.");
    db.prepare("UPDATE solicitudes_zona SET estado='cotizada', recargo=?, km_ruta=?, nota_admin=?, cotizado_en=?, admin_id=? WHERE id=?")
        .run(recargo, kmRuta, texto(b.nota, 200) || null, ahora(), req.user.id, r.id);
    avisarCambio();
    res.json(serSolicitud(db.prepare("SELECT * FROM solicitudes_zona WHERE id = ?").get(r.id), "admin"));
});

app.post("/api/solicitudes-zona/:id/rechazar", exigir("admin"), (req, res) => {
    const r = cargarSolicitud(req, res); if (!r) return;
    if (!ESTADOS_ABIERTOS.includes(r.estado)) return err(res, 409, "Esta solicitud ya fue resuelta.");
    const motivo = texto(req.body && req.body.motivo, 200);
    if (motivo.length < 3) return err(res, 400, "Escribe el motivo para que el cliente lo entienda.");
    db.prepare("UPDATE solicitudes_zona SET estado='rechazada', nota_admin=?, resuelto_en=?, admin_id=? WHERE id=?").run(motivo, ahora(), req.user.id, r.id);
    avisarCambio();
    res.json({ ok: true });
});

app.post("/api/solicitudes-zona/:id/aceptar", exigir("cliente"), (req, res) => {
    if (negocioCerrado(res)) return;
    const r = cargarSolicitud(req, res); if (!r) return;
    if (r.cliente_id !== req.user.id) return err(res, 403, "Esta solicitud no es tuya.");
    if (r.estado !== "cotizada") return err(res, 409, r.estado === "pendiente" ? "La tienda aún está evaluando tu solicitud." : "Esta solicitud ya no está disponible.");
    const datos = JSON.parse(r.pedido_json);
    const items = [];
    for (const e of datos.items) { const x = cat.calcularItem(e); if (!x.ok) return err(res, 400, x.error); items.push(x.item); }
    const t = cat.calcularTotales(items, "delivery", datos.cupon);
    const id = db.transaction(() => {
        const pid = crearPedidoDB({ clienteId: r.cliente_id, nombre: r.cliente_nombre, telefono: r.cliente_telefono, tipo: "delivery",
            direccion: r.direccion, distrito: r.distrito, referencia: r.referencia || "", lat: r.lat, lng: r.lng,
            items, t, recargo: r.recargo || 0, pago: datos.pago, pagaCon: datos.pagaCon, notas: datos.notas || "" });
        db.prepare("UPDATE solicitudes_zona SET estado='aceptada', resuelto_en=?, pedido_id=? WHERE id=?").run(ahora(), pid, r.id);
        return pid;
    })();
    avisarCambio(id);
    const p = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id);
    const dueno = serializar(p, "dueno");
    correo.enviarEnSegundoPlano(correo.comprobantePedido({ ...dueno, direccion: p.direccion, referencia: p.referencia }, req.user));
    res.status(201).json(dueno);
});

app.post("/api/solicitudes-zona/:id/cancelar", exigir("cliente"), (req, res) => {
    const r = cargarSolicitud(req, res); if (!r) return;
    if (r.cliente_id !== req.user.id) return err(res, 403, "Esta solicitud no es tuya.");
    if (!ESTADOS_ABIERTOS.includes(r.estado)) return err(res, 409, "Esta solicitud ya fue resuelta.");
    db.prepare("UPDATE solicitudes_zona SET estado='cancelada', resuelto_en=? WHERE id=?").run(ahora(), r.id);
    notificar("info", null, `El cliente canceló la solicitud fuera de zona #${r.id} (${r.distrito})`);
    avisarCambio();
    res.json({ ok: true });
});

const nombreCorto = (n) => {
    const p = String(n || "Cliente").trim().split(/\s+/);
    return p.length > 1 ? `${p[0]} ${p[1][0].toUpperCase()}.` : p[0];
};

app.get("/api/opiniones", (req, res) => {
    const resumen = db.prepare("SELECT COUNT(*) total, ROUND(AVG(cal_estrellas), 1) promedio FROM pedidos WHERE cal_estrellas IS NOT NULL AND cal_oculta = 0").get();
    const filas = db.prepare(`SELECT id, cliente_nombre, cal_estrellas, cal_comentario, creado FROM pedidos
        WHERE cal_estrellas IS NOT NULL AND cal_oculta = 0 AND TRIM(COALESCE(cal_comentario,'')) <> ''
        ORDER BY creado DESC LIMIT 12`).all();
    const reparto = [5, 4, 3, 2, 1].map(e => ({
        estrellas: e,
        cantidad: db.prepare("SELECT COUNT(*) n FROM pedidos WHERE cal_estrellas = ? AND cal_oculta = 0").get(e).n
    }));
    res.json({
        total: resumen.total, promedio: resumen.promedio || 0, reparto,
        lista: filas.map(f => ({
            nombre: nombreCorto(f.cliente_nombre), estrellas: f.cal_estrellas, comentario: f.cal_comentario, ts: f.creado,
            productos: qItems.all(f.id).slice(0, 2).map(i => i.nombre)
        }))
    });
});

app.get("/api/opiniones/admin", exigir("admin"), (req, res) => {
    res.json(db.prepare(`SELECT id, cliente_nombre nombre, cal_estrellas estrellas, cal_comentario comentario, cal_oculta oculta, creado
        FROM pedidos WHERE cal_estrellas IS NOT NULL ORDER BY creado DESC LIMIT 40`).all().map(o => ({ ...o, oculta: !!o.oculta })));
});

app.patch("/api/pedidos/:id/opinion", exigir("admin"), (req, res) => {
    const r = db.prepare("UPDATE pedidos SET cal_oculta = ? WHERE id = ? AND cal_estrellas IS NOT NULL").run((req.body || {}).oculta ? 1 : 0, Number(req.params.id));
    if (!r.changes) return err(res, 404, "Opinión no encontrada.");
    avisarCambio();
    res.json({ ok: true });
});

const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || "") && new Date(f + "T00:00:00Z").toISOString().slice(0, 10) === f;
const sumarDias = (f, n) => new Date(new Date(f + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
const modTz = `${cat.TZ_HORAS >= 0 ? "+" : ""}${cat.TZ_HORAS} hours`;

function leerRango(q) {
    const hoy = cat.fechaLocal(Date.now());
    const hasta = q.hasta || hoy;
    const dias = Number(q.dias);
    const desde = q.desde || sumarDias(hasta, Number.isInteger(dias) && dias >= 1 && dias <= 400 ? -(dias - 1) : -29);
    if (!fechaValida(desde) || !fechaValida(hasta)) return { error: "Fechas no válidas (usa AAAA-MM-DD)." };
    if (desde > hasta) return { error: "La fecha inicial no puede ser mayor que la final." };
    if (diasEntre(desde, hasta) > 400) return { error: "El rango máximo es de 400 días." };
    return { desde, hasta, hoy };
}

function clavePeriodo(f, agrupar) {
    if (agrupar === "mes") return f.slice(0, 7);
    if (agrupar === "semana") {
        const dow = new Date(f + "T00:00:00Z").getUTCDay();
        return sumarDias(f, -((dow + 6) % 7));
    }
    return f;
}

function porDia(desde, hasta) {
    const filas = db.prepare(`SELECT date(creado/1000, 'unixepoch', ?) dia, COUNT(*) pedidos,
            SUM(estado = 'entregado') entregados, SUM(estado = 'cancelado') cancelados,
            COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total END), 0) ventas
        FROM pedidos WHERE creado >= ? AND creado < ? GROUP BY dia`)
        .all(modTz, cat.inicioDiaLocal(desde), cat.inicioDiaLocal(hasta) + 86400000);
    const mapa = new Map(filas.map(f => [f.dia, f]));
    const dias = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
        const r = mapa.get(f) || { pedidos: 0, entregados: 0, cancelados: 0, ventas: 0 };
        dias.push({ fecha: f, pedidos: r.pedidos, entregados: r.entregados, cancelados: r.cancelados, ventas: cat.redondear(r.ventas) });
    }
    return dias;
}

app.get("/api/reportes/ventas", exigir("admin"), (req, res) => {
    const rg = leerRango(req.query);
    if (rg.error) return err(res, 400, rg.error);
    const agrupar = ["dia", "semana", "mes"].includes(req.query.agrupar) ? req.query.agrupar : "dia";

    const dias = porDia(rg.desde, rg.hasta);
    const periodos = new Map();
    for (const d of dias) {
        const k = clavePeriodo(d.fecha, agrupar);
        const p = periodos.get(k) || { periodo: k, pedidos: 0, entregados: 0, cancelados: 0, ventas: 0 };
        p.pedidos += d.pedidos; p.entregados += d.entregados; p.cancelados += d.cancelados; p.ventas += d.ventas;
        periodos.set(k, p);
    }
    const serie = [...periodos.values()].map(p => ({
        ...p, ventas: cat.redondear(p.ventas), ticket: p.entregados ? cat.redondear(p.ventas / p.entregados) : 0
    }));
    const tot = serie.reduce((a, p) => ({
        pedidos: a.pedidos + p.pedidos, entregados: a.entregados + p.entregados,
        cancelados: a.cancelados + p.cancelados, ventas: a.ventas + p.ventas
    }), { pedidos: 0, entregados: 0, cancelados: 0, ventas: 0 });

    const top = db.prepare(`SELECT d.producto_id id, MAX(d.nombre) nombre, SUM(d.cantidad) cantidad, ROUND(SUM(d.precio * d.cantidad), 2) ingresos
        FROM detalle_pedido d JOIN pedidos p ON p.id = d.pedido_id
        WHERE p.estado = 'entregado' AND p.creado >= ? AND p.creado < ?
        GROUP BY d.producto_id ORDER BY cantidad DESC LIMIT 5`)
        .all(cat.inicioDiaLocal(rg.desde), cat.inicioDiaLocal(rg.hasta) + 86400000);

    res.json({
        desde: rg.desde, hasta: rg.hasta, hoy: rg.hoy, agrupar, serie, top,
        resumen: { ...tot, ventas: cat.redondear(tot.ventas), ticket: tot.entregados ? cat.redondear(tot.ventas / tot.entregados) : 0 }
    });
});

app.get("/api/reportes/demanda", exigir("admin"), (req, res) => {
    const dias = [7, 14, 30].includes(Number(req.query.dias)) ? Number(req.query.dias) : 7;
    const hasta = cat.inicioDiaLocal(cat.fechaLocal(Date.now())) + 86400000;
    const desde = hasta - dias * 86400000, antes = desde - dias * 86400000;
    const lineas = db.prepare(`SELECT d.producto_id id, d.categoria, MAX(d.nombre) nombre, SUM(d.cantidad) cantidad, ROUND(SUM(d.precio * d.cantidad), 2) ingresos
        FROM detalle_pedido d JOIN pedidos p ON p.id = d.pedido_id
        WHERE p.estado != 'cancelado' AND p.creado >= ? AND p.creado < ? GROUP BY d.producto_id, d.categoria`);
    const actual = lineas.all(desde, hasta), previo = new Map(lineas.all(antes, desde).map(l => [l.id, l.cantidad]));
    const unidades = actual.reduce((t, l) => t + l.cantidad, 0);
    const productos = actual.slice().sort((a, b) => b.cantidad - a.cantidad).slice(0, 8).map(l => ({
        id: l.id, nombre: l.nombre, cantidad: l.cantidad, ingresos: l.ingresos,
        porcentaje: unidades ? Math.round(l.cantidad / unidades * 100) : 0,
        cambio: previo.get(l.id) ? Math.round((l.cantidad - previo.get(l.id)) / previo.get(l.id) * 100) : null
    }));

    const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, pedidos: 0 }));
    db.prepare("SELECT creado FROM pedidos WHERE estado != 'cancelado' AND creado >= ? AND creado < ?").all(desde, hasta)
        .forEach(({ creado }) => { horas[new Date(creado + cat.TZ_HORAS * 3600000).getUTCHours()].pedidos++; });
    const totalPedidos = horas.reduce((t, h) => t + h.pedidos, 0);
    const picos = horas.filter(h => h.pedidos > 0).sort((a, b) => b.pedidos - a.pedidos || a.hora - b.hora).slice(0, 3);

    const consumo = {};
    actual.forEach(l => { for (const [k, v] of Object.entries(cat.insumosDe(l.categoria, l.id, l.cantidad))) consumo[k] = (consumo[k] || 0) + v; });
    const insumos = db.prepare("SELECT * FROM inventario").all().map(i => {
        const porDia = (consumo[i.id] || 0) / dias;
        const diasRestantes = porDia > 0 ? Math.round(i.stock / porDia * 10) / 10 : null;
        const estado = i.stock < i.minimo ? "critico" : diasRestantes !== null && diasRestantes < 3 ? "bajo" : "ok";
        return { id: i.id, insumo: i.insumo, stock: i.stock, minimo: i.minimo, unidad: i.unidad, consumoDia: Math.round(porDia * 100) / 100, diasRestantes, estado };
    }).sort((a, b) => (a.diasRestantes ?? 1e9) - (b.diasRestantes ?? 1e9));

    res.json({ dias, unidades, totalPedidos, productos, horas, picos, insumos });
});

app.get("/api/reportes/repartidores", exigir("admin"), (req, res) => {
    const hoy = cat.fechaLocal(Date.now());
    const fecha = req.query.fecha || hoy;
    if (!fechaValida(fecha)) return err(res, 400, "Fecha no válida (usa AAAA-MM-DD).");
    const ini = cat.inicioDiaLocal(fecha), fin = ini + 86400000;

    const reps = db.prepare("SELECT * FROM usuarios WHERE rol = 'delivery' ORDER BY activo DESC, nombre").all();
    const out = [];
    for (const r of reps) {
        const pedidos = db.prepare(`SELECT id, creado, cliente_nombre cliente, distrito, estado, total, pago, rep_estrellas estrellas, rep_comentario comentario, rep_etiquetas etiquetas
            FROM pedidos WHERE repartidor_id = ? AND creado >= ? AND creado < ? ORDER BY creado`).all(r.id, ini, fin);
        if (!r.activo && !pedidos.length) continue;
        const activo = db.prepare("SELECT id FROM pedidos WHERE repartidor_id = ? AND estado IN ('asignado','recogido','camino') LIMIT 1").get(r.id);
        const hist = db.prepare(`SELECT SUM(estado = 'entregado') entregas, COUNT(rep_estrellas) calificaciones, ROUND(AVG(rep_estrellas), 2) promedio
            FROM pedidos WHERE repartidor_id = ?`).get(r.id);
        pedidos.forEach(p => { p.etiquetas = etiquetasDe(p.etiquetas); });
        const conNota = pedidos.filter(p => p.estrellas);
        const incidencias = db.prepare(`SELECT COUNT(*) n FROM pedidos WHERE repartidor_id = ? AND (rep_etiquetas LIKE '%mal_estado%' OR rep_etiquetas LIKE '%incompleto%')`).get(r.id).n;
        out.push({
            usuario: r.usuario, nombre: r.nombre, telefono: r.telefono, dni: r.dni, activo: !!r.activo,
            inhabilitadoEn: r.inhabilitado_en, motivo: r.inhabilitado_motivo,
            estado: !r.activo ? "inhabilitado" : activo ? "en_reparto" : "disponible",
            pedidoActivo: activo ? activo.id : null,
            dia: {
                pedidos: pedidos.length,
                entregados: pedidos.filter(p => p.estado === "entregado").length,
                cobrado: cat.redondear(pedidos.filter(p => p.estado === "entregado").reduce((s, p) => s + p.total, 0)),
                calificaciones: conNota.length,
                promedio: conNota.length ? cat.redondear(conNota.reduce((s, p) => s + p.estrellas, 0) / conNota.length) : 0
            },
            total: { entregas: hist.entregas || 0, calificaciones: hist.calificaciones, promedio: hist.promedio || 0, incidencias },
            pedidos,
            opiniones: db.prepare(`SELECT id, rep_estrellas estrellas, rep_comentario comentario, rep_etiquetas etiquetas, cliente_nombre, creado FROM pedidos
                WHERE repartidor_id = ? AND rep_estrellas IS NOT NULL ORDER BY creado DESC LIMIT 6`).all(r.id)
                .map(o => ({ id: o.id, estrellas: o.estrellas, comentario: o.comentario, etiquetas: etiquetasDe(o.etiquetas), cliente: nombreCorto(o.cliente_nombre), ts: o.creado }))
        });
    }
    res.json({ fecha, hoy, repartidores: out });
});

app.get("/api/reportes/historial", exigir("admin"), (req, res) => {
    const rg = leerRango(req.query);
    if (rg.error) return err(res, 400, rg.error);
    res.json({
        desde: rg.desde, hasta: rg.hasta, hoy: rg.hoy,
        dias: porDia(rg.desde, rg.hasta).reverse().map(d => ({ ...d, ticket: d.entregados ? cat.redondear(d.ventas / d.entregados) : 0 }))
    });
});

app.get("/api/reportes/dia/:fecha", exigir("admin"), (req, res) => {
    if (!fechaValida(req.params.fecha)) return err(res, 400, "Fecha no válida.");
    const ini = cat.inicioDiaLocal(req.params.fecha);
    const filas = db.prepare(`SELECT p.id, p.creado, p.cliente_nombre cliente, p.tipo, p.distrito, p.estado, p.pago, p.total, u.nombre repartidor
        FROM pedidos p LEFT JOIN usuarios u ON u.id = p.repartidor_id
        WHERE p.creado >= ? AND p.creado < ? ORDER BY p.creado`).all(ini, ini + 86400000);
    res.json({ fecha: req.params.fecha, pedidos: filas });
});

app.get("/api/reportes/pedidos.csv", exigir("admin"), (req, res) => {
    const rg = leerRango(req.query);
    if (rg.error) return err(res, 400, rg.error);
    const filas = db.prepare(`SELECT p.id, p.creado, p.cliente_nombre, p.tipo, p.distrito, p.estado, p.pago, p.subtotal, p.descuento, p.envio, p.total,
            u.nombre repartidor, p.cal_estrellas
        FROM pedidos p LEFT JOIN usuarios u ON u.id = p.repartidor_id
        WHERE p.creado >= ? AND p.creado < ? ORDER BY p.creado`).all(cat.inicioDiaLocal(rg.desde), cat.inicioDiaLocal(rg.hasta) + 86400000);
    const celda = (v) => { let t = String(v ?? ""); if (/^[=+\-@]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const cab = ["Pedido", "Fecha", "Hora", "Cliente", "Servicio", "Distrito", "Estado", "Pago", "Subtotal", "Descuento", "Envio", "Total", "Repartidor", "Calificacion"];
    const lineas = [cab.map(celda).join(",")];
    for (const f of filas) {
        const fecha = cat.fechaLocal(f.creado);
        const hora = new Date(f.creado + cat.TZ_HORAS * 3600000).toISOString().slice(11, 16);
        lineas.push([f.id, fecha, hora, f.cliente_nombre, f.tipo, f.distrito, f.estado, f.pago, f.subtotal, f.descuento, f.envio, f.total, f.repartidor, f.cal_estrellas].map(celda).join(","));
    }
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pedidos_${rg.desde}_a_${rg.hasta}.csv"` });
    res.send("\uFEFF" + lineas.join("\r\n"));
});

app.get("/api/correos", exigir("admin"), (req, res) => {
    res.json({ modo: correo.modo, correos: correo.bandeja.map(({ html, ...c }) => ({ ...c, tieneVista: !!html })) });
});
app.get("/api/correos/:id", exigir("admin"), (req, res) => {
    const c = correo.bandeja.find(x => x.id === Number(req.params.id));
    if (!c || !c.html) return err(res, 404, "Correo no disponible.");
    res.json({ para: c.para, asunto: c.asunto, html: c.html });
});

app.use("/api", (req, res) => err(res, 404, "Ruta no encontrada."));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"], maxAge: "1h" }));

app.use((e, req, res, next) => {
    console.error(e);
    err(res, 500, "Error interno del servidor.");
});

io.on("connection", (s) => s.emit("hola", { ts: ahora() }));

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`\n  🍕 La Última Rebanada corriendo en http://localhost:${PORT}\n`);
    });
}

module.exports = { app, server, io, db, correo };
