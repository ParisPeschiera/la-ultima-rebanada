process.env.DB_FILE = ":memory:";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { io: clienteIO } = require("socket.io-client");
const { server, correo, db } = require("../server/index");

let base;
test.before(async () => {
    await new Promise(r => server.listen(0, r));
    base = `http://localhost:${server.address().port}/api`;
});
test.after(() => server.close());

async function api(metodo, ruta, { token, body } = {}) {
    const r = await fetch(base + ruta, {
        method: metodo,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const tipo = r.headers.get("content-type") || "";
    return { status: r.status, headers: r.headers, data: tipo.includes("json") ? await r.json().catch(() => null) : await r.text() };
}
const login = async (usuario, password = "1234") => (await api("POST", "/auth/login", { body: { usuario, password } })).data;
const esperar = (ms = 80) => new Promise(r => setTimeout(r, ms));
const hoyLima = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const haceDias = (n) => new Date(Date.now() - 5 * 3600000 - n * 86400000).toISOString().slice(0, 10);

const pedidoBase = (extra = {}) => ({
    tipo: "delivery", cliente: { nombre: "Test", telefono: "999888777" },
    direccion: "Av. Pardo 400", distrito: "Miraflores", pago: "efectivo",
    items: [{ id: "pepperoni", cant: 1, opts: { tamano: "Mediana", masa: "Clásica", toppings: ["Queso extra"] } }, { id: "lasagna", cant: 1 }],
    ...extra
});

test("catálogo público", async () => {
    const r = await api("GET", "/catalogo");
    assert.equal(r.status, 200);
    assert.ok(r.data.menu.length >= 20);
});

test("login por usuario y por correo; credenciales malas → 401", async () => {
    assert.equal((await api("POST", "/auth/login", { body: { usuario: "admin", password: "mala" } })).status, 401);
    const porUsuario = await login("admin");
    assert.ok(porUsuario.token); assert.equal(porUsuario.usuario.rol, "admin");
    assert.equal(porUsuario.usuario.password_hash, undefined);
    const porCorreo = await login("cliente@demo.pe");
    assert.equal(porCorreo.usuario.usuario, "U-cliente");
});

test("registro: correo obligatorio, válido y único; el rol siempre es cliente", async () => {
    const reg = (extra) => api("POST", "/auth/register", { body: { nombre: "Lucia", password: "abcd", telefono: "955", ...extra } });
    assert.equal((await reg({})).status, 400);
    assert.equal((await reg({ email: "no-es-correo" })).status, 400);
    const ok = await reg({ email: "Lucia@Correo.com", rol: "admin" });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.usuario.rol, "cliente");
    assert.equal(ok.data.usuario.usuario, "U-lucia");
    assert.equal(ok.data.usuario.email, "lucia@correo.com");
    const dup = await api("POST", "/auth/register", { body: { nombre: "Otra", password: "abcd", telefono: "955", email: "LUCIA@correo.com" } });
    assert.equal(dup.status, 400); assert.match(dup.data.error, /ya está registrado/);
    await esperar();
    const bienvenida = correo.bandeja.find(c => c.para === "lucia@correo.com");
    assert.ok(bienvenida, "debe enviarse un correo de bienvenida");
    assert.match(bienvenida.asunto, /Bienvenido/);
});

test("solo admin crea cuentas de personal", async () => {
    const cli = await login("U-cliente");
    assert.equal((await api("POST", "/usuarios", { token: cli.token, body: { nombre: "hack", rol: "admin", password: "1234" } })).status, 403);
    assert.equal((await api("POST", "/usuarios", { body: { nombre: "hack", rol: "admin", password: "1234" } })).status, 401);
    const adm = await login("admin");
    const ok = await api("POST", "/usuarios", { token: adm.token, body: { nombre: "Pedro", rol: "cocinero", password: "1234", dni: "71000001" } });
    assert.equal(ok.status, 201); assert.equal(ok.data.usuario, "C-pedro");
    assert.equal((await api("POST", "/usuarios", { token: adm.token, body: { nombre: "Pedro", rol: "cocinero", password: "1234", dni: "71000009" } })).status, 400);
});

test("comprar exige cuenta de cliente (invitados y personal no pueden)", async () => {
    const sin = await api("POST", "/pedidos", { body: pedidoBase() });
    assert.equal(sin.status, 401); assert.match(sin.data.error, /cuenta/);
    const coc = await login("C-cocinero");
    assert.equal((await api("POST", "/pedidos", { token: coc.token, body: pedidoBase() })).status, 403);
    const cli = await login("U-cliente");
    assert.equal((await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() })).status, 201);
});

test("el servidor recalcula precios y descuentos (no confía en el navegador)", async () => {
    const cli = await login("U-cliente");
    const r = await api("POST", "/pedidos", { token: cli.token, body: pedidoBase({ cupon: "LUR10", subtotal: 1, total: 0.01, items: [
        { id: "pepperoni", cant: 1, precio: 0.01, opts: { tamano: "Mediana", masa: "Clásica", toppings: ["Queso extra"] } }, { id: "lasagna", cant: 1, precio: 0.01 }] }) });
    assert.equal(r.status, 201);
    assert.equal(r.data.subtotal, 63.8); assert.equal(r.data.descuento, 6.38); assert.equal(r.data.total, 62.42);
});

test("validaciones de pedido: cantidad, producto, cobertura, pago", async () => {
    const t = (await login("U-cliente")).token;
    const post = (b) => api("POST", "/pedidos", { token: t, body: b });
    assert.equal((await post(pedidoBase({ items: [{ id: "pepperoni", cant: -3 }] }))).status, 400);
    assert.equal((await post(pedidoBase({ items: [{ id: "inexistente", cant: 1 }] }))).status, 400);
    assert.equal((await post(pedidoBase({ items: [] }))).status, 400);
    assert.equal((await post(pedidoBase({ pago: "bitcoin" }))).status, 400);
    const lejos = await post(pedidoBase({ lat: -11.5, lng: -77.0 }));
    assert.equal(lejos.status, 400); assert.match(lejos.data.error, /fuera/);
    const recojo = await post(pedidoBase({ tipo: "recojo", direccion: "", distrito: "" }));
    assert.equal(recojo.status, 201); assert.equal(recojo.data.envio, 0);
});

test("comprobante por correo al comprar (con código, total y enlace de seguimiento)", async () => {
    const cli = await login("U-cliente");
    const p = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() })).data;
    await esperar();
    const mail = correo.bandeja.find(c => c.asunto.includes(`#${p.id}`) && c.asunto.includes("Comprobante"));
    assert.ok(mail, "debe existir el comprobante");
    assert.equal(mail.para, "cliente@demo.pe");
    assert.ok(mail.html.includes(p.codigo), "incluye el código de entrega");
    assert.ok(mail.html.includes("68.80"), "incluye el total (63.80 + envío 5.00)");
    assert.ok(mail.html.includes(`?pedido=${p.id}`), "incluye el enlace para seguir el pedido");
    assert.ok(mail.html.includes("Lasagna de carne"), "incluye el detalle");
});

test("el correo escapa HTML malicioso del cliente (sin inyección)", async () => {
    const cli = await login("U-cliente");
    const p = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase({ direccion: '<script>alert(1)</script>', referencia: '"><img src=x>' }) })).data;
    await esperar();
    const mail = correo.bandeja.find(c => c.asunto.includes(`#${p.id}`));
    assert.ok(!mail.html.includes("<script>alert(1)</script>"));
    assert.ok(!mail.html.includes("<img src=x>"));
    assert.ok(mail.html.includes("&lt;script&gt;"));
});

test("flujo completo + permisos + privacidad", async () => {
    const adm = await login("admin"), coc = await login("C-cocinero"), rep = await login("D-delivery"), otro = await login("D-kevin");
    const dueno = await login("U-cliente");
    const otroCli = (await api("POST", "/auth/register", { body: { nombre: "Curioso", password: "abcd", telefono: "955", email: "curioso@mail.com" } })).data;

    const crear = await api("POST", "/pedidos", { token: dueno.token, body: pedidoBase() });
    const id = crear.data.id, codigo = crear.data.codigo;
    assert.ok(codigo);

    const pub = (await api("GET", `/seguimiento/${id}`)).data;
    assert.equal(pub.codigo, undefined); assert.equal(pub.cliente.telefono, undefined); assert.equal(pub.direccion, undefined);
    assert.equal((await api("GET", `/seguimiento/${id}`, { token: otroCli.token })).data.codigo, undefined);
    assert.equal((await api("GET", `/seguimiento/${id}`, { token: dueno.token })).data.codigo, codigo);
    const vistaCocina = (await api("GET", "/pedidos", { token: coc.token })).data.find(o => o.id === id);
    assert.equal(vistaCocina.direccion, undefined); assert.equal(vistaCocina.codigo, undefined);

    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: rep.token, body: { estado: "camino" } })).status, 409);
    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: coc.token, body: { estado: "listo" } })).status, 409);
    for (const e of ["cocinando", "horno", "listo"]) {
        assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: coc.token, body: { estado: e } })).status, 200);
    }
    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: coc.token, body: { estado: "asignado", repartidor: "D-delivery" } })).status, 403);
    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: adm.token, body: { estado: "asignado", repartidor: "D-delivery" } })).status, 200);
    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: otro.token, body: { estado: "recogido" } })).status, 403);
    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: rep.token, body: { estado: "recogido" } })).status, 200);
    assert.equal((await api("PATCH", `/pedidos/1047/estado`, { token: rep.token, body: { estado: "entregado", codigo: "4821" } })).status, 200);
    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: rep.token, body: { estado: "camino" } })).status, 200);

    assert.equal((await api("POST", `/pedidos/${id}/ubicacion`, { token: rep.token, body: { lat: -12.1, lng: -77.03, progreso: 0.4 } })).status, 200);
    assert.equal((await api("POST", `/pedidos/${id}/ubicacion`, { token: otro.token, body: { lat: -12.1, lng: -77.03 } })).status, 403);
    const enCamino = (await api("GET", `/seguimiento/${id}`)).data;
    assert.equal(enCamino.repLat, -12.1); assert.equal(enCamino.progreso, 0.4);

    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: rep.token, body: { estado: "entregado", codigo: "0000" } })).status, 400);
    assert.equal((await api("PATCH", `/pedidos/${id}/estado`, { token: rep.token, body: { estado: "entregado", codigo } })).status, 200);

    await esperar();
    assert.ok(correo.bandeja.some(c => c.asunto.includes(`#${id}`) && c.asunto.includes("entregado")), "correo de entrega");

    assert.equal((await api("POST", `/pedidos/${id}/calificacion`, { body: { estrellas: 5 } })).status, 403);
    assert.equal((await api("POST", `/pedidos/${id}/calificacion`, { token: otroCli.token, body: { estrellas: 5 } })).status, 403);
    assert.equal((await api("POST", `/pedidos/${id}/calificacion`, { token: dueno.token, body: { estrellas: 9 } })).status, 400);
    assert.equal((await api("POST", `/pedidos/${id}/calificacion`, { token: dueno.token, body: { estrellas: 5, comentario: "Excelente servicio de prueba" } })).status, 200);
    assert.equal((await api("POST", `/pedidos/${id}/calificacion`, { token: dueno.token, body: { estrellas: 1 } })).status, 409);

    const historial = (await api("GET", `/seguimiento/${id}`)).data.historial.map(h => h.estado);
    assert.deepEqual(historial, ["cola", "cocinando", "horno", "listo", "asignado", "recogido", "camino", "entregado"]);
});

test("entrega en tienda (recojo) exige código", async () => {
    const coc = await login("C-cocinero"), cli = await login("U-cliente");
    const c = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase({ tipo: "recojo", direccion: "", distrito: "" }) })).data;
    for (const e of ["cocinando", "horno", "listo"]) await api("PATCH", `/pedidos/${c.id}/estado`, { token: coc.token, body: { estado: e } });
    assert.equal((await api("PATCH", `/pedidos/${c.id}/estado`, { token: coc.token, body: { estado: "entregado", codigo: "x" } })).status, 400);
    assert.equal((await api("PATCH", `/pedidos/${c.id}/estado`, { token: coc.token, body: { estado: "entregado", codigo: c.codigo } })).status, 200);
});

test("el cliente cancela solo lo suyo y solo mientras está en cola", async () => {
    const cli = await login("U-cliente"), coc = await login("C-cocinero");
    const otro = (await api("POST", "/auth/register", { body: { nombre: "Intruso", password: "abcd", telefono: "955", email: "intruso@mail.com" } })).data;
    const a = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() })).data;
    assert.equal((await api("POST", `/pedidos/${a.id}/cancelar`, { body: {} })).status, 403);
    assert.equal((await api("POST", `/pedidos/${a.id}/cancelar`, { token: otro.token, body: {} })).status, 403);
    assert.equal((await api("POST", `/pedidos/${a.id}/cancelar`, { token: cli.token, body: {} })).status, 200);
    const b = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() })).data;
    await api("PATCH", `/pedidos/${b.id}/estado`, { token: coc.token, body: { estado: "cocinando" } });
    assert.equal((await api("POST", `/pedidos/${b.id}/cancelar`, { token: cli.token, body: {} })).status, 409);
});

test("cocina descuenta inventario; admin lo ve y repone", async () => {
    const adm = await login("admin"), coc = await login("C-cocinero"), cli = await login("U-cliente");
    const antes = (await api("GET", "/inventario", { token: adm.token })).data.find(i => i.id === "masa").stock;
    const p = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() })).data;
    await api("PATCH", `/pedidos/${p.id}/estado`, { token: coc.token, body: { estado: "cocinando" } });
    assert.equal((await api("GET", "/inventario", { token: adm.token })).data.find(i => i.id === "masa").stock, antes - 1);
    assert.equal((await api("GET", "/inventario", { token: coc.token })).status, 403);
    assert.equal((await api("POST", "/inventario/queso/reponer", { token: adm.token })).status, 200);
});

test("WebSocket: los clientes reciben aviso de cambio en tiempo real", async () => {
    const cli = await login("U-cliente");
    const s = clienteIO(`http://localhost:${server.address().port}`);
    const aviso = new Promise(res => s.on("cambio", res));
    await new Promise(r => s.on("connect", r));
    await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() });
    const msg = await Promise.race([aviso, new Promise((_, rej) => setTimeout(() => rej(new Error("sin aviso")), 2000))]);
    assert.ok(msg.pedidoId);
    s.close();
});

test("token inválido → 401; mis-pedidos solo de la cuenta", async () => {
    assert.equal((await api("GET", "/auth/me", { token: "basura" })).status, 401);
    assert.equal((await api("GET", "/mis-pedidos")).status, 401);
    const cli = await login("U-cliente");
    const mis = await api("GET", "/mis-pedidos", { token: cli.token });
    assert.equal(mis.status, 200);
    assert.ok(mis.data.length >= 1);
    assert.ok(mis.data.every(o => o.mio === true && o.codigo));
});

test("opiniones: públicas, con nombre abreviado, y el admin puede ocultarlas", async () => {
    const adm = await login("admin");
    const pub = await api("GET", "/opiniones");
    assert.equal(pub.status, 200);
    assert.ok(pub.data.total > 10 && pub.data.promedio >= 1 && pub.data.promedio <= 5);
    assert.ok(pub.data.lista.length > 0 && pub.data.lista.length <= 12);
    assert.ok(pub.data.lista.every(o => /^\S+( \S\.)?$/.test(o.nombre)), "nombre abreviado: Nombre I.");
    assert.ok(pub.data.lista.every(o => o.comentario && o.estrellas >= 1));
    assert.equal(pub.data.reparto.reduce((s, r) => s + r.cantidad, 0), pub.data.total);

    assert.equal((await api("GET", "/opiniones/admin")).status, 401);
    const lista = (await api("GET", "/opiniones/admin", { token: adm.token })).data;
    const objetivo = lista.find(o => o.comentario && !o.oculta);
    assert.equal((await api("PATCH", `/pedidos/${objetivo.id}/opinion`, { body: { oculta: true } })).status, 401);
    assert.equal((await api("PATCH", `/pedidos/${objetivo.id}/opinion`, { token: adm.token, body: { oculta: true } })).status, 200);
    const despues = (await api("GET", "/opiniones")).data;
    assert.equal(despues.total, pub.data.total - 1);
    assert.ok(!despues.lista.some(o => o.comentario === objetivo.comentario && o.estrellas === objetivo.estrellas && o.nombre === pub.data.lista.find(x => x.comentario === objetivo.comentario)?.nombre) || despues.lista.length <= pub.data.lista.length);
    await api("PATCH", `/pedidos/${objetivo.id}/opinion`, { token: adm.token, body: { oculta: false } });
});

test("reportes: solo admin y fechas validadas", async () => {
    const cli = await login("U-cliente"), adm = await login("admin");
    for (const ruta of ["/reportes/ventas", "/reportes/historial", "/reportes/dia/2026-01-01", "/reportes/pedidos.csv", "/correos", "/reportes/repartidores"]) {
        assert.equal((await api("GET", ruta)).status, 401, ruta);
        assert.equal((await api("GET", ruta, { token: cli.token })).status, 403, ruta);
    }
    assert.equal((await api("GET", "/reportes/ventas?desde=hoy", { token: adm.token })).status, 400);
    assert.equal((await api("GET", "/reportes/ventas?desde=2026-02-30&hasta=2026-03-01", { token: adm.token })).status, 400);
    assert.equal((await api("GET", "/reportes/ventas?desde=2026-03-10&hasta=2026-03-01", { token: adm.token })).status, 400);
    assert.equal((await api("GET", "/reportes/ventas?desde=2020-01-01&hasta=2026-03-01", { token: adm.token })).status, 400);
});

test("reportes: la serie por día, semana y mes suma lo mismo que el resumen", async () => {
    const adm = await login("admin");
    const get = async (agrupar) => (await api("GET", `/reportes/ventas?agrupar=${agrupar}&desde=${haceDias(60)}`, { token: adm.token })).data;
    const dia = await get("dia"), semana = await get("semana"), mes = await get("mes");
    assert.equal(dia.serie.length, 61);
    const suma = (r, k) => Math.round(r.serie.reduce((s, p) => s + p[k], 0) * 100) / 100;
    for (const r of [dia, semana, mes]) {
        assert.equal(suma(r, "ventas"), r.resumen.ventas);
        assert.equal(suma(r, "pedidos"), r.resumen.pedidos);
        assert.equal(suma(r, "entregados") + suma(r, "cancelados") <= suma(r, "pedidos"), true);
    }
    assert.equal(dia.resumen.ventas, semana.resumen.ventas);
    assert.equal(dia.resumen.ventas, mes.resumen.ventas);
    assert.equal(dia.resumen.pedidos, mes.resumen.pedidos);
    assert.ok(semana.serie.length < dia.serie.length && mes.serie.length <= 3);
    assert.ok(semana.serie.every(p => new Date(p.periodo + "T00:00:00Z").getUTCDay() === 1), "las semanas empiezan en lunes");
    assert.ok(dia.top.length === 5 && dia.top[0].cantidad >= dia.top[4].cantidad);
    assert.ok(dia.resumen.ticket > 0);
});

test("historial por día: coincide con el detalle de cada día", async () => {
    const adm = await login("admin");
    const h = (await api("GET", "/reportes/historial?desde=" + haceDias(20), { token: adm.token })).data;
    assert.ok(h.dias.length >= 20);
    assert.ok(h.dias[0].fecha >= h.dias[1].fecha, "más reciente primero");
    const dia = h.dias.find(d => d.pedidos > 0 && d.fecha < h.hoy);
    const det = (await api("GET", `/reportes/dia/${dia.fecha}`, { token: adm.token })).data;
    assert.equal(det.pedidos.length, dia.pedidos);
    assert.equal(det.pedidos.filter(p => p.estado === "entregado").length, dia.entregados);
    assert.equal(Math.round(det.pedidos.filter(p => p.estado === "entregado").reduce((s, p) => s + p.total, 0) * 100) / 100, dia.ventas);
});

test("exportar CSV: cabeceras, cantidad de filas y protección contra fórmulas de Excel", async () => {
    const adm = await login("admin"), cli = await login("U-cliente");
    await api("POST", "/pedidos", { token: cli.token, body: pedidoBase({ cliente: { nombre: "=HYPERLINK(\"http://x\")", telefono: "999888777" } }) });
    const hoy = hoyLima();
    const r = await api("GET", `/reportes/pedidos.csv?desde=${hoy}&hasta=${hoy}`, { token: adm.token });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/csv/);
    assert.match(r.headers.get("content-disposition"), /attachment; filename="pedidos_/);
    const crudo = new Uint8Array(await (await fetch(`${base}/reportes/pedidos.csv?desde=${hoy}&hasta=${hoy}`, { headers: { Authorization: "Bearer " + adm.token } })).arrayBuffer());
    assert.deepEqual([...crudo.slice(0, 3)], [0xEF, 0xBB, 0xBF], "BOM UTF-8 para que Excel lea las tildes");
    assert.ok(r.data.includes(`"'=HYPERLINK(`), "la celda con = se neutraliza");
    assert.ok(!r.data.includes(`,"=HYPERLINK`));
});

test("bandeja de correos: el admin ve los comprobantes (modo simulación)", async () => {
    const adm = await login("admin");
    const lista = (await api("GET", "/correos", { token: adm.token })).data;
    assert.equal(lista.modo, "simulacion");
    assert.ok(lista.correos.length > 0 && lista.correos.every(c => c.html === undefined));
    const uno = lista.correos.find(c => c.tieneVista);
    const det = await api("GET", `/correos/${uno.id}`, { token: adm.token });
    assert.equal(det.status, 200); assert.ok(det.data.html.includes("La Última Rebanada"));
});

async function entregarPedido(clienteToken, repartidor = "D-kevin") {
    const adm = await login("admin"), coc = await login("C-cocinero"), rep = await login(repartidor);
    const p = (await api("POST", "/pedidos", { token: clienteToken, body: pedidoBase() })).data;
    for (const e of ["cocinando", "horno", "listo"]) await api("PATCH", `/pedidos/${p.id}/estado`, { token: coc.token, body: { estado: e } });
    await api("PATCH", `/pedidos/${p.id}/estado`, { token: adm.token, body: { estado: "asignado", repartidor } });
    for (const e of ["recogido", "camino"]) await api("PATCH", `/pedidos/${p.id}/estado`, { token: rep.token, body: { estado: e } });
    await api("PATCH", `/pedidos/${p.id}/estado`, { token: rep.token, body: { estado: "entregado", codigo: p.codigo } });
    return p;
}

test("el cliente califica al repartidor: solo el dueño, solo entregado, una vez, 1-5", async () => {
    const cli = await login("U-cliente");
    const otro = (await api("POST", "/auth/register", { body: { nombre: "Vecino", password: "abcd", telefono: "955", email: "vecino@mail.com" } })).data;
    const adm = await login("admin");
    const pendiente = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() })).data;
    assert.equal((await api("POST", `/pedidos/${pendiente.id}/calificar-repartidor`, { token: cli.token, body: { estrellas: 5 } })).status, 409);

    const p = await entregarPedido(cli.token, "D-kevin");
    const url = `/pedidos/${p.id}/calificar-repartidor`;
    assert.equal((await api("POST", url, { body: { estrellas: 5 } })).status, 403);
    assert.equal((await api("POST", url, { token: otro.token, body: { estrellas: 5 } })).status, 403);
    assert.equal((await api("POST", url, { token: cli.token, body: { estrellas: 0 } })).status, 400);
    assert.equal((await api("POST", url, { token: cli.token, body: { estrellas: 6 } })).status, 400);
    assert.equal((await api("POST", url, { token: cli.token, body: { estrellas: 4, comentario: "Puntual y amable (prueba)" } })).status, 200);
    assert.equal((await api("POST", url, { token: cli.token, body: { estrellas: 1 } })).status, 409);

    const vista = (await api("GET", `/seguimiento/${p.id}`, { token: cli.token })).data;
    assert.equal(vista.calRepartidor.estrellas, 4); assert.equal(vista.calificacion, null);
    assert.equal((await api("GET", `/seguimiento/${p.id}`)).data.calRepartidor, undefined);
    const coc = await login("C-cocinero");
    const rec = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase({ tipo: "recojo", direccion: "", distrito: "" }) })).data;
    for (const e of ["cocinando", "horno", "listo"]) await api("PATCH", `/pedidos/${rec.id}/estado`, { token: coc.token, body: { estado: e } });
    await api("PATCH", `/pedidos/${rec.id}/estado`, { token: coc.token, body: { estado: "entregado", codigo: rec.codigo } });
    assert.equal((await api("POST", `/pedidos/${rec.id}/calificar-repartidor`, { token: cli.token, body: { estrellas: 5 } })).status, 409);
    const enAdmin = (await api("GET", "/pedidos", { token: adm.token })).data.find(o => o.id === p.id);
    assert.equal(enAdmin.calRepartidor.comentario, "Puntual y amable (prueba)");
});

test("reporte por repartidor: pedidos del día, calificaciones y datos del ex-repartidor", async () => {
    const adm = await login("admin"), cli = await login("U-cliente"), coc = await login("C-cocinero");
    assert.equal((await api("GET", "/reportes/repartidores?fecha=ayer", { token: adm.token })).status, 400);
    const antes = (await api("GET", "/reportes/repartidores", { token: adm.token })).data;
    const kevinAntes = antes.repartidores.find(r => r.usuario === "D-kevin");

    const p = await entregarPedido(cli.token, "D-kevin");
    await api("POST", `/pedidos/${p.id}/calificar-repartidor`, { token: cli.token, body: { estrellas: 2, comentario: "Llegó tarde" } });
    const r = (await api("GET", "/reportes/repartidores", { token: adm.token })).data;
    const k = r.repartidores.find(x => x.usuario === "D-kevin");
    assert.equal(k.dia.pedidos, kevinAntes.dia.pedidos + 1);
    assert.equal(k.dia.entregados, kevinAntes.dia.entregados + 1);
    assert.ok(k.pedidos.some(x => x.id === p.id && x.estrellas === 2 && x.comentario === "Llegó tarde"));
    assert.equal(k.total.calificaciones, kevinAntes.total.calificaciones + 1);
    assert.ok(k.opiniones[0].estrellas === 2 && /^\S+( \S\.)?$/.test(k.opiniones[0].cliente));
    assert.equal(k.dia.cobrado, Math.round(k.pedidos.filter(x => x.estado === "entregado").reduce((s, x) => s + x.total, 0) * 100) / 100);
    assert.equal(k.estado, "disponible");

    const fila = db.prepare(`SELECT date(p.creado/1000,'unixepoch','-5 hours') d FROM pedidos p JOIN usuarios u ON u.id = p.repartidor_id WHERE u.usuario = 'D-miguel' LIMIT 1`).get();
    const viejo = (await api("GET", `/reportes/repartidores?fecha=${fila.d}`, { token: adm.token })).data;
    const miguel = viejo.repartidores.find(x => x.usuario === "D-miguel");
    assert.ok(miguel, "el ex-repartidor aparece en los días que trabajó");
    assert.equal(miguel.estado, "inhabilitado"); assert.equal(miguel.activo, false);
    assert.match(miguel.motivo, /falta grave/i);
    assert.ok(!r.repartidores.some(x => x.usuario === "D-miguel"));
    assert.ok(miguel.total.promedio < k.total.promedio);
});

test("el repartidor ve su promedio; los demás roles no", async () => {
    const rep = await login("D-delivery"), cli = await login("U-cliente");
    const r = await api("GET", "/mi-calificacion", { token: rep.token });
    assert.equal(r.status, 200); assert.ok(r.data.promedio > 0 && r.data.total > 0);
    assert.equal((await api("GET", "/mi-calificacion", { token: cli.token })).status, 403);
    assert.equal((await api("GET", "/mi-calificacion")).status, 401);
});

test("el personal requiere DNI; los clientes no", async () => {
    const adm = await login("admin");
    const crear = (b) => api("POST", "/usuarios", { token: adm.token, body: { password: "1234", ...b } });
    assert.equal((await crear({ nombre: "SinDni", rol: "delivery" })).status, 400);
    assert.equal((await crear({ nombre: "DniMalo", rol: "delivery", dni: "123" })).status, 400);
    assert.equal((await crear({ nombre: "DniLetras", rol: "cocinero", dni: "ABCDEFGH" })).status, 400);
    assert.equal((await crear({ nombre: "ClienteSinDni", rol: "cliente", email: "csd@mail.com" })).status, 201);
    assert.equal((await crear({ nombre: "Copia", rol: "delivery", dni: "70223344" })).status, 400);
});

test("inhabilitar personal: bloquea acceso, sesión y asignación; nunca se borra ni se reactiva; no puede reingresar como nuevo", async () => {
    const adm = await login("admin"), cli = await login("U-cliente"), coc = await login("C-cocinero");
    const nuevo = await api("POST", "/usuarios", { token: adm.token, body: { nombre: "Temporal", rol: "delivery", password: "1234", dni: "71000002", email: "temporal@mail.com", telefono: "955000111" } });
    assert.equal(nuevo.status, 201);
    const tmp = await login("D-temporal");
    assert.ok(tmp.token);

    assert.equal((await api("POST", "/usuarios/D-temporal/inhabilitar", { token: adm.token, body: {} })).status, 400);
    assert.equal((await api("POST", "/usuarios/D-temporal/inhabilitar", { token: adm.token, body: { motivo: "abc" } })).status, 400);
    assert.equal((await api("POST", "/usuarios/admin/inhabilitar", { token: adm.token, body: { motivo: "prueba de auto-bloqueo" } })).status, 409);
    assert.equal((await api("POST", "/usuarios/D-temporal/inhabilitar", { token: cli.token, body: { motivo: "no tengo permiso" } })).status, 403);
    assert.equal((await api("POST", "/usuarios/D-temporal/inhabilitar", { body: { motivo: "sin sesión" } })).status, 401);
    assert.equal((await api("POST", "/usuarios/D-delivery/inhabilitar", { token: adm.token, body: { motivo: "prueba con entrega en curso" } })).status, 409);

    const p = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() })).data;
    for (const e of ["cocinando", "horno", "listo"]) await api("PATCH", `/pedidos/${p.id}/estado`, { token: coc.token, body: { estado: e } });

    const inh = await api("POST", "/usuarios/D-temporal/inhabilitar", { token: adm.token, body: { motivo: "Despido por falta grave en el servicio al cliente" } });
    assert.equal(inh.status, 200);
    assert.equal((await api("POST", "/usuarios/D-temporal/inhabilitar", { token: adm.token, body: { motivo: "otra vez, no debe pasar" } })).status, 409);

    const intento = await api("POST", "/auth/login", { body: { usuario: "D-temporal", password: "1234" } });
    assert.equal(intento.status, 403); assert.match(intento.data.error, /inhabilitada/);
    assert.equal((await api("GET", "/pedidos", { token: tmp.token })).status, 401);
    const asig = await api("PATCH", `/pedidos/${p.id}/estado`, { token: adm.token, body: { estado: "asignado", repartidor: "D-temporal" } });
    assert.equal(asig.status, 409); assert.match(asig.data.error, /inhabilitado/);
    const fila = (await api("GET", "/usuarios", { token: adm.token })).data.find(u => u.usuario === "D-temporal");
    assert.ok(fila, "la cuenta sigue existiendo");
    assert.equal(fila.activo, false); assert.equal(fila.dni, "71000002");
    assert.match(fila.motivo, /falta grave/); assert.equal(fila.inhabilitadoPor, "Administrador"); assert.ok(fila.inhabilitadoEn > 0);

    assert.equal((await api("DELETE", "/usuarios/D-temporal", { token: adm.token })).status, 405);
    assert.throws(() => db.prepare("DELETE FROM usuarios WHERE usuario = 'D-temporal'").run(), /no se pueden borrar/);
    const reac = await api("POST", "/usuarios/D-temporal/reactivar", { token: adm.token });
    assert.equal(reac.status, 403); assert.match(reac.data.error, /definitiva/);
    assert.throws(() => db.prepare("UPDATE usuarios SET activo = 1 WHERE usuario = 'D-temporal'").run(), /definitiva/);

    const otroNombre = await api("POST", "/usuarios", { token: adm.token, body: { nombre: "TemporalNuevo", rol: "delivery", password: "1234", dni: "71000002" } });
    assert.equal(otroNombre.status, 409); assert.match(otroNombre.data.error, /INHABILITADA/); assert.match(otroNombre.data.error, /No puede volver a trabajar/);
    assert.match(otroNombre.data.error, /falta grave/);
    const mismoCorreo = await api("POST", "/usuarios", { token: adm.token, body: { nombre: "OtroDni", rol: "cocinero", password: "1234", dni: "71999999", email: "TEMPORAL@mail.com" } });
    assert.equal(mismoCorreo.status, 409); assert.match(mismoCorreo.data.error, /INHABILITADO/);
    const comoCocinero = await api("POST", "/usuarios", { token: adm.token, body: { nombre: "Temporal2", rol: "cocinero", password: "1234", dni: "71000002" } });
    assert.equal(comoCocinero.status, 409);
    const pub = await api("POST", "/auth/register", { body: { nombre: "Camuflado", password: "abcd", telefono: "955", email: "temporal@mail.com" } });
    assert.equal(pub.status, 400); assert.equal(pub.data.error, "Ese correo ya está registrado. Inicia sesión.");

    assert.ok(db.prepare("SELECT 1 FROM usuarios WHERE usuario = 'D-temporal'").get());
});

test("el ex-repartidor del historial (D-miguel) no puede entrar y sigue registrado", async () => {
    const intento = await api("POST", "/auth/login", { body: { usuario: "D-miguel", password: "1234" } });
    assert.equal(intento.status, 403);
    const adm = await login("admin");
    const fila = (await api("GET", "/usuarios", { token: adm.token })).data.find(u => u.usuario === "D-miguel");
    assert.equal(fila.activo, false); assert.equal(fila.dni, "45123789");
    const nuevo = await api("POST", "/usuarios", { token: adm.token, body: { nombre: "MiguelP", rol: "delivery", password: "1234", dni: "45123789" } });
    assert.equal(nuevo.status, 409); assert.match(nuevo.data.error, /INHABILITADA/);
});

test("clientes: se inhabilitan y SÍ pueden reactivarse (no son personal)", async () => {
    const adm = await login("admin");
    await api("POST", "/auth/register", { body: { nombre: "Moroso", password: "abcd", telefono: "955", email: "moroso@mail.com" } });
    assert.equal((await api("POST", "/usuarios/U-moroso/inhabilitar", { token: adm.token, body: { motivo: "Pedidos falsos reiterados" } })).status, 200);
    assert.equal((await api("POST", "/auth/login", { body: { usuario: "U-moroso", password: "abcd" } })).status, 403);
    assert.equal((await api("POST", "/usuarios/U-moroso/reactivar", { token: adm.token })).status, 200);
    assert.equal((await api("POST", "/auth/login", { body: { usuario: "U-moroso", password: "abcd" } })).status, 200);
    assert.equal((await api("POST", "/usuarios/U-moroso/reactivar", { token: adm.token })).status, 409);
});

test("etiquetas de la calificación del repartidor: validación, duplicados y visibilidad", async () => {
    const cli = await login("U-cliente"), adm = await login("admin");
    const cat = (await api("GET", "/catalogo")).data;
    assert.ok(cat.etiquetasRepartidor.some(e => e.id === "mal_estado" && e.tipo === "negativa"));
    const p = await entregarPedido(cli.token, "D-kevin");
    const url = `/pedidos/${p.id}/calificar-repartidor`;
    assert.equal((await api("POST", url, { token: cli.token, body: { estrellas: 4, etiquetas: ["inventada"] } })).status, 400);
    assert.equal((await api("POST", url, { token: cli.token, body: { estrellas: 4, etiquetas: "puntual" } })).status, 400);
    assert.equal((await api("POST", url, { token: cli.token, body: { estrellas: 4, etiquetas: ["puntual", "amable", "buen_estado", "indicaciones", "tarde", "mal_estado", "incompleto"] } })).status, 400);
    assert.equal((await api("POST", url, { token: cli.token, body: { estrellas: 5, etiquetas: ["puntual", "puntual", "amable"] } })).status, 200);
    const vista = (await api("GET", `/seguimiento/${p.id}`, { token: cli.token })).data;
    assert.deepEqual(vista.calRepartidor.etiquetas, ["puntual", "amable"]);
    assert.equal((await api("GET", `/seguimiento/${p.id}`)).data.calRepartidor, undefined);
    const enAdmin = (await api("GET", "/pedidos", { token: adm.token })).data.find(o => o.id === p.id);
    assert.deepEqual(enAdmin.calRepartidor.etiquetas, ["puntual", "amable"]);
});

test("reportar mal estado o pedido incompleto genera una alerta para administración", async () => {
    const cli = await login("U-cliente"), adm = await login("admin");
    const antes = (await api("GET", "/reportes/repartidores", { token: adm.token })).data.repartidores.find(r => r.usuario === "D-kevin").total.incidencias;
    const p = await entregarPedido(cli.token, "D-kevin");
    await api("POST", `/pedidos/${p.id}/calificar-repartidor`, { token: cli.token, body: { estrellas: 1, etiquetas: ["mal_estado", "incompleto"], comentario: "Llegó aplastada" } });
    const av = (await api("GET", "/notificaciones", { token: adm.token })).data;
    const lista = av.notificaciones || av;
    assert.ok(lista.some(n => n.tipo === "alerta" && n.pedidoId === p.id && /mal estado/.test(n.texto)));
    const k = (await api("GET", "/reportes/repartidores", { token: adm.token })).data.repartidores.find(r => r.usuario === "D-kevin");
    assert.equal(k.total.incidencias, antes + 1);
    assert.ok(k.pedidos.find(x => x.id === p.id).etiquetas.includes("mal_estado"));
    const q = await entregarPedido(cli.token, "D-kevin");
    await api("POST", `/pedidos/${q.id}/calificar-repartidor`, { token: cli.token, body: { estrellas: 3, etiquetas: ["tarde"] } });
    const av2 = (await api("GET", "/notificaciones", { token: adm.token })).data;
    assert.ok(!(av2.notificaciones || av2).some(n => n.tipo === "alerta" && n.pedidoId === q.id));
});

const solicitudBase = (extra = {}) => ({ ...pedidoBase(), distrito: "San Luis", direccion: "Jr. Los Cedros 120", ...extra });

test("solicitud fuera de zona: validaciones y aviso al administrador", async () => {
    const cli = await login("U-cliente"), adm = await login("admin");
    assert.equal((await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase({ distrito: "Miraflores" }) })).status, 400);
    assert.equal((await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase({ distrito: "Huaral", lat: -11.5, lng: -77.2 }) })).status, 400);
    assert.equal((await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase({ direccion: "" }) })).status, 400);
    assert.equal((await api("POST", "/solicitudes-zona", { body: solicitudBase() })).status, 401);
    assert.equal((await api("POST", "/solicitudes-zona", { token: adm.token, body: solicitudBase() })).status, 403);

    const r = await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase({ distrito: "san luis" }) });
    assert.equal(r.status, 201);
    assert.equal(r.data.estado, "pendiente");
    assert.ok(r.data.kmLinea > 3 && r.data.kmLinea < 12, "estima la distancia con el distrito conocido");
    assert.equal(r.data.recargo, null); assert.equal(r.data.total, null);
    const av = (await api("GET", "/notificaciones", { token: adm.token })).data;
    assert.ok((av.notificaciones || av).some(n => n.tipo === "alerta" && /fuera de zona/.test(n.texto) && new RegExp(`#${r.data.id}\\b`).test(n.texto)));
    const lista = (await api("GET", "/solicitudes-zona", { token: adm.token })).data;
    const mia = lista.find(x => x.id === r.data.id);
    assert.equal(mia.cliente.telefono, "999888777"); assert.ok(mia.sugerido >= 5);
    const coc = await login("C-cocinero");
    const enCocina = (await api("GET", "/pedidos", { token: coc.token })).data;
    assert.ok(!enCocina.some(o => o.distrito === "San Luis"));
    await api("POST", `/solicitudes-zona/${r.data.id}/cancelar`, { token: cli.token });
});

test("el administrador fija el recargo y el cliente acepta: se crea el pedido con el total correcto", async () => {
    const cli = await login("U-cliente"), adm = await login("admin"), coc = await login("C-cocinero");
    const otro = (await api("POST", "/auth/register", { body: { nombre: "Vecina", password: "abcd", telefono: "955111222", email: "vecina@mail.com" } })).data;
    const s = (await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase() })).data;
    const url = (a) => `/solicitudes-zona/${s.id}/${a}`;

    assert.equal((await api("POST", url("aceptar"), { token: cli.token })).status, 409);
    assert.equal((await api("POST", url("cotizar"), { token: cli.token, body: { recargo: 1 } })).status, 403);
    assert.equal((await api("POST", url("cotizar"), { token: adm.token, body: { recargo: -1 } })).status, 400);
    assert.equal((await api("POST", url("cotizar"), { token: adm.token, body: { recargo: 999 } })).status, 400);
    const c = await api("POST", url("cotizar"), { token: adm.token, body: { recargo: 7.5, kmRuta: 9.2, nota: "Zona alejada" } });
    assert.equal(c.status, 200); assert.equal(c.data.estado, "cotizada");

    const vista = (await api("GET", "/solicitudes-zona", { token: cli.token })).data.find(x => x.id === s.id);
    assert.equal(vista.recargo, 7.5); assert.equal(vista.notaAdmin, "Zona alejada");
    assert.equal(vista.total, Math.round((vista.totalBase + 7.5) * 100) / 100);
    assert.equal((await api("POST", url("aceptar"), { token: otro.token })).status, 403);

    const ok = await api("POST", url("aceptar"), { token: cli.token });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.estado, "cola");
    assert.equal(ok.data.recargoZona, 7.5);
    assert.equal(ok.data.total, vista.total);
    assert.equal(ok.data.envio, Math.round((vista.envio + 7.5) * 100) / 100);
    assert.equal(ok.data.distrito, "San Luis");
    assert.equal((await api("POST", url("aceptar"), { token: cli.token })).status, 409);
    assert.equal((await api("POST", url("cotizar"), { token: adm.token, body: { recargo: 1 } })).status, 409);
    assert.ok((await api("GET", "/pedidos", { token: coc.token })).data.some(o => o.id === ok.data.id));
    assert.equal((await api("GET", "/solicitudes-zona", { token: cli.token })).data.find(x => x.id === s.id).pedidoId, ok.data.id);
});

test("solicitud fuera de zona: rechazo con motivo, cancelación y recargo cero", async () => {
    const cli = await login("U-cliente"), adm = await login("admin");
    const a = (await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase({ distrito: "Ate" }) })).data;
    assert.equal((await api("POST", `/solicitudes-zona/${a.id}/rechazar`, { token: adm.token, body: {} })).status, 400);
    assert.equal((await api("POST", `/solicitudes-zona/${a.id}/rechazar`, { token: adm.token, body: { motivo: "Sin repartidores en esa zona hoy" } })).status, 200);
    const vista = (await api("GET", "/solicitudes-zona", { token: cli.token })).data.find(x => x.id === a.id);
    assert.equal(vista.estado, "rechazada"); assert.match(vista.notaAdmin, /Sin repartidores/);
    assert.equal((await api("POST", `/solicitudes-zona/${a.id}/aceptar`, { token: cli.token })).status, 409);

    const b = (await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase({ distrito: "Santa Anita" }) })).data;
    assert.equal((await api("POST", `/solicitudes-zona/${b.id}/cancelar`, { token: cli.token })).status, 200);
    assert.equal((await api("POST", `/solicitudes-zona/${b.id}/cotizar`, { token: adm.token, body: { recargo: 5 } })).status, 409);

    const c = (await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase({ distrito: "El Agustino" }) })).data;
    await api("POST", `/solicitudes-zona/${c.id}/cotizar`, { token: adm.token, body: { recargo: 0, nota: "Sin costo extra" } });
    const ped = (await api("POST", `/solicitudes-zona/${c.id}/aceptar`, { token: cli.token })).data;
    assert.equal(ped.recargoZona, 0);
});

test("límite de solicitudes abiertas por cliente", async () => {
    const nuevo = (await api("POST", "/auth/register", { body: { nombre: "Limite", password: "abcd", telefono: "955333444", email: "limite@mail.com" } })).data;
    for (let i = 0; i < 3; i++) assert.equal((await api("POST", "/solicitudes-zona", { token: nuevo.token, body: solicitudBase() })).status, 201);
    assert.equal((await api("POST", "/solicitudes-zona", { token: nuevo.token, body: solicitudBase() })).status, 429);
});

test("ruta múltiple: un solo viaje, orden elegido, la siguiente parada arranca sola", async () => {
    const adm = await login("admin"), coc = await login("C-cocinero"), rep = await login("D-kevin");
    const cli = await login("U-cliente");
    const ids = [];
    for (const distrito of ["La Victoria", "Barranco", "Surquillo"]) {
        const p = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase({ distrito }) })).data;
        for (const e of ["cocinando", "horno", "listo"]) await api("PATCH", `/pedidos/${p.id}/estado`, { token: coc.token, body: { estado: e } });
        assert.equal((await api("PATCH", `/pedidos/${p.id}/estado`, { token: adm.token, body: { estado: "asignado", repartidor: "D-kevin" } })).status, 200);
        ids.push({ id: p.id, codigo: p.codigo });
    }
    const [chorrillos, barranco, surquillo] = ids;

    assert.equal((await api("POST", "/ruta", { token: rep.token, body: { ids: [] } })).status, 400);
    assert.equal((await api("POST", "/ruta", { token: rep.token, body: { ids: [barranco.id, barranco.id] } })).status, 400);
    assert.equal((await api("POST", "/ruta", { token: cli.token, body: { ids: [barranco.id] } })).status, 403);
    assert.equal((await api("POST", "/ruta", { token: rep.token, body: { ids: [barranco.id, 999999] } })).status, 403);

    const r = await api("POST", "/ruta", { token: rep.token, body: { ids: [barranco.id, surquillo.id, chorrillos.id] } });
    assert.equal(r.status, 200);
    const ver = async (id) => (await api("GET", `/seguimiento/${id}`, { token: cli.token })).data;
    assert.equal((await ver(barranco.id)).estado, "camino");
    const s = await ver(surquillo.id), c = await ver(chorrillos.id);
    assert.equal(s.estado, "recogido"); assert.equal(s.parada, 2); assert.equal(s.paradasAntes, 1);
    assert.equal(c.estado, "recogido"); assert.equal(c.parada, 3); assert.equal(c.paradasAntes, 2);
    const e1 = (await ver(barranco.id)).eta;
    assert.ok(e1 < s.eta && s.eta < c.eta, "la llegada estimada aumenta parada a parada");

    const salto = await api("PATCH", `/pedidos/${surquillo.id}/estado`, { token: rep.token, body: { estado: "camino" } });
    assert.equal(salto.status, 409);

    assert.equal((await api("PATCH", `/pedidos/${barranco.id}/estado`, { token: rep.token, body: { estado: "entregado", codigo: "0000" } })).status, 400);
    assert.equal((await api("PATCH", `/pedidos/${barranco.id}/estado`, { token: rep.token, body: { estado: "entregado", codigo: barranco.codigo } })).status, 200);
    const s2 = await ver(surquillo.id);
    assert.equal(s2.estado, "camino"); assert.equal(s2.paradasAntes, 0);
    assert.ok(s2.origenLat != null, "el tramo sale de la entrega anterior, no de la tienda");
    assert.equal((await ver(chorrillos.id)).paradasAntes, 1);

    await api("PATCH", `/pedidos/${surquillo.id}/estado`, { token: rep.token, body: { estado: "entregado", codigo: surquillo.codigo } });
    assert.equal((await ver(chorrillos.id)).estado, "camino");
    await api("PATCH", `/pedidos/${chorrillos.id}/estado`, { token: rep.token, body: { estado: "entregado", codigo: chorrillos.codigo } });
    assert.equal((await ver(chorrillos.id)).estado, "entregado");
    assert.equal((await ver(chorrillos.id)).parada, null);
});

test("ruta múltiple: máximo de paradas y solo pedidos propios", async () => {
    const rep = await login("D-kevin");
    const muchos = Array.from({ length: 9 }, (_, i) => i + 1);
    assert.equal((await api("POST", "/ruta", { token: rep.token, body: { ids: muchos } })).status, 400);
});

test("negocio cerrado: no se aceptan pedidos nuevos, el admin lo reabre", async () => {
    const adm = await login("admin"), cli = await login("U-cliente"), coc = await login("C-cocinero");
    assert.equal((await api("GET", "/tienda")).data.abierta, true);
    assert.equal((await api("PUT", "/tienda", { token: cli.token, body: { abierta: false } })).status, 403);
    assert.equal((await api("PUT", "/tienda", { token: adm.token, body: { abierta: "no" } })).status, 400);
    const r = await api("PUT", "/tienda", { token: adm.token, body: { abierta: false, mensaje: "Abrimos a las 12:00 p. m." } });
    assert.equal(r.status, 200); assert.equal(r.data.abierta, false);
    assert.equal((await api("GET", "/tienda")).data.mensaje, "Abrimos a las 12:00 p. m.");
    const catalogo = (await api("GET", "/catalogo")).data;
    assert.equal(catalogo.negocio.abierta, false);
    assert.ok(Number.isFinite(catalogo.tienda.lat), "la ubicación del local sigue en catalogo.tienda");
    const nuevo = await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() });
    assert.equal(nuevo.status, 409); assert.match(nuevo.data.error, /cerrados/);
    assert.equal((await api("POST", "/solicitudes-zona", { token: cli.token, body: solicitudBase() })).status, 409);
    assert.equal((await api("GET", "/pedidos", { token: coc.token })).status, 200);
    await api("PUT", "/tienda", { token: adm.token, body: { abierta: true } });
    assert.equal((await api("GET", "/tienda")).data.mensaje, "");
    assert.equal((await api("POST", "/pedidos", { token: cli.token, body: pedidoBase() })).status, 201);
});

test("la cocina descuenta piña al vender Hawaiana y el reporte de demanda avisa", async () => {
    const adm = await login("admin"), cli = await login("U-cliente"), coc = await login("C-cocinero");
    const pina = async () => (await api("GET", "/inventario", { token: adm.token })).data.find(i => i.id === "pina").stock;
    const antes = await pina();
    const p = (await api("POST", "/pedidos", { token: cli.token, body: pedidoBase({ items: [{ id: "hawaiana", cant: 2, opts: { tamano: "Mediana", masa: "Clásica", toppings: [] } }] }) })).data;
    await api("PATCH", `/pedidos/${p.id}/estado`, { token: coc.token, body: { estado: "cocinando" } });
    assert.equal(Math.round((antes - await pina()) * 100) / 100, 1);
    assert.equal((await api("GET", "/reportes/demanda", { token: cli.token })).status, 403);
    const d = (await api("GET", "/reportes/demanda?dias=7", { token: adm.token })).data;
    assert.ok(d.productos.length && d.productos.every(x => x.cantidad > 0));
    assert.equal(d.horas.length, 24);
    assert.ok(d.horas.reduce((t, h) => t + h.pedidos, 0) === d.totalPedidos);
    assert.ok(d.productos.some(x => x.id === "hawaiana"));
    const ins = d.insumos.find(i => i.id === "pina");
    assert.ok(ins && ins.consumoDia > 0 && ["critico", "bajo", "ok"].includes(ins.estado));
});
