(async function () {
    const sesion = LUR.Auth.require(["admin"]);
    if (!sesion) return;
    try { await LUR.init(); } catch (e) { return; }

    const $ = (id) => document.getElementById(id);
    const { esc, fmt } = LUR;

    $("nombreUsuario").textContent = `🗂️ ${sesion.nombre || sesion.usuario}`;
    $("btnSalir").addEventListener("click", () => { LUR.Auth.logout(); location.href = "login.html"; });
    LUR.iniciarReloj();

    function pintar(el, firma, html) {
        if (el._firma === firma) return;
        el._firma = firma;
        el.innerHTML = html();
    }

    const CHIP = {
        cola: "chip-azul", cocinando: "chip-naranja", horno: "chip-rojo", listo: "chip-verde",
        asignado: "chip-naranja", recogido: "chip-azul", camino: "chip-rojo", entregado: "chip-verde", cancelado: "chip-gris"
    };
    const FINALES = ["entregado", "cancelado"];
    const nombreDe = (usuario) => {
        const u = LUR.getUsers().find(x => x.usuario === usuario);
        return u ? u.nombre : usuario;
    };

    function renderKpis(orders) {
        const hoy = orders.filter(o => LUR.esHoy(o.creado) && o.estado !== "cancelado");
        $("kpiPedidos").textContent = hoy.length;
        $("kpiVentas").textContent = fmt(hoy.reduce((s, o) => s + o.total, 0));
        $("kpiActivos").textContent = orders.filter(o => !FINALES.includes(o.estado)).length;
    }

    const redondear05 = (n) => Math.round(n * 2) / 2;
    const sugeridoPorKm = (km) => {
        const c = LUR.ENVIO_FUERA || { minimo: 5, kmIncluidos: 10, porKm: 1 };
        return redondear05(c.minimo + Math.max(0, km - c.kmIncluidos) * c.porKm);
    };
    const rutaMaps = (s) => "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(`${LUR.TIENDA.lat},${LUR.TIENDA.lng}`) +
        "&destination=" + encodeURIComponent(s.lat != null ? `${s.lat},${s.lng}` : `${s.direccion}, ${s.distrito}, Lima, Perú`) + "&travelmode=driving";

    function renderZona() {
        const todas = LUR.getSolicitudes();
        const abiertas = todas.filter(s => s.estado === "pendiente" || s.estado === "cotizada").sort((a, b) => a.creado - b.creado);
        const cerradas = todas.filter(s => !(s.estado === "pendiente" || s.estado === "cotizada")).slice(0, 6);
        const badge = $("badgeZona");
        const porEvaluar = abiertas.filter(s => s.estado === "pendiente").length;
        badge.textContent = porEvaluar; badge.classList.toggle("oculto", porEvaluar === 0);

        const cont = $("listaZona");
        const firma = abiertas.map(s => `${s.id}${s.estado}${s.recargo}`).join(",") + "|" + cerradas.map(s => s.id + s.estado).join(",");
        if (cont._firma === firma) return;
        const guardado = {};
        cont.querySelectorAll("[data-zid]").forEach(el => { guardado[el.dataset.zid] = { km: el.querySelector(".z-km").value, rec: el.querySelector(".z-rec").value, nota: el.querySelector(".z-nota").value, editado: el.querySelector(".z-rec").dataset.editado }; });
        cont._firma = firma;

        const itemHtml = (s) => {
            const kmRutaIni = s.kmRuta ?? (s.kmLinea != null ? Math.round(s.kmLinea * (LUR.ENVIO_FUERA.factorRuta || 1.3) * 10) / 10 : "");
            const recIni = s.recargo ?? (kmRutaIni !== "" ? sugeridoPorKm(Number(kmRutaIni)) : (LUR.ENVIO_FUERA.minimo || 5));
            return `<article class="solic-item ${s.estado}" data-zid="${s.id}">
                <div class="solic-cab">
                    <div><h4>#${s.id} · ${esc(s.distrito)}</h4><small>${esc(s.cliente.nombre)} · <a href="tel:${esc(s.cliente.telefono)}">${esc(s.cliente.telefono)}</a> · ${LUR.hace(s.creado)}</small></div>
                    <span class="chip ${s.estado === "pendiente" ? "chip-naranja" : "chip-azul"}">${s.estado === "pendiente" ? "Por evaluar" : `Cotizada: ${fmt(s.recargo)} · esperando al cliente`}</span>
                </div>
                <div class="solic-datos">
                    <span>📍 ${esc(s.direccion)}${s.referencia ? ` — ${esc(s.referencia)}` : ""}</span>
                    <span class="solic-resumen">${s.items.map(i => `${i.cant} × ${esc(i.nombre)}`).join(" · ")} — ${fmt(s.totalBase)} sin recargo · ${esc(s.pago)}</span>
                    ${s.notas ? `<span class="solic-resumen">📝 ${esc(s.notas)}</span>` : ""}
                    <span class="solic-dist">
                        ${s.kmLinea != null ? `<span class="chip chip-gris">≈ ${s.kmLinea} km en línea recta</span>` : `<span class="chip chip-gris">Distancia por estimar</span>`}
                        <a href="${esc(rutaMaps(s))}" target="_blank" rel="noopener">Ver ruta en Google Maps ↗</a>
                    </span>
                </div>
                <div class="solic-form">
                    <div class="campo"><label>Distancia por ruta (km)</label><input type="number" class="z-km" min="0" max="200" step="0.1" value="${kmRutaIni}" placeholder="Ej: 9"><small>Opcional</small></div>
                    <div class="campo"><label>Recargo (S/)</label><input type="number" class="z-rec" min="0" max="${LUR.ENVIO_FUERA.maxRecargo || 60}" step="0.5" value="${recIni}"><small>Sugerido según la distancia</small></div>
                    <div class="campo"><label>Mensaje al cliente</label><input type="text" class="z-nota" maxlength="200" value="${esc(s.notaAdmin || "")}" placeholder="Opcional. Si rechazas, explica el motivo"></div>
                    <div class="solic-botones">
                        <button type="button" class="btn btn-verde btn-chico" data-z-cotizar="${s.id}">${s.estado === "cotizada" ? "Actualizar cotización" : "Enviar cotización"}</button>
                        <button type="button" class="btn btn-claro btn-chico" data-z-rechazar="${s.id}">Rechazar</button>
                    </div>
                </div>
                <small class="z-error rastreo-error" role="alert"></small>
            </article>`;
        };
        cont.innerHTML = (abiertas.length ? abiertas.map(itemHtml).join("") : `<p class="sin-datos">No hay pedidos fuera de zona por evaluar. 🎉</p>`) +
            (cerradas.length ? `<details class="solic-hist"><summary>Resueltas recientemente (${cerradas.length})</summary>${cerradas.map(s =>
                `<div>#${s.id} · ${esc(s.distrito)} · ${esc(s.cliente.nombre)} — ${{ aceptada: `aceptada${s.recargo != null ? ` (recargo ${fmt(s.recargo)})` : ""}, pedido #${s.pedidoId}`, rechazada: `rechazada: ${esc(s.notaAdmin)}`, cancelada: "cancelada por el cliente" }[s.estado] || s.estado}</div>`).join("")}</details>` : "");
        cont.querySelectorAll("[data-zid]").forEach(el => {
            const g = guardado[el.dataset.zid];
            if (g) { el.querySelector(".z-km").value = g.km; el.querySelector(".z-rec").value = g.rec; el.querySelector(".z-nota").value = g.nota; if (g.editado) el.querySelector(".z-rec").dataset.editado = "1"; }
        });
    }

    $("listaZona").addEventListener("input", (e) => {
        const art = e.target.closest("[data-zid]"); if (!art) return;
        if (e.target.classList.contains("z-rec")) e.target.dataset.editado = "1";
        if (e.target.classList.contains("z-km") && !art.querySelector(".z-rec").dataset.editado && e.target.value !== "") {
            art.querySelector(".z-rec").value = sugeridoPorKm(Number(e.target.value));
        }
    });
    $("listaZona").addEventListener("click", async (e) => {
        const bC = e.target.closest("[data-z-cotizar]"), bR = e.target.closest("[data-z-rechazar]");
        const b = bC || bR; if (!b) return;
        const art = b.closest("[data-zid]"), id = art.dataset.zid, error = art.querySelector(".z-error");
        error.textContent = "";
        b.disabled = true;
        const r = bC
            ? await LUR.cotizarSolicitud(id, { recargo: art.querySelector(".z-rec").value, kmRuta: art.querySelector(".z-km").value, nota: art.querySelector(".z-nota").value })
            : await LUR.rechazarSolicitud(id, art.querySelector(".z-nota").value);
        b.disabled = false;
        if (!r.ok) { error.textContent = bR && /motivo/i.test(r.error) ? "Para rechazar, escribe el motivo en “Mensaje al cliente”." : r.error; return; }
        LUR.toast(bC ? "Cotización enviada al cliente" : "Solicitud rechazada");
    });

    function renderAsignar(orders) {
        const pendientes = orders.filter(o => o.tipo === "delivery" && o.estado === "listo")
            .sort((a, b) => a.creado - b.creado);
        const reps = LUR.repartidores();
        const firma = pendientes.map(o => o.id).join(",") + "|" + reps.map(r => r.usuario + LUR.repartidorOcupado(r.usuario)).join(",");

        const badge = $("badgeAsignar");
        badge.textContent = pendientes.length;
        badge.classList.toggle("oculto", pendientes.length === 0);

        pintar($("listaAsignar"), firma, () => {
            if (!pendientes.length) return `<p class="sin-datos">No hay pedidos esperando repartidor. 🎉</p>`;
            if (!reps.length) return `<p class="sin-datos">No hay repartidores creados. Agrégalos en “Cuentas”.</p>`;
            return pendientes.map(o => `
                <div class="asignar-item">
                    <div class="info">
                        <strong>#${o.id} · ${esc(o.cliente.nombre)} · ${fmt(o.total)}</strong>
                        <span>📍 ${esc(o.direccion)}, ${esc(o.distrito)}</span>
                        <small>Listo ${LUR.hace(o.historial[o.historial.length - 1].ts)}</small>
                    </div>
                    <div class="acciones">
                        <select id="rep-${o.id}" aria-label="Repartidor para el pedido ${o.id}">
                            ${reps.map(r => `<option value="${esc(r.usuario)}">${esc(r.nombre)}${LUR.repartidorOcupado(r.usuario) ? " (en reparto · se suma a su ruta)" : " — disponible"}</option>`).join("")}
                        </select>
                        <button class="btn btn-chico" type="button" data-asignar="${o.id}">Asignar</button>
                    </div>
                </div>`).join("");
        });
    }

    $("listaAsignar").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-asignar]");
        if (!b) return;
        const id = b.dataset.asignar;
        const usuario = $("rep-" + id).value;
        b.disabled = true;
        const r = await LUR.cambiarEstado(id, "asignado", { repartidor: usuario });
        b.disabled = false;
        LUR.toast(r.ok ? `Pedido #${id} asignado a ${nombreDe(usuario)} ✓` : r.error, r.ok ? "ok" : "error");
    });

    function etqChips(ids) {
        if (!ids || !ids.length) return "";
        return `<div class="etq-mini">${ids.map(id => {
            const e = LUR.ETIQUETAS_REPARTIDOR.find(x => x.id === id);
            return e ? `<span class="chip ${e.tipo === "positiva" ? "chip-verde" : "chip-rojo"}">${esc(e.label)}</span>` : "";
        }).join("")}</div>`;
    }

    function renderAvisos() {
        const lista = LUR.getNotifs().slice(0, 10);
        pintar($("listaAvisos"), lista.map(n => n.id + (n.leida ? "r" : "n")).join(","), () =>
            lista.length
                ? lista.map(n => `<div class="aviso ${n.tipo === "listo" ? "listo" : n.tipo === "alerta" ? "alerta" : ""} ${n.leida ? "leida" : ""}"><span>${n.tipo === "listo" ? "✅" : n.tipo === "alerta" ? "" : "🔔"} ${esc(n.texto)}</span><time>${LUR.hora(n.ts)}</time></div>`).join("")
                : `<p class="sin-datos">Sin avisos por ahora.</p>`);
    }
    $("btnLeidas").addEventListener("click", () => LUR.marcarNotifsLeidas());

    function renderPedidos(orders) {
        const f = $("filtroPedidos").value;
        let lista = orders;
        if (f === "activos") lista = orders.filter(o => !FINALES.includes(o.estado));
        else if (f === "hoy") lista = orders.filter(o => LUR.esHoy(o.creado));
        else lista = orders.filter(o => o.estado === f);
        lista = [...lista].sort((a, b) => b.creado - a.creado);

        pintar($("cuerpoPedidos"), f + "|" + lista.map(o => o.id + o.estado + (o.repartidor || "") + (o.calificacion ? "c" : "") + (o.calRepartidor ? "r" : "")).join(","), () =>
            lista.length ? lista.map(o => `
                <tr>
                    <td><strong>#${o.id}</strong><br><small>${LUR.hora(o.creado)}</small></td>
                    <td>${esc(o.cliente.nombre)}<br><small>${esc(o.cliente.telefono)}</small></td>
                    <td>${o.tipo === "recojo" ? "🏪 Recojo" : `🛵 ${esc(o.distrito)}`}</td>
                    <td><span class="chip ${CHIP[o.estado]}">${LUR.ESTADOS[o.estado].label}</span></td>
                    <td><strong>${fmt(o.total)}</strong></td>
                    <td>${(LUR.PAGOS.find(p => p.id === o.pago) || {}).icon || ""} ${esc(o.pago)}</td>
                    <td>${o.repartidor ? esc(nombreDe(o.repartidor)) : "—"}</td>
                    <td>${o.calificacion ? "★".repeat(o.calificacion.estrellas) : "—"}</td>
                    <td title="${o.calRepartidor ? esc(o.calRepartidor.comentario) : ""}">${o.calRepartidor ? "★".repeat(o.calRepartidor.estrellas) + etqChips(o.calRepartidor.etiquetas) : "—"}</td>
                    <td class="acciones">${FINALES.includes(o.estado) ? "" : `<button class="btn btn-chico btn-claro" type="button" data-cancelar="${o.id}">Cancelar</button>`}</td>
                </tr>`).join("")
            : `<tr><td colspan="10" class="sin-datos">No hay pedidos en esta vista.</td></tr>`);
    }
    $("filtroPedidos").addEventListener("change", render);
    $("cuerpoPedidos").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-cancelar]");
        if (!b) return;
        if (!confirm(`¿Cancelar el pedido #${b.dataset.cancelar}? El cliente lo verá como cancelado.`)) return;
        const r = await LUR.cambiarEstado(b.dataset.cancelar, "cancelado");
        LUR.toast(r.ok ? `Pedido #${b.dataset.cancelar} cancelado` : r.error, r.ok ? "ok" : "error");
    });

    function actualizarVistaUsuario() {
        const limpio = $("nuNombre").value.trim().toLowerCase().replace(/\s+/g, "");
        $("nuVista").textContent = (LUR.PREFIJOS[$("nuRol").value] || "") + (limpio || "…");
    }
    $("nuNombre").addEventListener("input", actualizarVistaUsuario);
    $("nuRol").addEventListener("change", actualizarVistaUsuario);

    $("formUsuario").addEventListener("submit", async (e) => {
        e.preventDefault();
        const r = await LUR.crearUsuario({
            nombre: $("nuNombre").value,
            rol: $("nuRol").value,
            password: $("nuPassword").value,
            dni: $("nuDni").value.trim(),
            email: $("nuEmail").value.trim(),
            telefono: $("nuTelefono").value.trim()
        });
        const m = $("nuMensaje");
        if (!r.ok) { m.textContent = r.error; m.className = "rastreo-error"; return; }
        m.textContent = `✓ Cuenta creada: ${r.data.usuario} (${LUR.ROLES[r.data.rol].label})`;
        m.className = "rastreo-error ok";
        $("formUsuario").reset();
        actualizarVistaUsuario();
    });

    const fechaHora = (ts) => new Date(ts).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" });
    const ES_PERSONAL = (rol) => rol !== "cliente";

    function renderUsuarios() {
        const filtro = $("filtroCuentas").value;
        const todos = LUR.getUsers();
        const users = todos.filter(u => filtro === "todas" || (filtro === "activas" ? u.activo : !u.activo));
        const firma = filtro + "|" + todos.map(u => u.usuario + u.activo + (u.motivo || "")).join(",");
        pintar($("cuerpoUsuarios"), firma, () => users.length ? users.map(u => `
            <tr class="${u.activo ? "" : "fila-inhabilitada"}">
                <td><strong>${esc(u.usuario)}</strong></td>
                <td>${esc(u.nombre || "")}</td>
                <td><span class="chip">${LUR.ROLES[u.rol].icon} ${LUR.ROLES[u.rol].label}</span></td>
                <td>${esc(u.dni || "—")}</td>
                <td>${esc(u.email || "—")}</td>
                <td>${esc(u.telefono || "—")}</td>
                <td>${u.activo
                    ? `<span class="chip chip-verde">Activo</span>`
                    : `<span class="chip chip-gris">Inhabilitado</span><div class="inh-detalle"><strong>${fechaHora(u.inhabilitadoEn)}</strong>${u.inhabilitadoPor ? ` por ${esc(u.inhabilitadoPor)}` : ""}<br>${esc(u.motivo || "")}${ES_PERSONAL(u.rol) ? `<br><em>No puede volver a trabajar.</em>` : ""}</div>`}</td>
                <td class="acciones">${u.usuario === sesion.usuario ? `<small>(tú)</small>`
                    : u.activo ? `<button class="btn btn-chico btn-claro" type="button" data-inhabilitar="${esc(u.usuario)}">Inhabilitar</button>`
                    : (u.rol === "cliente" ? `<button class="btn btn-chico" type="button" data-reactivar="${esc(u.usuario)}">Reactivar</button>` : `<small class="definitivo">Definitivo</small>`)}</td>
            </tr>`).join("")
            : `<tr><td colspan="8" class="sin-datos">${filtro === "inhabilitadas" ? "No hay cuentas inhabilitadas." : "No hay cuentas."}</td></tr>`);
    }
    $("filtroCuentas").addEventListener("change", renderUsuarios);

    let inhObjetivo = null;
    function abrirInhabilitar(usuario) {
        const u = LUR.getUsers().find(x => x.usuario === usuario);
        if (!u) return;
        inhObjetivo = u;
        $("inhTitulo").textContent = `Inhabilitar a ${u.nombre}`;
        $("inhTexto").innerHTML = ES_PERSONAL(u.rol)
            ? `<strong>⚠️ Acción definitiva.</strong> ${esc(u.nombre)} (${LUR.ROLES[u.rol].label}, DNI ${esc(u.dni || "sin DNI")}) quedará registrado como <strong>inhabilitado</strong>: no podrá ingresar, no podrá volver a trabajar en el establecimiento y no podrá aparecer como personal nuevo. Sus pedidos e historial se conservan.`
            : `${esc(u.nombre)} no podrá ingresar ni comprar. Su historial se conserva y podrás <strong>reactivar</strong> la cuenta cuando quieras.`;
        $("inhUsuario").textContent = u.usuario;
        $("inhMotivo").value = ""; $("inhConfirma").value = ""; $("inhError").textContent = "";
        $("modalInhabilitar").classList.remove("oculto");
        $("inhMotivo").focus();
    }
    const cerrarInhabilitar = () => { $("modalInhabilitar").classList.add("oculto"); inhObjetivo = null; };
    $("inhCancelar").addEventListener("click", cerrarInhabilitar);
    $("modalInhabilitar").addEventListener("click", (e) => { if (e.target === $("modalInhabilitar")) cerrarInhabilitar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarInhabilitar(); });
    $("inhOk").addEventListener("click", async () => {
        if (!inhObjetivo) return;
        const motivo = $("inhMotivo").value.trim();
        if (motivo.length < 5) { $("inhError").textContent = "Escribe el motivo (mínimo 5 caracteres)."; return; }
        if ($("inhConfirma").value.trim() !== inhObjetivo.usuario) { $("inhError").textContent = "Para confirmar, escribe el usuario exactamente como aparece."; return; }
        $("inhOk").disabled = true;
        const r = await LUR.inhabilitarUsuario(inhObjetivo.usuario, motivo);
        $("inhOk").disabled = false;
        if (!r.ok) { $("inhError").textContent = r.error; return; }
        LUR.toast(`Cuenta ${inhObjetivo.usuario} inhabilitada`);
        cerrarInhabilitar();
        firmaHistorial = ""; cargarRepartidores();
    });

    $("cuerpoUsuarios").addEventListener("click", async (e) => {
        const i = e.target.closest("[data-inhabilitar]");
        if (i) return abrirInhabilitar(i.dataset.inhabilitar);
        const r = e.target.closest("[data-reactivar]");
        if (r) {
            if (!confirm(`¿Reactivar la cuenta ${r.dataset.reactivar}?`)) return;
            const res = await LUR.reactivarUsuario(r.dataset.reactivar);
            LUR.toast(res.ok ? "Cuenta reactivada" : res.error, res.ok ? "ok" : "error");
        }
    });

    function renderInventario() {
        const inv = LUR.getInventario();
        $("kpiAlertas").textContent = inv.filter(i => i.stock < i.minimo).length;
        pintar($("cuerpoInventario"), inv.map(i => i.id + i.stock).join(","), () => inv.map(i => {
            const bajo = i.stock < i.minimo;
            return `<tr class="${bajo ? "fila-bajo" : ""}">
                <td>${esc(i.insumo)}</td>
                <td><strong>${i.stock} ${esc(i.unidad)}</strong></td>
                <td>${i.minimo} ${esc(i.unidad)}</td>
                <td><span class="badge-stock ${bajo ? "badge-bajo" : "badge-ok"}">${bajo ? "Stock bajo" : "OK"}</span></td>
                <td class="acciones"><button class="btn btn-chico btn-claro" type="button" data-reponer="${i.id}">Reponer</button></td>
            </tr>`;
        }).join(""));
    }
    $("cuerpoInventario").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-reponer]");
        if (!b) return;
        const r = await LUR.reponerInsumo(b.dataset.reponer);
        LUR.toast(r.ok ? "Stock repuesto ✓" : r.error, r.ok ? "ok" : "error");
    });

    const ESTADO_CHIP = { entregado: "chip-verde", cancelado: "chip-gris", cola: "chip-azul", cocinando: "chip-naranja", horno: "chip-rojo", listo: "chip-verde", asignado: "chip-naranja", recogido: "chip-azul", camino: "chip-rojo" };
    const rep = { agrupar: "dia", metrica: "ventas", datos: null, grafico: null };

    const fechaCorta = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }).replace(".", "");
    const fechaLarga = (f) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "");
    function etiquetaPeriodo(p, agrupar) {
        if (agrupar === "mes") return new Date(p + "-15T12:00:00").toLocaleDateString("es-PE", { month: "short", year: "numeric" }).replace(".", "");
        if (agrupar === "semana") return "Sem. " + fechaCorta(p);
        return fechaCorta(p);
    }

    function parametrosVentas() {
        const r = $("vtRango").value;
        const base = `agrupar=${rep.agrupar}`;
        if (r === "personalizado") {
            const d = $("vtDesde").value, h = $("vtHasta").value;
            return d && h ? `${base}&desde=${d}&hasta=${h}` : null;
        }
        return `${base}&dias=${r}`;
    }

    async function cargarVentas() {
        const q = parametrosVentas();
        if (!q) return;
        const r = await LUR.http("GET", "/api/reportes/ventas?" + q);
        if (!r.ok) return LUR.toast(r.error, "error");
        rep.datos = r.data;
        const t = r.data.resumen;
        $("vtResumen").innerHTML = [
            ["Ventas", fmt(t.ventas), "verde"], ["Pedidos realizados", t.pedidos, "azul"], ["Entregados", t.entregados, "verde"],
            ["Cancelados", t.cancelados, "rojo"], ["Ticket promedio", fmt(t.ticket), "amarillo"]
        ].map(([n, v, c]) => `<div class="kpi-mini ${c}"><span>${n}</span><strong>${v}</strong></div>`).join("");

        const max = r.data.top.length ? r.data.top[0].cantidad : 1;
        $("vtTop").innerHTML = r.data.top.length
            ? r.data.top.map(p => `<li><div class="top-fila"><span>${esc(p.nombre)}</span><span>${p.cantidad} uds · ${fmt(p.ingresos)}</span></div><div class="top-barra"><i style="width:${Math.round(p.cantidad * 100 / max)}%"></i></div></li>`).join("")
            : `<li class="sin-datos">Sin ventas en este periodo.</li>`;
        dibujarGrafico();
    }

    function dibujarGrafico() {
        const d = rep.datos;
        if (!d) return;
        const caja = $("graficoVentas").parentElement;
        if (typeof Chart === "undefined") { caja.innerHTML = `<p class="sin-datos">No se pudo cargar la librería de gráficos.</p>`; return; }

        const css = getComputedStyle(document.documentElement);
        const rojo = css.getPropertyValue("--rojo").trim() || "#e8361c";
        const verde = css.getPropertyValue("--verde").trim() || "#2e7d32";
        const etiquetas = d.serie.map(p => etiquetaPeriodo(p.periodo, d.agrupar));
        const puntos = d.serie.length > 45 ? 0 : 3;
        const area = (ctx) => {
            const { chart } = ctx, a = chart.chartArea;
            if (!a) return "rgba(232,54,28,.15)";
            const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, "rgba(232,54,28,.38)"); g.addColorStop(1, "rgba(232,54,28,0)");
            return g;
        };

        const datasets = rep.metrica === "ventas"
            ? [{ label: "Ventas (S/)", data: d.serie.map(p => p.ventas), borderColor: rojo, backgroundColor: area, fill: true, tension: .3, pointRadius: puntos, pointHoverRadius: 6, borderWidth: 2.5 }]
            : [{ label: "Realizados", data: d.serie.map(p => p.pedidos), borderColor: rojo, backgroundColor: area, fill: true, tension: .3, pointRadius: puntos, borderWidth: 2.5 },
               { label: "Entregados", data: d.serie.map(p => p.entregados), borderColor: verde, backgroundColor: "transparent", fill: false, tension: .3, pointRadius: puntos, borderWidth: 2 }];

        const enCurso = d.hasta === d.hoy;
        const ultimo = d.serie.length - 1;
        datasets.forEach(ds => { ds.segment = { borderDash: (c) => (enCurso && c.p1DataIndex === ultimo) ? [6, 6] : undefined }; });
        $("vtNota").classList.toggle("oculto", !enCurso);

        if (rep.grafico) rep.grafico.destroy();
        Chart.defaults.font.family = '"Figtree", system-ui, sans-serif'; Chart.defaults.font.weight = 600; Chart.defaults.color = "#6b5d54";
        rep.grafico = new Chart($("graficoVentas"), {
            type: "line",
            data: { labels: etiquetas, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { display: rep.metrica === "pedidos", position: "bottom" },
                    tooltip: {
                        callbacks: {
                            label: (c) => rep.metrica === "ventas" ? ` Ventas: ${fmt(c.parsed.y)}` : ` ${c.dataset.label}: ${c.parsed.y}`,
                            afterBody: (items) => {
                                const p = d.serie[items[0].dataIndex];
                                return rep.metrica === "ventas" ? [`Entregados: ${p.entregados} · Ticket: ${fmt(p.ticket)}`] : [`Ventas: ${fmt(p.ventas)}`];
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
                    y: { beginAtZero: true, ticks: { precision: 0, callback: (v) => rep.metrica === "ventas" ? "S/ " + v : v } }
                }
            }
        });
        $("graficoVentas").setAttribute("aria-label",
            `Gráfico de ${rep.metrica === "ventas" ? "ventas" : "pedidos"} por ${d.agrupar}. Total de ventas ${fmt(d.resumen.ventas)} entre ${d.desde} y ${d.hasta}.`);
    }

    document.querySelectorAll("[data-agrupar]").forEach(b => b.addEventListener("click", () => {
        rep.agrupar = b.dataset.agrupar;
        document.querySelectorAll("[data-agrupar]").forEach(x => x.classList.toggle("activo", x === b));
        cargarVentas();
    }));
    document.querySelectorAll("[data-metrica]").forEach(b => b.addEventListener("click", () => {
        rep.metrica = b.dataset.metrica;
        document.querySelectorAll("[data-metrica]").forEach(x => x.classList.toggle("activo", x === b));
        dibujarGrafico();
    }));
    $("vtRango").addEventListener("change", () => {
        const personal = $("vtRango").value === "personalizado";
        $("vtPersonal").classList.toggle("oculto", !personal);
        if (personal && !$("vtHasta").value) {
            const hoy = (rep.datos && rep.datos.hoy) || new Date().toISOString().slice(0, 10);
            $("vtHasta").value = hoy;
            $("vtDesde").value = new Date(new Date(hoy + "T12:00:00").getTime() - 29 * 86400000).toISOString().slice(0, 10);
        }
        cargarVentas();
    });
    $("vtDesde").addEventListener("change", cargarVentas);
    $("vtHasta").addEventListener("change", cargarVentas);

    const abiertos = new Set();
    let firmaHistorial = "";

    async function cargarHistorial() {
        const r = await LUR.http("GET", `/api/reportes/historial?dias=${$("hsRango").value}`);
        if (!r.ok) return LUR.toast(r.error, "error");
        const firma = $("hsRango").value + JSON.stringify(r.data.dias);
        if (firma === firmaHistorial) return;
        firmaHistorial = firma;

        $("cuerpoHistorial").innerHTML = r.data.dias.map(d => `
            <tr class="fila-dia ${d.fecha === r.data.hoy ? "es-hoy" : ""} ${d.pedidos === 0 ? "sin-pedidos" : ""}" data-fecha="${d.fecha}">
                <td><strong>${fechaLarga(d.fecha)}</strong>${d.fecha === r.data.hoy ? ` <span class="chip chip-rojo">Hoy</span>` : ""}</td>
                <td>${d.pedidos}</td><td>${d.entregados}</td><td>${d.cancelados || "—"}</td>
                <td><strong>${fmt(d.ventas)}</strong></td><td>${d.entregados ? fmt(d.ticket) : "—"}</td>
                <td class="acciones">${d.pedidos ? `<button class="btn btn-chico btn-claro" type="button" data-dia="${d.fecha}">Ver pedidos</button>` : ""}</td>
            </tr>`).join("");
        const t = r.data.dias.reduce((a, d) => ({ p: a.p + d.pedidos, e: a.e + d.entregados, c: a.c + d.cancelados, v: a.v + d.ventas }), { p: 0, e: 0, c: 0, v: 0 });
        $("pieHistorial").innerHTML = `<tr><td>Total del periodo</td><td>${t.p}</td><td>${t.e}</td><td>${t.c}</td><td>${fmt(t.v)}</td><td>${t.e ? fmt(t.v / t.e) : "—"}</td><td></td></tr>`;
        abiertos.forEach(f => mostrarDia(f, true));
    }

    async function mostrarDia(fecha, forzar) {
        const fila = $("cuerpoHistorial").querySelector(`tr[data-fecha="${fecha}"]`);
        if (!fila) return;
        const previo = fila.nextElementSibling;
        if (previo && previo.classList.contains("detalle-dia")) {
            if (!forzar) { previo.remove(); abiertos.delete(fecha); return; }
            previo.remove();
        }
        const r = await LUR.http("GET", `/api/reportes/dia/${fecha}`);
        if (!r.ok) return LUR.toast(r.error, "error");
        abiertos.add(fecha);
        const tr = document.createElement("tr");
        tr.className = "detalle-dia";
        tr.innerHTML = `<td colspan="7"><div class="tabla-scroll"><table class="tabla tabla-interna">
            <thead><tr><th>Pedido</th><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Estado</th><th>Pago</th><th>Total</th><th>Repartidor</th></tr></thead>
            <tbody>${r.data.pedidos.map(p => `<tr>
                <td><strong>#${p.id}</strong></td><td>${LUR.hora(p.creado)}</td><td>${esc(p.cliente)}</td>
                <td>${p.tipo === "recojo" ? "🏪 Recojo" : "🛵 " + esc(p.distrito)}</td>
                <td><span class="chip ${ESTADO_CHIP[p.estado] || ""}">${esc(LUR.ESTADOS[p.estado].label)}</span></td>
                <td>${esc(p.pago)}</td><td>${fmt(p.total)}</td><td>${esc(p.repartidor || "—")}</td></tr>`).join("")}</tbody>
        </table></div></td>`;
        fila.after(tr);
    }

    $("cuerpoHistorial").addEventListener("click", (e) => {
        const b = e.target.closest("[data-dia]");
        if (b) mostrarDia(b.dataset.dia);
    });
    $("hsRango").addEventListener("change", () => { firmaHistorial = ""; abiertos.clear(); cargarHistorial(); });

    $("btnCsv").addEventListener("click", async () => {
        const btn = $("btnCsv");
        btn.disabled = true;
        try {
            const resp = await fetch(`/api/reportes/pedidos.csv?dias=${$("hsRango").value}`, { headers: { Authorization: "Bearer " + LUR.token() } });
            if (!resp.ok) throw new Error();
            const nombre = (resp.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/);
            const url = URL.createObjectURL(await resp.blob());
            const a = document.createElement("a");
            a.href = url; a.download = nombre ? nombre[1] : "pedidos.csv";
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            LUR.toast("CSV descargado ✓");
        } catch (e) { LUR.toast("No se pudo descargar el CSV", "error"); }
        btn.disabled = false;
    });

    async function cargarOpiniones() {
        const r = await LUR.http("GET", "/api/opiniones/admin");
        if (!r.ok) return;
        pintar($("listaOpiniones"), JSON.stringify(r.data), () => r.data.length ? r.data.map(o => `
            <article class="opinion-adm ${o.oculta ? "oculta" : ""}">
                <div class="op-cab"><strong>${esc(o.nombre)}</strong> <span class="estrellas fija">${"★".repeat(o.estrellas)}${"☆".repeat(5 - o.estrellas)}</span>
                    <small>#${o.id} · ${LUR.hace(o.creado)}</small></div>
                <p>${o.comentario ? `“${esc(o.comentario)}”` : `<em>Sin comentario (solo estrellas)</em>`}</p>
                <button class="btn btn-chico ${o.oculta ? "" : "btn-claro"}" type="button" data-opinion="${o.id}" data-oculta="${o.oculta ? 0 : 1}">${o.oculta ? "Mostrar de nuevo" : "Ocultar"}</button>
            </article>`).join("") : `<p class="sin-datos">Aún no hay opiniones.</p>`);
    }
    $("listaOpiniones").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-opinion]");
        if (!b) return;
        const r = await LUR.http("PATCH", `/api/pedidos/${b.dataset.opinion}/opinion`, { oculta: b.dataset.oculta === "1" });
        LUR.toast(r.ok ? (b.dataset.oculta === "1" ? "Opinión oculta en la tienda" : "Opinión visible otra vez") : r.error, r.ok ? "ok" : "error");
        if (r.ok) cargarOpiniones();
    });

    async function cargarCorreos() {
        const r = await LUR.http("GET", "/api/correos");
        if (!r.ok) return;
        $("correoModo").innerHTML = r.data.modo === "smtp"
            ? "✅ Envío real activo (SMTP). Por privacidad no se guardan copias del contenido."
            : "🧪 <strong>Modo simulación</strong>: los correos no salen a internet; se guardan aquí para que puedas verlos. Para envío real configura las variables <code>SMTP_HOST</code>, <code>SMTP_USER</code> y <code>SMTP_PASS</code>.";
        const ESTADOS = { simulado: ["Simulado", "chip-azul"], enviado: ["Enviado", "chip-verde"], error: ["Error", "chip-rojo"] };
        pintar($("cuerpoCorreos"), JSON.stringify(r.data.correos), () => r.data.correos.length ? r.data.correos.map(c => `
            <tr><td>${LUR.hora(c.ts)}</td><td>${esc(c.para)}</td><td>${esc(c.asunto)}</td>
            <td><span class="chip ${ESTADOS[c.estado][1]}">${ESTADOS[c.estado][0]}</span></td>
            <td class="acciones">${c.tieneVista ? `<button class="btn btn-chico btn-claro" type="button" data-correo="${c.id}">Ver correo</button>` : ""}</td></tr>`).join("")
            : `<tr><td colspan="5" class="sin-datos">Todavía no se envió ningún correo.</td></tr>`);
    }
    $("cuerpoCorreos").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-correo]");
        if (!b) return;
        const r = await LUR.http("GET", `/api/correos/${b.dataset.correo}`);
        if (!r.ok) return LUR.toast(r.error, "error");
        $("correoAsunto").textContent = r.data.asunto;
        $("correoFrame").srcdoc = r.data.html;
        $("modalCorreo").classList.remove("oculto");
    });
    const cerrarCorreo = () => $("modalCorreo").classList.add("oculto");
    $("cerrarCorreo").addEventListener("click", cerrarCorreo);
    $("modalCorreo").addEventListener("click", (e) => { if (e.target === $("modalCorreo")) cerrarCorreo(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarCorreo(); });

    const estrellasTxt = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
    const ESTADO_REP = { disponible: ["Disponible", "chip-verde"], en_reparto: ["En reparto", "chip-naranja"], inhabilitado: ["Inhabilitado", "chip-gris"] };

    async function cargarRepartidores() {
        const fecha = $("rpFecha").value;
        const r = await LUR.http("GET", "/api/reportes/repartidores" + (fecha ? `?fecha=${fecha}` : ""));
        if (!r.ok) return LUR.toast(r.error, "error");
        if (!fecha) $("rpFecha").value = r.data.hoy;
        $("rpFecha").max = r.data.hoy;
        pintar($("listaRepartidores"), JSON.stringify(r.data), () => r.data.repartidores.length ? r.data.repartidores.map(x => {
            const [et, cl] = ESTADO_REP[x.estado];
            const nota = (p, n) => n ? `<strong>${p.toFixed(1)}</strong> <span class="estrellas-mini">${estrellasTxt(p)}</span> <small>(${n})</small>` : `<small>Sin calificaciones</small>`;
            return `
            <article class="rep-card ${x.activo ? "" : "rep-inhab"}">
                <header class="rep-cab">
                    <div class="rep-avatar">🛵</div>
                    <div class="rep-id"><strong>${esc(x.nombre)}</strong><small>${esc(x.usuario)} · DNI ${esc(x.dni || "—")}${x.telefono ? " · " + esc(x.telefono) : ""}</small></div>
                    <span class="chip ${cl}">${et}${x.pedidoActivo ? ` · #${x.pedidoActivo}` : ""}</span>
                </header>
                ${x.activo ? "" : `<p class="rep-aviso">🚫 Inhabilitado el <strong>${fechaHora(x.inhabilitadoEn)}</strong>. ${esc(x.motivo || "")} <em>No puede volver a trabajar.</em></p>`}
                <div class="rep-kpis">
                    <div><span>Pedidos del día</span><strong>${x.dia.pedidos}</strong></div>
                    <div><span>Entregados</span><strong>${x.dia.entregados}</strong></div>
                    <div><span>Cobrado</span><strong>${fmt(x.dia.cobrado)}</strong></div>
                    <div><span>Entregas totales</span><strong>${x.total.entregas}</strong></div>
                </div>
                <div class="rep-notas">
                    <div><span>Calificación del día</span>${nota(x.dia.promedio, x.dia.calificaciones)}</div>
                    <div><span>Calificación general</span>${nota(x.total.promedio, x.total.calificaciones)}</div>
                    <div><span>Reportes de entrega (mal estado / incompleto)</span>${x.total.incidencias ? `<strong class="rep-incid">⚠️ ${x.total.incidencias}</strong>` : `<small>Ninguno</small>`}</div>
                </div>
                <details ${x.pedidos.length && x.pedidos.length <= 6 ? "open" : ""}>
                    <summary>Pedidos del día (${x.pedidos.length})</summary>
                    ${x.pedidos.length ? `<div class="tabla-scroll"><table class="tabla tabla-interna"><thead><tr><th>Pedido</th><th>Hora</th><th>Cliente</th><th>Distrito</th><th>Estado</th><th>Total</th><th>Nota</th><th>Etiquetas</th></tr></thead><tbody>
                        ${x.pedidos.map(p => `<tr><td><strong>#${p.id}</strong></td><td>${LUR.hora(p.creado)}</td><td>${esc(p.cliente)}</td><td>${esc(p.distrito)}</td>
                            <td><span class="chip ${ESTADO_CHIP[p.estado] || ""}">${esc(LUR.ESTADOS[p.estado].label)}</span></td><td>${fmt(p.total)}</td>
                            <td title="${esc(p.comentario || "")}">${p.estrellas ? `<span class="estrellas-mini">${"★".repeat(p.estrellas)}</span>` : "—"}</td><td>${etqChips(p.etiquetas) || "—"}</td></tr>`).join("")}
                        </tbody></table></div>` : `<p class="sin-datos">Sin pedidos asignados ese día.</p>`}
                </details>
                <details>
                    <summary>Últimas opiniones de clientes (${x.opiniones.length})</summary>
                    ${x.opiniones.length ? x.opiniones.map(o => `<div class="rep-opinion"><span class="estrellas-mini">${estrellasTxt(o.estrellas)}</span> <strong>${esc(o.cliente)}</strong> <small>#${o.id} · ${LUR.hace(o.ts)}</small>
                        ${etqChips(o.etiquetas)}
                        <p>${o.comentario ? `“${esc(o.comentario)}”` : "<em>Solo estrellas, sin comentario</em>"}</p></div>`).join("") : `<p class="sin-datos">Aún no tiene opiniones.</p>`}
                </details>
            </article>`;
        }).join("") : `<p class="sin-datos">No hay repartidores.</p>`);
    }
    $("rpFecha").addEventListener("change", cargarRepartidores);
    $("rpHoy").addEventListener("click", () => { $("rpFecha").value = ""; cargarRepartidores(); });

    let firmaTienda = "";
    function renderTienda() {
        const t = LUR.TIENDA_ESTADO || { abierta: true, mensaje: "" };
        const enCurso = LUR.getOrders().filter(o => !["entregado", "cancelado"].includes(o.estado)).length;
        const firma = [t.abierta, t.mensaje, enCurso].join("|");
        if (firma === firmaTienda) return;
        firmaTienda = firma;
        $("tiendaBar").classList.toggle("cerrado", !t.abierta);
        $("tiendaTitulo").textContent = t.abierta ? "Negocio abierto" : "Negocio cerrado";
        $("tiendaSub").textContent = t.abierta ? "Recibiendo pedidos" : `No se reciben pedidos${enCurso ? ` · ${enCurso} en curso siguen su flujo` : ""}`;
        $("btnTienda").textContent = t.abierta ? "Cerrar negocio" : "Abrir negocio";
        $("btnTienda").classList.toggle("btn-verde", !t.abierta);
        $("tiendaMsg").readOnly = !t.abierta;
        if (!t.abierta) $("tiendaMsg").value = t.mensaje || "";
    }
    $("btnTienda").addEventListener("click", async () => {
        const abrir = !(LUR.TIENDA_ESTADO || { abierta: true }).abierta;
        const b = $("btnTienda"); b.disabled = true;
        const r = await LUR.cambiarTienda(abrir, abrir ? "" : $("tiendaMsg").value.trim());
        b.disabled = false;
        if (!r.ok) return LUR.toast(r.error, "error");
        if (abrir) $("tiendaMsg").value = "";
        LUR.toast(abrir ? "Negocio abierto: ya se reciben pedidos ✓" : "Negocio cerrado: no se reciben pedidos nuevos");
    });

    const hora12 = (h) => `${h % 12 || 12} ${h < 12 ? "a. m." : "p. m."}`;
    async function cargarDemanda() {
        const r = await LUR.http("GET", `/api/reportes/demanda?dias=${$("dmRango").value}`);
        if (!r.ok) return;
        const d = r.data;
        const pico = d.picos[0];
        $("dmResumen").innerHTML = [
            ["Unidades vendidas", d.unidades, "azul"], ["Pedidos", d.totalPedidos, "verde"],
            ["Hora pico", pico ? hora12(pico.hora) : "—", "amarillo"], ["Más vendido", d.productos[0] ? d.productos[0].nombre : "—", "rojo"]
        ].map(([t, v, c]) => `<div class="kpi-mini ${c}"><span>${t}</span><strong>${esc(String(v))}</strong></div>`).join("");

        const max = Math.max(1, ...d.productos.map(p => p.cantidad));
        $("dmProductos").innerHTML = d.productos.length ? d.productos.map((p, i) => `
            <li><div class="barra-fila"><span class="barra-nom"><b>${i + 1}.</b> ${esc(p.nombre)}</span>
                <span class="barra-val">${p.cantidad} uds. · ${p.porcentaje}%${p.cambio === null ? "" : ` <em class="${p.cambio >= 0 ? "sube" : "baja"}">${p.cambio >= 0 ? "▲" : "▼"} ${Math.abs(p.cambio)}%</em>`}</span></div>
                <div class="barra"><i style="width:${Math.max(4, p.cantidad / max * 100)}%"></i></div></li>`).join("")
            : `<p class="sin-datos">Todavía no hay ventas en este periodo.</p>`;

        const mh = Math.max(1, ...d.horas.map(h => h.pedidos));
        $("dmHoras").innerHTML = d.horas.map(h => `<div class="col-hora ${pico && h.hora === pico.hora ? "pico" : ""}" title="${hora12(h.hora)}: ${h.pedidos} pedidos">
            <i style="height:${h.pedidos ? Math.max(6, h.pedidos / mh * 100) : 2}%"></i><span>${h.hora % 3 === 0 ? h.hora : ""}</span></div>`).join("");
        $("dmPico").textContent = pico
            ? `Más pedidos entre las ${hora12(pico.hora)} y las ${hora12((pico.hora + 1) % 24)} (${pico.pedidos} pedidos).${d.picos.length > 1 ? " Le siguen las " + d.picos.slice(1).map(h => hora12(h.hora)).join(" y las ") + " " : " "}Ten cocina y repartidores listos antes de esa hora.`
            : "Todavía no hay pedidos en este periodo.";

        const ETQ = { critico: ["Reponer ya", "badge-bajo"], bajo: ["Se acaba pronto", "badge-bajo"], ok: ["OK", "badge-ok"] };
        $("dmInsumos").innerHTML = d.insumos.map(i => `<tr class="${i.estado === "ok" ? "" : "fila-bajo"}">
            <td>${esc(i.insumo)}</td><td><strong>${i.stock} ${esc(i.unidad)}</strong></td>
            <td>${i.consumoDia ? `${i.consumoDia} ${esc(i.unidad)}` : "—"}</td>
            <td>${i.diasRestantes === null ? "Sin consumo" : `<strong>${i.diasRestantes} días</strong>`}</td>
            <td><span class="badge-stock ${ETQ[i.estado][1]}">${ETQ[i.estado][0]}</span></td>
            <td class="acciones">${i.estado === "ok" ? "" : `<button class="btn btn-chico btn-claro" type="button" data-reponer-dm="${i.id}">Reponer</button>`}</td></tr>`).join("");
    }
    $("dmRango").addEventListener("change", cargarDemanda);
    $("dmInsumos").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-reponer-dm]");
        if (!b) return;
        const r = await LUR.reponerInsumo(b.dataset.reponerDm);
        LUR.toast(r.ok ? "Stock repuesto ✓" : r.error, r.ok ? "ok" : "error");
        if (r.ok) cargarDemanda();
    });

    let ultimaCargaReportes = 0;
    function recargarReportes(forzar) {
        if (!forzar && Date.now() - ultimaCargaReportes < 12000) return;
        ultimaCargaReportes = Date.now();
        cargarVentas(); cargarDemanda(); cargarHistorial(); cargarRepartidores(); cargarOpiniones(); cargarCorreos();
    }

    function render() {
        const orders = LUR.getOrders();
        renderKpis(orders);
        renderTienda();
        renderZona();
        renderAsignar(orders);
        renderAvisos();
        renderPedidos(orders);
        renderUsuarios();
        renderInventario();
        recargarReportes();
    }

    actualizarVistaUsuario();
    LUR.subscribe(render);
})();
