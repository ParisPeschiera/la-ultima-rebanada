const LUR = (() => {

    const K = { session: "lur_session", mis: "lur_mis" };
    const L = {};

    L.MENU = []; L.CATEGORIAS = []; L.TAMANOS = []; L.MASAS = []; L.TOPPINGS = [];
    L.ETIQUETAS_REPARTIDOR = []; L.CUPONES = {}; L.ENVIO = {}; L.DISTRITOS = []; L.DISTRITOS_GEO = [];
    L.TIENDA = null; L.RADIO_KM = 15;

    L.PAGOS = [
        { id: "efectivo", label: "Efectivo", icon: "💵" },
        { id: "tarjeta", label: "Tarjeta (POS al recibir)", icon: "💳" },
        { id: "yape", label: "Yape / Plin", icon: "📱" }
    ];

    L.ESTADOS = {
        cola:      { label: "Pedido recibido",      paso: 1, msg: "Recibimos tu pedido. La cocina lo tomará en unos minutos." },
        cocinando: { label: "Preparando tu pedido", paso: 2, msg: "Nuestros cocineros están preparando tu pedido." },
        horno:     { label: "En el horno",          paso: 3, msg: "Tu pizza se está horneando. ¡Ya casi!" },
        listo:     { label: "Listo",                paso: 3, msg: "Tu pedido está listo. Estamos asignando un repartidor." },
        asignado:  { label: "Repartidor asignado",  paso: 3, msg: "Un repartidor ya fue asignado y va a recoger tu pedido." },
        recogido:  { label: "Pedido recogido",      paso: 4, msg: "El repartidor recogió tu pedido y está por salir." },
        camino:    { label: "En camino",            paso: 4, msg: "Tu pedido va en camino. Ten a la mano tu código de entrega." },
        entregado: { label: "Entregado",            paso: 5, msg: "¡Pedido entregado! Que lo disfrutes." },
        cancelado: { label: "Cancelado",            paso: 0, msg: "Este pedido fue cancelado. Escríbenos si necesitas ayuda." }
    };
    L.PASOS_DELIVERY = ["Recibido", "Preparando", "Horneando", "En camino", "Entregado"];
    L.PASOS_RECOJO = ["Recibido", "Preparando", "Horneando", "Listo para recoger", "Entregado"];
    L.ACTIVOS_REPARTO = ["asignado", "recogido", "camino"];

    L.PREFIJOS = { cliente: "U-", cocinero: "C-", delivery: "D-", admin: "" };
    L.ROLES = {
        cliente: { label: "Cliente", icon: "👤", home: "index.html" },
        cocinero: { label: "Cocinero", icon: "👨‍🍳", home: "cocinero.html" },
        delivery: { label: "Repartidor", icon: "🛵", home: "delivery.html" },
        admin: { label: "Administrador", icon: "🗂️", home: "admin.html" }
    };

    L.pasoDe = (o) => (o.tipo === "recojo" && o.estado === "listo") ? 4 : (L.ESTADOS[o.estado] ? L.ESTADOS[o.estado].paso : 1);
    L.mensajeDe = (o) => (o.tipo === "recojo" && o.estado === "listo")
        ? "Tu pedido está listo. Pasa por el local con tu código de entrega."
        : (o.estado === "recogido" && o.paradasAntes > 0)
        ? `El repartidor ya salió con tu pedido y hace ${o.paradasAntes} ${o.paradasAntes === 1 ? "entrega" : "entregas"} antes de llegar a ti. Ten a la mano tu código.`
        : (L.ESTADOS[o.estado] ? L.ESTADOS[o.estado].msg : "");

    const leerSesion = () => {
        try {
            return JSON.parse(sessionStorage.getItem(K.session)) || JSON.parse(localStorage.getItem(K.session));
        } catch (e) { return null; }
    };
    const guardarSesion = (datos) => {
        if (datos.usuario.rol === "cliente") { sessionStorage.removeItem(K.session); localStorage.setItem(K.session, JSON.stringify(datos)); }
        else sessionStorage.setItem(K.session, JSON.stringify(datos));
    };
    const borrarSesion = () => {
        if (sessionStorage.getItem(K.session)) sessionStorage.removeItem(K.session);
        else localStorage.removeItem(K.session);
    };

    async function http(metodo, url, cuerpo) {
        const s = leerSesion();
        const headers = { "Content-Type": "application/json" };
        if (s && s.token) headers.Authorization = "Bearer " + s.token;
        try {
            const r = await fetch(url, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
            let data = null;
            try { data = await r.json(); } catch (e) {  }
            if (r.status === 401 && s && !url.includes("/auth/login")) {
                borrarSesion();
                if (!location.pathname.endsWith("index.html") && !location.pathname.endsWith("login.html")) location.replace("login.html");
            }
            return { ok: r.ok, status: r.status, data, error: r.ok ? null : ((data && data.error) || "No se pudo completar la acción.") };
        } catch (e) {
            return { ok: false, status: 0, data: null, error: "Sin conexión con el servidor." };
        }
    }
    L.http = http;
    L.token = () => { const s = leerSesion(); return s ? s.token : null; };

    L.Auth = {
        session: () => { const s = leerSesion(); return s ? s.usuario : null; },
        async login(usuario, password) {
            const r = await http("POST", "/api/auth/login", { usuario, password });
            if (!r.ok) return { ok: false, error: r.error };
            guardarSesion({ token: r.data.token, usuario: r.data.usuario });
            return { ok: true, usuario: r.data.usuario };
        },
        async registrar({ nombre, email, password, telefono }) {
            const r = await http("POST", "/api/auth/register", { nombre, email, password, telefono });
            if (!r.ok) return { ok: false, error: r.error };
            guardarSesion({ token: r.data.token, usuario: r.data.usuario });
            return { ok: true, usuario: r.data.usuario };
        },
        logout() { borrarSesion(); cache.orders = []; cache.seg = {}; },
        require(roles) {
            const s = L.Auth.session();
            if (!s || !roles.includes(s.rol)) { window.location.replace("login.html"); return null; }
            return s;
        },
        home: (rol) => L.ROLES[rol].home
    };

    const cache = { orders: [], users: [], notifs: [], inv: [], seg: {}, solic: [] };
    const listeners = new Set();
    const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

    let refrescando = false, pendiente = false;
    async function refrescar() {
        if (refrescando) { pendiente = true; return; }
        refrescando = true;
        try {
            const s = L.Auth.session();
            const trabajos = [http("GET", "/api/tienda").then(r => { if (r.ok) L.TIENDA_ESTADO = r.data; })];
            if (s && ["cocinero", "delivery", "admin"].includes(s.rol)) {
                trabajos.push(http("GET", "/api/pedidos").then(r => { if (r.ok) cache.orders = r.data; }));
                if (s.rol === "admin") {
                    trabajos.push(http("GET", "/api/usuarios").then(r => { if (r.ok) cache.users = r.data; }));
                    trabajos.push(http("GET", "/api/notificaciones").then(r => { if (r.ok) cache.notifs = r.data; }));
                    trabajos.push(http("GET", "/api/inventario").then(r => { if (r.ok) cache.inv = r.data; }));
                    trabajos.push(http("GET", "/api/solicitudes-zona").then(r => { if (r.ok) cache.solic = r.data; }));
                }
            } else if (s && s.rol === "cliente") {
                trabajos.push(http("GET", "/api/mis-pedidos").then(r => { if (r.ok) cache.orders = r.data; }));
                trabajos.push(http("GET", "/api/solicitudes-zona").then(r => { if (r.ok) cache.solic = r.data; }));
            } else {
                cache.orders = []; cache.solic = [];
            }
            Object.keys(cache.seg).forEach(id => trabajos.push(
                http("GET", `/api/seguimiento/${id}`).then(r => { cache.seg[id] = r.ok ? r.data : null; })));
            await Promise.all(trabajos);
            emit();
        } finally {
            refrescando = false;
            if (pendiente) { pendiente = false; refrescar(); }
        }
    }
    L.refrescar = refrescar;

    function conectarSocket() {
        if (typeof io === "undefined") return;
        const sock = io();
        let t;
        sock.on("cambio", () => { clearTimeout(t); t = setTimeout(refrescar, 120); });
        const indicador = (on) => document.querySelectorAll(".estado-online").forEach(el => {
            el.textContent = on ? "En línea" : "Reconectando…";
            el.classList.toggle("sin-conexion", !on);
        });
        sock.on("connect", () => { indicador(true); refrescar(); });
        sock.on("disconnect", () => indicador(false));
    }

    function avisoSinServidor() {
        const d = document.createElement("div");
        d.style.cssText = "position:fixed;inset:0;z-index:9999;background:#1d1410;color:#fff;display:grid;place-items:center;text-align:center;padding:24px;font-family:system-ui,sans-serif";
        d.innerHTML = `<div><div style="font-size:54px">🍕</div><h1 style="margin:8px 0">No hay conexión con el servidor</h1>
            <p style="max-width:44ch;margin:0 auto;opacity:.85">Esta versión necesita el servidor encendido. En la carpeta del proyecto ejecuta
            <code style="background:#000;padding:2px 8px;border-radius:6px">npm start</code> y abre
            <code style="background:#000;padding:2px 8px;border-radius:6px">http://localhost:3000</code>.</p></div>`;
        document.body.appendChild(d);
    }

    L.init = async function () {
        const r = await http("GET", "/api/catalogo");
        if (!r.ok) { avisoSinServidor(); throw new Error("Servidor no disponible"); }
        const c = r.data;
        L.MENU = c.menu; L.CATEGORIAS = c.categorias; L.TAMANOS = c.tamanos; L.MASAS = c.masas; L.TOPPINGS = c.toppings;
        L.ETIQUETAS_REPARTIDOR = c.etiquetasRepartidor || [];
        L.DISTRITOS_EXTRA = c.distritosExtra || []; L.ENVIO_FUERA = c.envioFuera || {};
        L.TIENDA_ESTADO = c.negocio || { abierta: true, mensaje: "" };
        L.CUPONES = c.cupones; L.ENVIO = c.envio; L.TIENDA = c.tienda; L.RADIO_KM = c.radioKm;
        L.DISTRITOS_GEO = c.distritos; L.DISTRITOS = c.distritos.map(d => d.nombre);
        conectarSocket();
        await refrescar();
        setInterval(refrescar, 20000);
    };

    L.subscribe = (fn) => { listeners.add(fn); fn(); };

    L.getOrders = () => cache.orders;
    L.getOrder = (id) => {
        const k = String(id).replace("#", "").trim();
        return cache.orders.find(o => String(o.id) === k) || cache.seg[k] || null;
    };
    L.getUsers = () => cache.users;
    L.getNotifs = () => cache.notifs;
    L.getSolicitudes = () => cache.solic;
    L.getInventario = () => cache.inv;
    L.misPedidos = () => [...cache.orders].sort((a, b) => b.creado - a.creado);
    L.repartidores = () => cache.users.filter(u => u.rol === "delivery" && u.activo);
    L.repartidorOcupado = (usuario) => cache.orders.some(o => o.repartidor === usuario && L.ACTIVOS_REPARTO.includes(o.estado));

    L.cargarSeguimiento = async (id) => {
        const k = String(id).replace(/\D/g, "");
        const r = await http("GET", `/api/seguimiento/${k}`);
        if (!r.ok) return false;
        cache.seg[k] = r.data;
        emit();
        return true;
    };

    L.crearPedido = async (payload) => {
        const r = await http("POST", "/api/pedidos", payload);
        if (r.ok) { cache.seg[r.data.id] = r.data; await refrescar(); }
        return r;
    };
    L.crearSolicitudZona = async (payload) => { const r = await http("POST", "/api/solicitudes-zona", payload); if (r.ok) await refrescar(); return r; };
    L.aceptarSolicitud = async (id) => {
        const r = await http("POST", `/api/solicitudes-zona/${id}/aceptar`, {});
        if (r.ok) { cache.seg[r.data.id] = r.data; await refrescar(); }
        return r;
    };
    L.cancelarSolicitud = async (id) => { const r = await http("POST", `/api/solicitudes-zona/${id}/cancelar`, {}); if (r.ok) await refrescar(); return r; };
    L.cotizarSolicitud = async (id, datos) => { const r = await http("POST", `/api/solicitudes-zona/${id}/cotizar`, datos); if (r.ok) await refrescar(); return r; };
    L.rechazarSolicitud = async (id, motivo) => { const r = await http("POST", `/api/solicitudes-zona/${id}/rechazar`, { motivo }); if (r.ok) await refrescar(); return r; };
    L.cambiarEstado = async (id, estado, extra = {}) => {
        const r = await http("PATCH", `/api/pedidos/${id}/estado`, { estado, ...extra });
        if (r.ok) await refrescar();
        return r;
    };
    L.cancelarMiPedido = async (id) => {
        const r = await http("POST", `/api/pedidos/${id}/cancelar`, {});
        if (r.ok) await refrescar();
        return r;
    };
    L.calificar = async (id, estrellas, comentario) => {
        const r = await http("POST", `/api/pedidos/${id}/calificacion`, { estrellas, comentario });
        if (r.ok) await refrescar();
        return r;
    };
    L.calificarRepartidor = async (id, estrellas, comentario, etiquetas = []) => {
        const r = await http("POST", `/api/pedidos/${id}/calificar-repartidor`, { estrellas, comentario, etiquetas });
        if (r.ok) await refrescar();
        return r;
    };
    L.cambiarTienda = async (abierta, mensaje = "") => {
        const r = await http("PUT", "/api/tienda", { abierta, mensaje });
        if (r.ok) await refrescar();
        return r;
    };
    L.crearRuta = async (ids) => {
        const r = await http("POST", "/api/ruta", { ids });
        if (r.ok) await refrescar();
        return r;
    };
    L.enviarUbicacion = (id, datos) => http("POST", `/api/pedidos/${id}/ubicacion`, datos);

    L.crearUsuario = async (datos) => {
        const r = await http("POST", "/api/usuarios", datos);
        if (r.ok) await refrescar();
        return r;
    };
    L.inhabilitarUsuario = async (usuario, motivo) => {
        const r = await http("POST", `/api/usuarios/${encodeURIComponent(usuario)}/inhabilitar`, { motivo });
        if (r.ok) await refrescar();
        return r;
    };
    L.reactivarUsuario = async (usuario) => {
        const r = await http("POST", `/api/usuarios/${encodeURIComponent(usuario)}/reactivar`);
        if (r.ok) await refrescar();
        return r;
    };
    L.reponerInsumo = async (id) => {
        const r = await http("POST", `/api/inventario/${id}/reponer`);
        if (r.ok) await refrescar();
        return r;
    };
    L.marcarNotifsLeidas = async () => { await http("POST", "/api/notificaciones/leidas"); await refrescar(); };

    const TIENDA_SVG = { x: 90, y: 270 };

    function hashTxt(t) {
        let h = 0;
        for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
        return h;
    }
    function rutaPara(distrito = "") {
        const h = hashTxt(distrito || "x");
        const cx = 360 + (h % 190);
        const cy = 50 + ((h >> 3) % 150);
        const mx = TIENDA_SVG.x + 130 + ((h >> 5) % 110);
        const my = cy + 40 + ((h >> 7) % 40);
        const pts = [TIENDA_SVG, { x: mx, y: TIENDA_SVG.y }, { x: mx, y: my }, { x: cx, y: my }, { x: cx, y: cy }];
        return pts;
    }
    function puntoEnRuta(pts, t) {
        const segs = [];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
            const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            segs.push(d); total += d;
        }
        let objetivo = Math.min(Math.max(t, 0), 1) * total;
        for (let i = 0; i < segs.length; i++) {
            if (objetivo <= segs[i]) {
                const k = segs[i] ? objetivo / segs[i] : 0;
                return {
                    x: pts[i].x + (pts[i + 1].x - pts[i].x) * k,
                    y: pts[i].y + (pts[i + 1].y - pts[i].y) * k
                };
            }
            objetivo -= segs[i];
        }
        return pts[pts.length - 1];
    }

    L.renderMapa = function renderMapa(el, pedido) {
        if (!el) return;
        const pts = rutaPara(pedido.distrito);
        const pos = puntoEnRuta(pts, pedido.estado === "entregado" ? 1 : pedido.progreso || 0);
        const mostrarMoto = ["recogido", "camino", "entregado"].includes(pedido.estado);
        const key = pedido.id + "|" + pedido.distrito;

        if (el.dataset.key !== key) {
            const calles = [];
            for (let x = 40; x < 600; x += 70) calles.push(`<line x1="${x}" y1="0" x2="${x}" y2="340"/>`);
            for (let y = 30; y < 340; y += 60) calles.push(`<line x1="0" y1="${y}" x2="600" y2="${y}"/>`);
            const ruta = pts.map(p => `${p.x},${p.y}`).join(" ");
            const fin = pts[pts.length - 1];
            el.innerHTML = `
            <svg viewBox="0 0 600 340" role="img" aria-label="Mapa del recorrido del pedido" preserveAspectRatio="xMidYMid slice">
                <rect width="600" height="340" class="mp-fondo"/>
                <rect x="410" y="215" width="130" height="80" rx="14" class="mp-parque"/>
                <path d="M0 120 C150 90 260 170 600 110 L600 135 C270 195 150 115 0 148 Z" class="mp-rio"/>
                <g class="mp-calles">${calles.join("")}</g>
                <polyline points="${ruta}" class="mp-ruta-base"/>
                <polyline points="${ruta}" class="mp-ruta"/>
                <text x="${TIENDA_SVG.x}" y="${TIENDA_SVG.y + 7}" class="mp-icono" text-anchor="middle">🍕</text>
                <text x="${fin.x}" y="${fin.y + 7}" class="mp-icono" text-anchor="middle">${pedido.tipo === "recojo" ? "🏪" : "🏠"}</text>
                <g class="mp-moto"><circle r="20" class="mp-halo"/><text y="8" class="mp-icono" text-anchor="middle">🛵</text></g>
            </svg>`;
            el.dataset.key = key;
        }
        const moto = el.querySelector(".mp-moto");
        if (moto) {
            moto.style.opacity = mostrarMoto ? 1 : 0;
            moto.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        }
    };

    L.fmt = (n) => "S/ " + Number(n).toFixed(2);
    L.esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const TZ = "America/Lima";
    L.hora = (ts = Date.now()) => new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
    const diaLima = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ });
    L.esHoy = (ts) => diaLima(ts) === diaLima(Date.now());
    L.minutosRestantes = (ts) => Math.max(0, Math.ceil((ts - Date.now()) / 60000));
    L.hace = (ts) => {
        const m = Math.floor((Date.now() - ts) / 60000);
        return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`;
    };
    L.mapsLink = (o) => "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(o.lat != null ? `${o.lat},${o.lng}` : `${o.direccion}, ${o.distrito}, Lima, Perú`);

    L.toast = function (msg, tipo = "ok") {
        let c = document.getElementById("toasts");
        if (!c) {
            c = document.createElement("div");
            c.id = "toasts";
            c.setAttribute("role", "status");
            c.setAttribute("aria-live", "polite");
            document.body.appendChild(c);
        }
        const t = document.createElement("div");
        t.className = "toast-item " + tipo;
        t.textContent = msg;
        const reordenar = () => [...c.querySelectorAll(".toast-item:not(.saliendo)")].reverse()
            .forEach((x, i) => x.style.setProperty("--i", Math.min(i, 3)));
        const cerrar = () => {
            if (t.classList.contains("saliendo")) return;
            t.classList.add("saliendo");
            reordenar();
            setTimeout(() => t.remove(), 260);
        };
        const armar = () => { clearTimeout(t._h); t._h = setTimeout(cerrar, 3200); };
        t.addEventListener("mouseenter", () => clearTimeout(t._h));
        t.addEventListener("mouseleave", armar);
        t.addEventListener("click", cerrar);
        c.appendChild(t);
        reordenar();
        requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("montado")));
        armar();
        const vivos = c.querySelectorAll(".toast-item:not(.saliendo)");
        if (vivos.length > 4) vivos[0].classList.add("saliendo"), setTimeout(() => vivos[0].remove(), 260);
    };

    L.iniciarReloj = function () {
        const el = document.getElementById("horaActual");
        if (!el) return;
        const tick = () => { el.textContent = L.hora(); };
        tick(); setInterval(tick, 1000);
    };

    return L;
})();
