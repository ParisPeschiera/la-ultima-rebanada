(async function () {
    const sesion = LUR.Auth.require(["cocinero", "admin"]);
    if (!sesion) return;
    try { await LUR.init(); } catch (e) { return; }

    const $ = (id) => document.getElementById(id);
    const { esc, fmt } = LUR;

    $("nombreUsuario").textContent = `${LUR.ROLES[sesion.rol].icon} ${sesion.nombre || sesion.usuario}`;
    $("btnSalir").addEventListener("click", () => { LUR.Auth.logout(); location.href = "login.html"; });
    LUR.iniciarReloj();

    const SIGUIENTE = {
        cola:      { a: "cocinando", boton: "Empezar a cocinar 👨‍🍳" },
        cocinando: { a: "horno",     boton: "Enviar al horno 🔥" },
        horno:     { a: "listo",     boton: "Marcar como listo ✓" }
    };
    const ETIQUETA = {
        cola: ["En cola", "chip-azul"], cocinando: ["Cocinando", "chip-naranja"],
        horno: ["En horno", "chip-rojo"], listo: ["Listo", "chip-verde"]
    };
    const EN_COCINA = ["cola", "cocinando", "horno", "listo"];

    let filtro = "todos";
    let firmaAnterior = "";

    async function avanzar(id) {
        const o = LUR.getOrder(id);
        if (!o || !SIGUIENTE[o.estado]) return;
        const nuevo = SIGUIENTE[o.estado].a;
        const r = await LUR.cambiarEstado(id, nuevo);
        if (!r.ok) return LUR.toast(r.error, "error");
        LUR.toast(`Pedido #${id}: ${LUR.ESTADOS[nuevo].label}`);
    }

    async function entregarEnTienda(id) {
        const input = document.getElementById("cod-" + id);
        const r = await LUR.cambiarEstado(id, "entregado", { codigo: input.value.trim() });
        if (!r.ok) {
            input.classList.add("error");
            input.value = "";
            input.placeholder = "Incorrecto";
            return LUR.toast(r.error, "error");
        }
        LUR.toast(`Pedido #${id} entregado al cliente ✓`);
    }

    $("listaPedidos").addEventListener("click", (e) => {
        const av = e.target.closest("[data-avanzar]");
        const en = e.target.closest("[data-entregar]");
        if (av) avanzar(av.dataset.avanzar);
        if (en) entregarEnTienda(en.dataset.entregar);
    });

    $("filtros").addEventListener("click", (e) => {
        const b = e.target.closest("[data-filtro]");
        if (!b) return;
        filtro = b.dataset.filtro;
        document.querySelectorAll(".filtro").forEach(x => x.classList.toggle("activo", x === b));
        firmaAnterior = "";
        render();
    });

    function tarjeta(o) {
        const [txt, cls] = ETIQUETA[o.estado];
        const sig = SIGUIENTE[o.estado];
        const recojo = o.tipo === "recojo";

        let acciones = "";
        if (sig) {
            acciones = `<button class="btn btn-bloque" type="button" data-avanzar="${o.id}">${sig.boton}</button>`;
        } else if (o.estado === "listo" && recojo) {
            acciones = `<div class="fila">
                    <input type="text" id="cod-${o.id}" inputmode="numeric" maxlength="4" placeholder="Código" aria-label="Código del cliente">
                    <button class="btn btn-verde" type="button" data-entregar="${o.id}">Entregar</button>
                </div>
                <small>Pídele al cliente su código de 4 dígitos.</small>`;
        } else {
            acciones = `<div class="espera">⏳ Esperando que administración asigne repartidor</div>`;
        }

        return `
        <article class="pedido" data-estado="${o.estado}">
            <div class="pedido-cabecera">
                <div>
                    <div class="numero">#${o.id}</div>
                    <div class="pedido-meta"><span class="tiempo" data-creado="${o.creado}" data-eta="${o.eta}" data-listo="${o.estado === "listo" ? 1 : 0}"></span></div>
                </div>
                <div style="display:grid;gap:4px;justify-items:end">
                    <span class="chip ${cls}">${txt}</span>
                    <span class="chip ${recojo ? "chip-azul" : "chip-gris"}">${recojo ? "🏪 Recojo" : "🛵 Delivery"}</span>
                </div>
            </div>
            <ul class="pedido-items">
                ${o.items.map(i => `<li><span class="cant">${i.cant}</span><span>${esc(i.nombre)}${i.detalle ? `<small>${esc(i.detalle)}</small>` : ""}</span></li>`).join("")}
            </ul>
            ${o.notas ? `<div class="pedido-nota">📝 <strong>Nota:</strong> ${esc(o.notas)}</div>` : ""}
            <div class="pedido-acciones">${acciones}</div>
        </article>`;
    }

    function actualizarTiempos() {
        document.querySelectorAll(".tiempo").forEach(el => {
            const min = Math.floor((Date.now() - Number(el.dataset.creado)) / 60000);
            const tarde = el.dataset.listo !== "1" && Date.now() > Number(el.dataset.eta) - 12 * 60000;
            el.innerHTML = `${LUR.hora(Number(el.dataset.creado))} · hace ${min} min${tarde ? ` <span class="tarde">⚠ apurar</span>` : ""}`;
        });
    }

    function render() {
        const todos = LUR.getOrders()
            .filter(o => EN_COCINA.includes(o.estado))
            .sort((a, b) => a.creado - b.creado);

        const cuenta = (e) => todos.filter(o => o.estado === e).length;
        $("cantidadCola").textContent = cuenta("cola");
        $("cantidadCocinando").textContent = cuenta("cocinando");
        $("cantidadHorno").textContent = cuenta("horno");
        $("cantidadListos").textContent = cuenta("listo");

        const lista = filtro === "todos" ? todos : todos.filter(o => o.estado === filtro);

        const firma = filtro + "|" + lista.map(o => o.id + o.estado).join(",");
        if (firma !== firmaAnterior) {
            firmaAnterior = firma;
            $("listaPedidos").innerHTML = lista.length
                ? lista.map(tarjeta).join("")
                : `<div class="vacio"><span>🍕</span>No hay pedidos en esta vista. Cuando entre uno nuevo aparecerá aquí.</div>`;
        }
        actualizarTiempos();
    }

    LUR.subscribe(render);
    setInterval(actualizarTiempos, 30000);
})();
