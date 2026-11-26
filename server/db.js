const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const cat = require("./catalogo");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "rebanada.db");
if (DB_FILE !== ":memory:") fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function migrar() {
    const existe = (t) => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    const columnas = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    if (existe("usuarios") && !columnas("usuarios").includes("email")) {
        db.exec("ALTER TABLE usuarios ADD COLUMN email TEXT COLLATE NOCASE");
        db.prepare("UPDATE usuarios SET email = ? WHERE usuario = ? AND email IS NULL").run("cliente@demo.pe", "U-cliente");
    }
    if (existe("usuarios")) {
        const cu = columnas("usuarios");
        if (!cu.includes("dni")) db.exec("ALTER TABLE usuarios ADD COLUMN dni TEXT");
        if (!cu.includes("activo")) db.exec("ALTER TABLE usuarios ADD COLUMN activo INTEGER NOT NULL DEFAULT 1");
        if (!cu.includes("inhabilitado_en")) db.exec("ALTER TABLE usuarios ADD COLUMN inhabilitado_en INTEGER");
        if (!cu.includes("inhabilitado_motivo")) db.exec("ALTER TABLE usuarios ADD COLUMN inhabilitado_motivo TEXT");
        if (!cu.includes("inhabilitado_por")) db.exec("ALTER TABLE usuarios ADD COLUMN inhabilitado_por INTEGER REFERENCES usuarios(id)");
        const dniDemo = { "C-cocinero": "70112233", "D-delivery": "70223344", "D-kevin": "70334455", "D-rosa": "70445566", "admin": "70556677" };
        for (const [u, n] of Object.entries(dniDemo)) db.prepare("UPDATE usuarios SET dni = ? WHERE usuario = ? AND dni IS NULL").run(n, u);
    }
    if (existe("pedidos")) {
        const cols = columnas("pedidos");
        if (!cols.includes("rep_estrellas")) db.exec("ALTER TABLE pedidos ADD COLUMN rep_estrellas INTEGER");
        if (!cols.includes("rep_comentario")) db.exec("ALTER TABLE pedidos ADD COLUMN rep_comentario TEXT");
        if (!cols.includes("recargo_zona")) db.exec("ALTER TABLE pedidos ADD COLUMN recargo_zona REAL NOT NULL DEFAULT 0");
        if (!cols.includes("ruta_orden")) db.exec("ALTER TABLE pedidos ADD COLUMN ruta_orden INTEGER");
        if (!cols.includes("origen_lat")) db.exec("ALTER TABLE pedidos ADD COLUMN origen_lat REAL");
        if (!cols.includes("origen_lng")) db.exec("ALTER TABLE pedidos ADD COLUMN origen_lng REAL");
        if (!cols.includes("rep_etiquetas")) db.exec("ALTER TABLE pedidos ADD COLUMN rep_etiquetas TEXT");
        if (!cols.includes("cal_oculta")) db.exec("ALTER TABLE pedidos ADD COLUMN cal_oculta INTEGER NOT NULL DEFAULT 0");
        if (cols.includes("secreto")) db.exec("ALTER TABLE pedidos DROP COLUMN secreto");
    }
}
migrar();
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

// Cuentas de prueba que aparecen en la pantalla de acceso: [usuario, rol, nombre, teléfono, correo, dni]
const CUENTAS_DEMO = [
    ["C-cocinero", "cocinero", "Marco Vega", "", "cocina@demo.pe", "70112233"],
    ["D-delivery", "delivery", "Luis Fernández", "987 111 222", "luis@demo.pe", "70223344"],
    ["D-kevin", "delivery", "Kevin Salazar", "987 333 444", "kevin@demo.pe", "70334455"],
    ["D-rosa", "delivery", "Rosa Injante", "987 555 666", "rosa@demo.pe", "70445566"],
    ["U-cliente", "cliente", "Cliente Demo", "999 888 777", "cliente@demo.pe", null],
    ["admin", "admin", "Administrador", "", "admin@demo.pe", "70556677"]
];

function sembrar() {
    if (db.prepare("SELECT COUNT(*) n FROM usuarios").get().n > 0) return;

    const ahora = Date.now(), MIN = 60000;
    const hash = bcrypt.hashSync(process.env.CLAVE_DEMO || "1234", 10);

    const insU = db.prepare("INSERT INTO usuarios (usuario,password_hash,rol,nombre,telefono,email,dni,creado) VALUES (?,?,?,?,?,?,?,?)");
    CUENTAS_DEMO.forEach(([u, r, n, t, e, dni]) => insU.run(u, hash, r, n, t, e, dni, ahora));

    const idDe = (u) => db.prepare("SELECT id FROM usuarios WHERE usuario = ?").get(u).id;

    const insInv = db.prepare("INSERT INTO inventario VALUES (?,?,?,?,?)");
    [["masa", "Masa de pizza", 18, 10, "uds."], ["queso", "Queso mozzarella", 4, 8, "kg"],
     ["pepperoni", "Pepperoni", 12, 6, "kg"], ["pina", "Piña en almíbar", 2, 5, "latas"],
     ["salsa", "Salsa de tomate", 20, 10, "L"]].forEach(r => insInv.run(...r));

    const ORDEN = ["cola", "cocinando", "horno", "listo", "asignado", "recogido", "camino", "entregado"];
    const insP = db.prepare(`INSERT INTO pedidos (id,cliente_id,cliente_nombre,cliente_telefono,tipo,direccion,distrito,referencia,lat,lng,
        subtotal,envio,descuento,cupon,total,pago,notas,estado,repartidor_id,progreso,rep_lat,rep_lng,codigo,creado,eta,cal_estrellas,cal_comentario)
        VALUES (@id,@cliente_id,@cliente_nombre,@cliente_telefono,'delivery',@direccion,@distrito,@referencia,@lat,@lng,
        @subtotal,@envio,0,NULL,@total,@pago,@notas,@estado,@repartidor_id,@progreso,@rep_lat,@rep_lng,@codigo,@creado,@eta,@cal_e,@cal_c)`);
    const insD = db.prepare("INSERT INTO detalle_pedido (pedido_id,producto_id,categoria,nombre,detalle,precio,cantidad) VALUES (?,?,?,?,?,?,?)");
    const insH = db.prepare("INSERT INTO historial_estados (pedido_id,estado,ts) VALUES (?,?,?)");

    const crear = (id, minAtras, estado, o) => {
        const items = o.items.map(([pid, cant, detalle = ""]) => {
            const p = cat.MENU.find(m => m.id === pid);
            return { id: pid, cat: p.cat, nombre: p.nombre, detalle, precio: p.precio, cant };
        });
        const subtotal = cat.redondear(items.reduce((s, i) => s + i.precio * i.cant, 0));
        const creado = ahora - minAtras * MIN;
        const d = cat.DISTRITOS.find(x => x.nombre === o.distrito);
        insP.run({
            id, cliente_id: o.user ? idDe(o.user) : null, cliente_nombre: o.nombre, cliente_telefono: o.tel,
            direccion: o.dir, distrito: o.distrito, referencia: o.ref || "",
            lat: d.lat + (id % 7) * 0.0006, lng: d.lng - (id % 5) * 0.0006,
            subtotal, envio: cat.ENVIO.costo, total: cat.redondear(subtotal + cat.ENVIO.costo),
            pago: o.pago || "efectivo", notas: o.notas || "", estado,
            repartidor_id: o.rep ? idDe(o.rep) : null, progreso: o.prog || 0,
            rep_lat: o.repPos ? o.repPos[0] : null, rep_lng: o.repPos ? o.repPos[1] : null,
            codigo: o.codigo, creado, eta: creado + cat.ENVIO.minutosDelivery * MIN,
            cal_e: o.cal ? o.cal[0] : null, cal_c: o.cal ? o.cal[1] : null
        });
        items.forEach(i => insD.run(id, i.id, i.cat, i.nombre, i.detalle, i.precio, i.cant));
        ORDEN.slice(0, ORDEN.indexOf(estado) + 1).forEach((e, k) => insH.run(id, e, creado + k * 4 * MIN));
    };

    db.transaction(() => {
        crear(1045, 95, "entregado", { nombre: "Carla Mendoza", tel: "955 100 200", dir: "Av. Arequipa 1520", distrito: "Lince", codigo: "0000", rep: "D-delivery", prog: 1, cal: [5, "Llegó calientita, ¡excelente!"], items: [["pepperoni", 1, "Mediana, Clásica"], ["inca15", 1]] });
        crear(1046, 40, "recogido", { user: "U-cliente", nombre: "Jorge Salas", tel: "944 210 330", dir: "Calle Los Pinos 245", distrito: "Miraflores", ref: "Frente al parque", codigo: "9034", rep: "D-delivery", pago: "yape", items: [["combo-lur", 1]] });
        crear(1047, 28, "camino", { user: "U-cliente", nombre: "Ana Torres", tel: "933 400 500", dir: "Jr. Cusco 780", distrito: "Pueblo Libre", ref: "Casa blanca, portón negro", codigo: "4821", rep: "D-delivery", prog: 0.35, pago: "tarjeta", repPos: [-12.1010, -77.0450], items: [["hawaiana", 1, "Familiar, Borde de queso"], ["panajo", 1]] });
        crear(1048, 3, "cola", { user: "U-cliente", nombre: "Diego Rivas", tel: "922 600 700", dir: "Av. Brasil 2100", distrito: "Jesús María", ref: "Edificio azul, 4to piso", codigo: "7215", notas: "Sin cebolla, por favor.", items: [["carnes", 1, "Mediana, Clásica, Queso extra"], ["lasagna", 1], ["coca15", 1]] });
    })();
}
sembrar();

// Repone las cuentas de prueba en cada arranque: crea las que falten y, si alguna fue
// inhabilitada o cambió de contraseña, la reactiva con la clave de demo. CUENTAS_DEMO=0 lo desactiva.
function restaurarCuentasDemo() {
    if (process.env.CUENTAS_DEMO === "0") return;
    const clave = process.env.CLAVE_DEMO || "1234";
    let hash = null;
    const getHash = () => hash || (hash = bcrypt.hashSync(clave, 10));
    const buscar = db.prepare("SELECT * FROM usuarios WHERE usuario = ?");
    const libre = (campo, valor) => valor && !db.prepare(`SELECT 1 FROM usuarios WHERE ${campo} = ?`).get(valor) ? valor : null;
    const ins = db.prepare("INSERT INTO usuarios (usuario,password_hash,rol,nombre,telefono,email,dni,creado) VALUES (?,?,?,?,?,?,?,?)");
    const upd = db.prepare(`UPDATE usuarios SET password_hash = ?, rol = ?, activo = 1,
        inhabilitado_en = NULL, inhabilitado_motivo = NULL, inhabilitado_por = NULL WHERE id = ?`);
    const pendientes = CUENTAS_DEMO.filter(([u, r]) => {
        const x = buscar.get(u);
        return !x || !x.activo || x.rol !== r || !bcrypt.compareSync(clave, x.password_hash);
    });
    if (!pendientes.length) return;
    db.transaction(() => {
        // El trigger impide reactivar personal; se quita solo mientras se reponen las cuentas de prueba.
        db.exec("DROP TRIGGER IF EXISTS trg_personal_no_reactivar");
        for (const [u, r, n, t, e, dni] of pendientes) {
            const x = buscar.get(u);
            if (x) upd.run(getHash(), r, x.id);
            else ins.run(u, getHash(), r, n, t, libre("email", e), libre("dni", dni), Date.now());
        }
        db.exec(`CREATE TRIGGER IF NOT EXISTS trg_personal_no_reactivar
            BEFORE UPDATE OF activo ON usuarios
            WHEN OLD.activo = 0 AND NEW.activo = 1 AND OLD.rol <> 'cliente'
            BEGIN
                SELECT RAISE(ABORT, 'El personal inhabilitado no puede volver a trabajar: la inhabilitación es definitiva.');
            END;`);
    })();
    console.log(`Cuentas de prueba restauradas: ${pendientes.map(c => c[0]).join(", ")}`);
}
restaurarCuentasDemo();

function sembrarHistorial() {
    if (process.env.SEED_HISTORIAL === "0") return;
    if (db.prepare("SELECT 1 FROM meta WHERE clave = 'historial_demo'").get()) return;

    let semilla = 20260101;
    const rnd = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
    const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];

    const NOMBRES = ["Carla Mendoza", "Jorge Salas", "Ana Torres", "Diego Rivas", "Lucía Paredes", "Marco Ruiz", "Valeria Soto",
        "Andrés Castillo", "Fiorella Vega", "Luis Benites", "Camila Rojas", "Renzo Díaz", "Paola Quispe", "Sergio Medina", "Daniela Cruz"];
    const COMENT = {
        5: ["Llegó calientita y a tiempo, excelente.", "La pizza estaba deliciosa, la masa perfecta.", "Muy buena atención del repartidor.",
            "Los rollos de canela son lo mejor, ¡repetiré!", "Rápido y todo llegó completo.", "Increíble sabor, la mejor pizza de la zona."],
        4: ["Buen sabor, volveré a pedir.", "Todo bien, solo faltó un poquito más de queso.", "Muy rica, el delivery llegó puntual."],
        3: ["Estuvo rica pero demoró un poco más de lo indicado.", "Buena pizza, aunque llegó algo tibia."],
        2: ["Se demoró bastante en llegar."]
    };
    const TAM = ["Personal", "Mediana", "Familiar"], MAS = ["Clásica", "Delgada", "Borde de queso"];
    const TOP = cat.TOPPINGS.map(t => t.id);
    const reps = db.prepare("SELECT id FROM usuarios WHERE rol = 'delivery'").all().map(r => r.id);
    const pizzas = cat.MENU.filter(m => m.cat === "pizzas"), otros = cat.MENU.filter(m => m.cat !== "pizzas");

    const insP = db.prepare(`INSERT INTO pedidos (id,cliente_id,cliente_nombre,cliente_telefono,tipo,direccion,distrito,referencia,lat,lng,
        subtotal,envio,descuento,cupon,total,pago,notas,estado,repartidor_id,progreso,codigo,creado,eta,cal_estrellas,cal_comentario)
        VALUES (?,NULL,?,?,?,?,?,'',?,?,?,?,?,?,?,?,'',?,?,?,?,?,?,?,?)`);
    const insD = db.prepare("INSERT INTO detalle_pedido (pedido_id,producto_id,categoria,nombre,detalle,precio,cantidad) VALUES (?,?,?,?,?,?,?)");
    const insH = db.prepare("INSERT INTO historial_estados (pedido_id,estado,ts) VALUES (?,?,?)");
    const FLUJO_D = ["cola", "cocinando", "horno", "listo", "asignado", "recogido", "camino", "entregado"];
    const FLUJO_R = ["cola", "cocinando", "horno", "listo", "entregado"];

    const hoy = cat.fechaLocal(Date.now());
    const DIAS = 90;
    let id = 0;

    db.transaction(() => {
        for (let k = DIAS; k >= 1; k--) {
            const base = cat.inicioDiaLocal(hoy) - k * 86400000;
            const dow = new Date(base + cat.TZ_HORAS * 3600000 * -1 + 12 * 3600000).getUTCDay();
            const factor = [1.7, 0.8, 0.8, 0.9, 1.0, 1.5, 1.9][dow] * (0.75 + 0.45 * (DIAS - k) / DIAS);
            const n = Math.max(2, Math.round(5 * factor + rnd() * 3));
            for (let j = 0; j < n && id < 1040; j++) {
                id++;
                const items = [];
                const lineas = 1 + Math.floor(rnd() * 3);
                for (let q = 0; q < lineas; q++) {
                    const p = rnd() < 0.6 ? elegir(pizzas) : elegir(otros);
                    const entrada = { id: p.id, cant: rnd() < 0.8 ? 1 : 2 };
                    if (p.custom) entrada.opts = { tamano: elegir(TAM), masa: elegir(MAS), toppings: rnd() < 0.4 ? [elegir(TOP)] : [] };
                    const r = cat.calcularItem(entrada);
                    if (r.ok) items.push(r.item);
                }
                const tipo = rnd() < 0.8 ? "delivery" : "recojo";
                const t = cat.calcularTotales(items, tipo, rnd() < 0.15 ? "LUR10" : null);
                const hora = 12 + Math.floor(Math.pow(rnd(), 0.7) * 10.5);
                const creado = base + (hora * 60 + Math.floor(rnd() * 60)) * 60000;
                const cancelado = rnd() < 0.05;
                const d = elegir(cat.DISTRITOS);
                const estado = cancelado ? "cancelado" : "entregado";
                const calif = !cancelado && rnd() < 0.4 ? (rnd() < 0.55 ? 5 : rnd() < 0.7 ? 4 : rnd() < 0.7 ? 3 : 2) : null;
                const coment = calif && rnd() < 0.7 ? elegir(COMENT[calif]) : null;
                insP.run(id, elegir(NOMBRES), "9" + String(10000000 + Math.floor(rnd() * 89999999)),
                    tipo, tipo === "delivery" ? "Calle " + (100 + Math.floor(rnd() * 900)) : "", tipo === "delivery" ? d.nombre : "",
                    tipo === "delivery" ? d.lat + (rnd() - 0.5) * 0.01 : null, tipo === "delivery" ? d.lng + (rnd() - 0.5) * 0.01 : null,
                    t.subtotal, t.envio, t.descuento, t.cupon, t.total, elegir(cat.PAGOS), estado,
                    tipo === "delivery" && !cancelado ? elegir(reps) : null, cancelado ? 0 : 1,
                    String(1000 + Math.floor(rnd() * 9000)), creado, creado + 35 * 60000, calif, coment);
                items.forEach(i => insD.run(id, i.id, i.cat, i.nombre, i.detalle, i.precio, i.cant));
                const flujo = cancelado ? ["cola", "cancelado"] : (tipo === "delivery" ? FLUJO_D : FLUJO_R);
                flujo.forEach((e, z) => insH.run(id, e, creado + z * (3 + Math.floor(rnd() * 4)) * 60000));
            }
        }
        db.prepare("INSERT INTO meta (clave, valor) VALUES ('historial_demo', ?)").run(String(id));
    })();
}
sembrarHistorial();

function sembrarExtrabajador() {
    if (db.prepare("SELECT 1 FROM meta WHERE clave = 'ex_demo'").get()) return;
    const ahora = Date.now();
    db.transaction(() => {
        if (!db.prepare("SELECT 1 FROM usuarios WHERE usuario = 'D-miguel'").get()) {
            const admin = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1").get();
            db.prepare(`INSERT INTO usuarios (usuario,password_hash,rol,nombre,telefono,email,dni,activo,inhabilitado_en,inhabilitado_motivo,inhabilitado_por,creado)
                VALUES ('D-miguel',?,'delivery','Miguel Paredes','987 777 888','miguel@demo.pe','45123789',0,?,?,?,?)`)
                .run(bcrypt.hashSync("1234", 10), ahora - 40 * 86400000,
                    "Despido por falta grave: incumplimiento reiterado de las normas de entrega. No recontratable.",
                    admin ? admin.id : null, ahora - 400 * 86400000);
        }
        const ex = db.prepare("SELECT id FROM usuarios WHERE usuario = 'D-miguel'").get().id;
        db.prepare(`UPDATE pedidos SET repartidor_id = ? WHERE cliente_id IS NULL AND tipo = 'delivery' AND estado = 'entregado'
            AND repartidor_id IS NOT NULL AND creado < ? AND id % 4 = 0`).run(ex, ahora - 41 * 86400000);
        db.prepare("INSERT INTO meta (clave, valor) VALUES ('ex_demo', '1')").run();
    })();
}
sembrarExtrabajador();

function sembrarCalifRepartidores() {
    if (process.env.SEED_HISTORIAL === "0") return;
    if (db.prepare("SELECT 1 FROM meta WHERE clave = 'calif_rep_demo'").get()) return;
    let semilla = 777;
    const rnd = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
    const COM = {
        5: ["Muy amable y puntual.", "Excelente atención, cuidó que la pizza llegara caliente.", "Rápido y cordial.", "Nos llamó al llegar, todo perfecto."],
        4: ["Buen servicio, llegó a tiempo.", "Amable, aunque le costó encontrar la dirección."],
        3: ["Llegó un poco tarde pero fue amable.", "Servicio regular."],
        2: ["Se demoró mucho y no avisó.", "Poco amable al entregar."],
        1: ["No respetó las indicaciones de entrega."]
    };
    const ex = (db.prepare("SELECT id FROM usuarios WHERE usuario = 'D-miguel'").get() || {}).id;
    const filas = db.prepare(`SELECT id, repartidor_id FROM pedidos WHERE cliente_id IS NULL AND tipo = 'delivery' AND estado = 'entregado'
        AND repartidor_id IS NOT NULL AND rep_estrellas IS NULL ORDER BY id`).all();
    const upd = db.prepare("UPDATE pedidos SET rep_estrellas = ?, rep_comentario = ? WHERE id = ?");
    db.transaction(() => {
        for (const f of filas) {
            if (rnd() > 0.45) continue;
            const x = rnd();
            let e = x < 0.55 ? 5 : x < 0.8 ? 4 : x < 0.92 ? 3 : x < 0.98 ? 2 : 1;
            if (f.repartidor_id === ex) e = Math.max(1, e - 2);
            const com = rnd() < 0.5 ? COM[e][Math.floor(rnd() * COM[e].length)] : null;
            upd.run(e, com, f.id);
        }
        db.prepare("INSERT INTO meta (clave, valor) VALUES ('calif_rep_demo', '1')").run();
    })();
}
sembrarCalifRepartidores();

function sembrarEtiquetasRepartidores() {
    if (db.prepare("SELECT 1 FROM meta WHERE clave = 'etiquetas_demo'").get()) return;
    const filas = db.prepare("SELECT id, rep_estrellas e FROM pedidos WHERE rep_estrellas IS NOT NULL AND rep_etiquetas IS NULL ORDER BY id").all();
    const upd = db.prepare("UPDATE pedidos SET rep_etiquetas = ? WHERE id = ?");
    db.transaction(() => {
        for (const f of filas) {
            const t = f.e >= 5 ? ["puntual", "buen_estado", "amable"] : f.e === 4 ? ["puntual", "buen_estado"]
                : f.e === 3 ? ["tarde"] : f.e === 2 ? ["tarde", "poco_amable"] : ["mal_estado", "sin_indicaciones"];
            upd.run(t.join(","), f.id);
        }
        db.prepare("INSERT INTO meta (clave, valor) VALUES ('etiquetas_demo', '1')").run();
    })();
}
sembrarEtiquetasRepartidores();

module.exports = db;
