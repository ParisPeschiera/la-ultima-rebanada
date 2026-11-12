(async function () {
    const sesion = LUR.Auth.require(["delivery", "admin"]);
    if (!sesion) return;
    try { await LUR.init(); } catch (e) { return; }

    const $ = (id) => document.getElementById(id);
    const { esc, fmt } = LUR;
    const esAdmin = sesion.rol === "admin";

    $("nombreUsuario").textContent = `${LUR.ROLES[sesion.rol].icon} ${sesion.nombre || sesion.usuario}`;
    $("btnSalir").addEventListener("click", () => { LUR.Auth.logout(); location.href = "login.html"; });
    LUR.iniciarReloj();

    const ETIQUETA = {
        asignado: ["Por recoger", "chip-naranja"], recogido: ["Recogido", "chip-azul"],
        camino: ["En camino", "chip-rojo"], entregado: ["Entregado", "chip-verde"]
    };
    const BOTON = {
        asignado: "Confirmar recojo en tienda 📦",
        recogido: "Salir a entregar 🛵"
    };

    let filtro = "todos";
    let firmaAnterior = "";
    let firmaRuta = "";
    let seleccion = [];

    const origenDe = (o) => o.origenLat != null ? { lat: o.origenLat, lng: o.origenLng } : { lat: LUR.TIENDA.lat, lng: LUR.TIENDA.lng };

    const misOrdenes = () => LUR.getOrders().filter(o =>
        o.tipo === "delivery" && o.repartidor &&
        (esAdmin || o.repartidor === sesion.usuario) &&
        ["asignado", "recogido", "camino", "entregado"].includes(o.estado));

    async function avanzar(id) {
        const o = LUR.getOrder(id);
        if (!o) return;
        const siguiente = o.estado === "asignado" ? "recogido" : o.estado === "recogido" ? "camino" : null;
        if (!siguiente) return;
        const r = await LUR.cambiarEstado(id, siguiente);
        if (!r.ok) return LUR.toast(r.error, "error");
        LUR.toast(siguiente === "recogido"
            ? `#${id} recogido. Cuando estés listo, sal a entregar.`
            : `#${id} en camino: el cliente ya ve tu recorrido`);
    }

    async function confirmarEntrega(id) {
        const input = document.getElementById("cod-" + id);
        const val = input.value.trim();
        if (!val) {
            input.classList.add("error");
            return LUR.toast("Pídele al cliente su código de 4 dígitos", "error");
        }
        const r = await LUR.cambiarEstado(id, "entregado", { codigo: val });
        if (!r.ok) {
            input.classList.add("error");
            input.value = "";
            input.placeholder = "Incorrecto";
            return LUR.toast(r.error, "error");
        }
        LUR.toast(`Pedido #${id} entregado ✓ ¡Buen trabajo!`);
    }

    $("listaPedidos").addEventListener("click", (e) => {
        const av = e.target.closest("[data-avanzar]");
        const en = e.target.closest("[data-entregar]");
        if (av) avanzar(av.dataset.avanzar);
        if (en) confirmarEntrega(en.dataset.entregar);
    });

    $("filtros").addEventListener("click", (e) => {
        const b = e.target.closest("[data-filtro]");
        if (!b) return;
        filtro = b.dataset.filtro;
        document.querySelectorAll(".filtro").forEach(x => x.classList.toggle("activo", x === b));
        firmaAnterior = "";
        render();
    });

    function textoCobro(o) {
        if (o.pago === "efectivo") {
            const vuelto = o.pagaCon && o.pagaCon > o.total ? ` · paga con ${fmt(o.pagaCon)}, vuelto ${fmt(o.pagaCon - o.total)}` : "";
            return `💵 Cobrar <strong>${fmt(o.total)}</strong> en efectivo${vuelto}`;
        }
        if (o.pago === "tarjeta") return `💳 Cobrar <strong>${fmt(o.total)}</strong> con POS`;
        return `📱 Pago por Yape/Plin — verifica la transferencia de <strong>${fmt(o.total)}</strong>`;
    }

    function tarjeta(o) {
        const [txt, cls] = ETIQUETA[o.estado];
        const activo = o.estado !== "entregado";
        let acciones = "";

        if (o.estado === "recogido" && o.parada) {
            acciones = `<div class="espera espera-ruta">⏳ Parada ${o.parada} de tu ruta · ${o.paradasAntes ? `${o.paradasAntes} entrega${o.paradasAntes > 1 ? "s" : ""} antes` : "sigues tú"}<br><small>Arrancará sola al entregar la anterior.</small></div>`;
        } else if (BOTON[o.estado]) {
            acciones = `<button class="btn btn-bloque" type="button" data-avanzar="${o.id}">${BOTON[o.estado]}</button>`;
        } else if (o.estado === "camino") {
            acciones = `
                <div class="fila">
                    <input type="text" id="cod-${o.id}" inputmode="numeric" maxlength="4" placeholder="Código" aria-label="Código del cliente">
                    <button class="btn btn-verde" type="button" data-entregar="${o.id}">Confirmar entrega ✓</button>
                </div>
                <small>El cliente tiene un código de 4 dígitos en su pantalla.</small>`;
        } else {
            acciones = `<div class="espera">✅ Entrega finalizada</div>`;
        }

        return `
        <article class="pedido" data-estado="${o.estado}">
            <div class="pedido-cabecera">
                <div>
                    <div class="numero">#${o.id}</div>
                    <div class="pedido-meta">Pedido ${LUR.hace(o.creado)}${o.parada && activo ? ` · 🕒 llegas ~${LUR.hora(o.eta)}` : ""}</div>
                </div>
                <span class="chip ${cls}">${o.parada && o.estado !== "entregado" ? `Parada ${o.parada} · ` : ""}${txt}</span>
            </div>
            ${o.estado === "asignado" && puedeRuta() ? `
            <label class="elegir-ruta ${seleccion.includes(o.id) ? "activo" : ""}">
                <input type="checkbox" data-ruta="${o.id}" ${seleccion.includes(o.id) ? "checked" : ""}>
                ${seleccion.includes(o.id) ? `Parada ${seleccion.indexOf(o.id) + 1} de la ruta` : "Añadir a mi ruta"}
            </label>` : ""}

            <div class="pedido-datos">
                <strong>👤 ${esc(o.cliente.nombre)}</strong>
                <a href="tel:${esc(o.cliente.telefono.replace(/\s/g, ""))}">📞 ${esc(o.cliente.telefono)}</a>
                <span>📍 ${esc(o.direccion)}, ${esc(o.distrito)}</span>
                ${o.referencia ? `<span>🧭 ${esc(o.referencia)}</span>` : ""}
                ${esAdmin ? `<span>🛵 ${esc(o.repartidor)}</span>` : ""}
            </div>

            <ul class="pedido-items">
                ${o.items.map(i => `<li><span class="cant">${i.cant}</span><span>${esc(i.nombre)}${i.detalle ? `<small>${esc(i.detalle)}</small>` : ""}</span></li>`).join("")}
            </ul>
            ${o.notas ? `<div class="pedido-nota">📝 ${esc(o.notas)}</div>` : ""}
            ${activo ? `<div class="pedido-nota" style="background:var(--azul-suave)">${textoCobro(o)}</div>` : ""}

            ${["recogido", "camino"].includes(o.estado) ? `<div class="mapa" data-mapa="${o.id}"></div><small>📡 El cliente ve tu posición en su mapa</small>` : ""}

            <div class="pedido-acciones">
                ${activo ? `<a class="btn btn-claro btn-bloque" href="${LUR.mapsLink(o)}" target="_blank" rel="noopener">🗺️ Ver ruta en Google Maps</a>` : ""}
                ${acciones}
            </div>
        </article>`;
    }

    function actualizarMapas() {
        document.querySelectorAll("[data-mapa]").forEach(el => {
            const o = LUR.getOrder(el.dataset.mapa);
            if (o) LUR.Mapa.mostrar(el, o);
        });
    }

    const porRecoger = () => misOrdenes().filter(o => o.estado === "asignado");
    const puedeRuta = () => !esAdmin && porRecoger().length >= 2;
    const nombreParada = (o) => `#${o.id} · ${o.distrito}`;

    function sugerirOrden() {
        let resto = seleccion.map(id => LUR.getOrder(id)).filter(Boolean);
        let punto = { lat: LUR.TIENDA.lat, lng: LUR.TIENDA.lng };
        const orden = [];
        while (resto.length) {
            resto.sort((a, b) => LUR.Mapa.distanciaKm(punto, a) - LUR.Mapa.distanciaKm(punto, b));
            const sig = resto.shift();
            orden.push(sig.id);
            punto = sig;
        }
        return orden;
    }

    function kmRuta(ids) {
        let punto = { lat: LUR.TIENDA.lat, lng: LUR.TIENDA.lng }, km = 0;
        ids.forEach(id => { const o = LUR.getOrder(id); if (o) { km += LUR.Mapa.distanciaKm(punto, o); punto = o; } });
        return km;
    }
    const kmIdaVuelta = (ids) => ids.reduce((t, id) => { const o = LUR.getOrder(id); return t + (o ? 2 * LUR.Mapa.distanciaKm(LUR.TIENDA, o) : 0); }, 0);

    function renderRuta() {
        const box = $("rutaBox");
        seleccion = seleccion.filter(id => { const o = LUR.getOrder(id); return o && o.estado === "asignado"; });
        const hayRuta = misOrdenes().some(o => o.parada && o.estado !== "entregado");
        const firma = seleccion.join(",") + "|" + puedeRuta() + "|" + hayRuta;
        if (firma === firmaRuta) return;
        firmaRuta = firma;

        if (sesion.rol !== "delivery" || (!puedeRuta() && !hayRuta)) { box.classList.add("oculto"); box.innerHTML = ""; return; }
        box.classList.remove("oculto");

        if (!seleccion.length) {
            box.innerHTML = hayRuta
                ? `<div class="ruta-cab"><h3>🧭 Ruta en curso</h3><p>Entrega en el orden de las paradas. Al confirmar cada código, la siguiente arranca sola.</p></div>`
                : `<div class="ruta-cab"><h3>🧭 Varias entregas, un solo viaje</h3>
                   <p>Tienes ${porRecoger().length} pedidos por recoger. Marca los que llevarás con <strong>“Añadir a mi ruta”</strong> en el orden en que los visitarás y sal una sola vez de la tienda.</p></div>`;
            return;
        }
        const ids = seleccion;
        const ahorro = Math.max(0, kmIdaVuelta(ids) - kmRuta(ids));
        box.innerHTML = `
            <div class="ruta-cab"><h3>🧭 Tu ruta (${ids.length} ${ids.length === 1 ? "parada" : "paradas"})</h3>
                <p>🏪 Tienda → ${ids.map(id => esc(LUR.getOrder(id).distrito)).join(" → ")}</p></div>
            <ol class="ruta-lista">
                ${ids.map((id, i) => { const o = LUR.getOrder(id); return `
                <li><span class="ruta-num">${i + 1}</span><span class="ruta-nom"><strong>${esc(nombreParada(o))}</strong><small>${esc(o.direccion)}</small></span>
                    <span class="ruta-mover">
                        <button type="button" class="btn-icono" data-subir="${id}" aria-label="Subir parada" ${i === 0 ? "disabled" : ""}>▲</button>
                        <button type="button" class="btn-icono" data-bajar="${id}" aria-label="Bajar parada" ${i === ids.length - 1 ? "disabled" : ""}>▼</button>
                        <button type="button" class="btn-icono" data-quitar="${id}" aria-label="Quitar de la ruta">✕</button>
                    </span></li>`; }).join("")}
            </ol>
            ${ids.length > 1 ? `<p class="ruta-ahorro">Sin volver a la tienda ahorras unos <strong>${ahorro.toFixed(1)} km</strong> frente a ir y volver por cada pedido.</p>` : ""}
            <div class="ruta-acciones">
                ${ids.length > 1 ? `<button type="button" class="btn btn-claro" data-sugerir>✨ Ordenar por cercanía</button>` : ""}
                <button type="button" class="btn" data-salir>Recoger y salir con ${ids.length} ${ids.length === 1 ? "pedido" : "pedidos"} 🛵</button>
            </div>`;
    }

    async function salirConRuta() {
        const ids = seleccion.slice();
        const r = await LUR.crearRuta(ids);
        if (!r.ok) return LUR.toast(r.error, "error");
        seleccion = [];
        firmaRuta = ""; firmaAnterior = "";
        LUR.toast(`Ruta iniciada con ${ids.length} paradas 🛵 Primero: #${ids[0]}`);
        render();
    }

    $("rutaBox").addEventListener("click", (e) => {
        const t = (a) => e.target.closest(`[${a}]`);
        let b;
        if ((b = t("data-subir")) || (b = t("data-bajar"))) {
            const id = Number(b.dataset.subir || b.dataset.bajar), i = seleccion.indexOf(id);
            const j = b.dataset.subir ? i - 1 : i + 1;
            if (j >= 0 && j < seleccion.length) { [seleccion[i], seleccion[j]] = [seleccion[j], seleccion[i]]; }
        } else if ((b = t("data-quitar"))) seleccion = seleccion.filter(x => x !== Number(b.dataset.quitar));
        else if (t("data-sugerir")) seleccion = sugerirOrden();
        else if (t("data-salir")) return salirConRuta();
        else return;
        firmaRuta = ""; firmaAnterior = "";
        render();
    });

    $("listaPedidos").addEventListener("change", (e) => {
        const c = e.target.closest("[data-ruta]");
        if (!c) return;
        const id = Number(c.dataset.ruta);
        seleccion = c.checked ? [...seleccion, id] : seleccion.filter(x => x !== id);
        firmaRuta = ""; firmaAnterior = "";
        render();
    });

    function render() {
        const todas = misOrdenes().sort((a, b) => b.creado - a.creado);
        const n = (e) => todas.filter(o => o.estado === e).length;
        $("porRecoger").textContent = n("asignado");
        $("porEntregar").textContent = n("recogido");
        $("enCamino").textContent = n("camino");
        $("entregados").textContent = todas.filter(o => o.estado === "entregado" && LUR.esHoy(o.creado)).length;

        const lista = (filtro === "todos" ? todas : todas.filter(o => o.estado === filtro))
            .sort((a, b) => (a.estado === "entregado") - (b.estado === "entregado")
                || (a.parada || 99) - (b.parada || 99)
                || b.creado - a.creado);

        renderRuta();
        const firma = filtro + "|" + seleccion.join(",") + "|" + lista.map(o => o.id + o.estado + (o.parada || "") + (o.paradasAntes || "")).join(",");
        if (firma !== firmaAnterior) {
            firmaAnterior = firma;
            $("listaPedidos").innerHTML = lista.length
                ? lista.map(tarjeta).join("")
                : `<div class="vacio"><span>🛵</span>No tienes entregas en esta vista. Cuando administración te asigne un pedido aparecerá aquí.</div>`;
        }
        actualizarMapas();
    }

    const chk = $("chkGps");
    let watchId = null, ultimoEnvio = 0;
    const enVuelo = new Set();
    const enCamino = () => misOrdenes().filter(o => o.estado === "camino" && o.lat != null);

    if (sesion.rol !== "delivery") $("gpsBox").classList.add("oculto");

    chk.addEventListener("change", () => {
        if (chk.checked) {
            if (!navigator.geolocation) { chk.checked = false; return LUR.toast("Tu navegador no permite ubicación", "error"); }
            watchId = navigator.geolocation.watchPosition((p) => {
                const ahora = Date.now();
                if (ahora - ultimoEnvio < 3000) return;
                ultimoEnvio = ahora;
                const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
                enCamino().forEach(o => {
                    const total = LUR.Mapa.distanciaKm(origenDe(o), o);
                    const resta = LUR.Mapa.distanciaKm(pos, o);
                    const progreso = total > 0 ? Math.min(0.95, Math.max(0, 1 - resta / total)) : 0.5;
                    LUR.enviarUbicacion(o.id, { ...pos, progreso });
                });
            }, () => {
                LUR.toast("No se pudo usar el GPS. Se simulará el recorrido.", "error");
                chk.checked = false;
            }, { enableHighAccuracy: true, maximumAge: 2000 });
            LUR.toast("GPS real activado 📡");
        } else if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    });

    if (sesion.rol === "delivery") {
        setInterval(async () => {
            if (chk.checked) return;
            for (const o of enCamino().filter(x => (x.progreso || 0) < 0.95 && !enVuelo.has(x.id))) {
                enVuelo.add(o.id);
                try {
                    const pts = await LUR.Mapa.ruta(origenDe(o), { lat: o.lat, lng: o.lng });
                    const prog = Math.min(0.95, Math.round(((o.progreso || 0) + 0.03) * 100) / 100);
                    const p = LUR.Mapa.puntoEnRuta(pts, prog);
                    await LUR.enviarUbicacion(o.id, { lat: p.lat, lng: p.lng, progreso: prog });
                } finally { enVuelo.delete(o.id); }
            }
        }, 2500);
    }

    async function cargarMiNota() {
        if (sesion.rol !== "delivery") return;
        const r = await LUR.http("GET", "/api/mi-calificacion");
        if (!r.ok || !r.data.total) return;
        $("miNota").innerHTML = `<span>Mi calificación</span><strong>${r.data.promedio.toFixed(1)} <i>★</i></strong><small>${r.data.total} opiniones</small>`;
        $("miNota").classList.remove("oculto");
    }
    cargarMiNota();
    setInterval(cargarMiNota, 60000);

    LUR.subscribe(render);
})();
