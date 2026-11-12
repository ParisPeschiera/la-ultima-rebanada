(async () => {
try { await LUR.init(); } catch (e) { return; }

const $ = (id) => document.getElementById(id);
const { fmt, esc } = LUR;

const state = {
    modo: sessionStorage.getItem("lur_modo") || "delivery",
    distrito: sessionStorage.getItem("lur_distrito") || "",
    cart: JSON.parse(sessionStorage.getItem("lur_cart") || "[]"),
    cupon: sessionStorage.getItem("lur_cupon") || null,
    cat: "pizzas",
    trackId: null,
    estrellas: 0,
    estrellasRep: 0,
    pos: null
};

function persistir() {
    sessionStorage.setItem("lur_modo", state.modo);
    sessionStorage.setItem("lur_distrito", state.distrito);
    sessionStorage.setItem("lur_cart", JSON.stringify(state.cart));
    if (state.cupon) sessionStorage.setItem("lur_cupon", state.cupon);
    else sessionStorage.removeItem("lur_cupon");
}

const sesion = () => LUR.Auth.session();

function renderUsuario() {
    const s = sesion();
    let html;
    if (!s) {
        html = `<button class="btn btn-chico btn-claro" data-abrir-acceso type="button">Ingresar</button>`;
    } else {
        const rol = LUR.ROLES[s.rol];
        const panel = s.rol !== "cliente"
            ? `<a class="btn btn-chico btn-claro" href="${rol.home}">Ir a mi panel</a>` : "";
        html = `
            <span class="usuario-nombre">${rol.icon} ${esc(s.nombre || s.usuario)}</span>
            ${panel}
            <button class="btn btn-chico btn-claro" data-salir type="button">Salir</button>`;
    }
    $("usuarioMenu").innerHTML = html;
    $("navUsuario").innerHTML = html;
    document.querySelectorAll("[data-salir]").forEach(b =>
        b.addEventListener("click", () => { LUR.Auth.logout(); location.reload(); }));
}

document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-abrir-acceso]");
    if (!t) return;
    e.preventDefault();
    $("navPrincipal").classList.remove("abierto");
    abrirAcceso("", "login", false);
});

$("btnMenu").addEventListener("click", () => {
    const nav = $("navPrincipal");
    const abierto = nav.classList.toggle("abierto");
    $("btnMenu").setAttribute("aria-expanded", abierto);
});
$("navPrincipal").addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
        $("navPrincipal").classList.remove("abierto");
        $("btnMenu").setAttribute("aria-expanded", "false");
    }
});

const OTRO = "__otro";
const fueraDeZona = () => state.modo === "delivery" && state.distrito === OTRO;

function opcionesDistrito(select, valor) {
    select.innerHTML = `<option value="">Selecciona tu distrito</option>` +
        LUR.DISTRITOS.map(d => `<option ${d === valor ? "selected" : ""}>${esc(d)}</option>`).join("") +
        `<option value="${OTRO}" ${valor === OTRO ? "selected" : ""}>Otro distrito (se cotiza el recargo)</option>`;
}

function aplicarModo() {
    document.querySelectorAll(".servicio-card .modo-btn").forEach(b => {
        const on = b.dataset.modo === state.modo;
        b.classList.toggle("activo", on);
        b.setAttribute("aria-checked", on);
    });
    $("bloqueDistrito").classList.toggle("oculto", state.modo !== "delivery");
    $("bloqueRecojo").classList.toggle("oculto", state.modo !== "recojo");
    persistir();
    renderCarrito();
}

document.querySelectorAll(".servicio-card .modo-btn").forEach(b =>
    b.addEventListener("click", () => { state.modo = b.dataset.modo; aplicarModo(); }));

$("heroDistrito").addEventListener("change", (e) => { state.distrito = e.target.value; persistir(); renderCarrito(); });
$("ckDistrito").addEventListener("change", (e) => { state.distrito = e.target.value; persistir(); renderCarrito(); renderResumenCheckout(); });
$("ckDistritoOtro").addEventListener("input", () => { $("ckError").textContent = ""; });

function renderCategorias() {
    $("categoriasBarra").innerHTML = LUR.CATEGORIAS.map(c => `
        <button type="button" role="tab" class="cat-btn ${c.id === state.cat ? "activo" : ""}"
                aria-selected="${c.id === state.cat}" data-cat="${c.id}">
            <span aria-hidden="true">${c.icon}</span> ${c.label}
        </button>`).join("");
}

const FOTO_PENDIENTE = `
    <div class="foto-pendiente" role="img" aria-label="Foto próximamente">
        <svg viewBox="0 0 64 64" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 14c16-8 36-8 52 0L32 58 6 14z"/><path d="M10 20c14-6 30-6 44 0"/>
            <circle cx="26" cy="28" r="3"/><circle cx="38" cy="30" r="3"/><circle cx="32" cy="42" r="3"/>
        </svg>
        <span>Foto próximamente</span>
    </div>`;

function renderProductos() {
    const lista = LUR.MENU.filter(p => p.cat === state.cat);
    $("productos").innerHTML = lista.map((p, i) => `
        <article class="producto" style="--i:${Math.min(i, 12)}">
            <div class="producto-img">
                ${p.img
                    ? `<img src="../img/${esc(p.img)}" alt="${esc(p.nombre)}" loading="lazy">`
                    : FOTO_PENDIENTE}
                ${p.badge ? `<span class="producto-badge">${esc(p.badge)}</span>` : ""}
            </div>
            <div class="producto-info">
                <h3>${esc(p.nombre)}</h3>
                <p>${esc(p.desc)}</p>
                <div class="producto-bottom">
                    <strong>${p.custom ? "Desde " : ""}${fmt(p.precio)}</strong>
                    ${p.custom
                        ? `<button class="btn btn-chico" type="button" data-personalizar="${p.id}">Personalizar</button>`
                        : `<button class="btn btn-chico" type="button" data-agregar="${p.id}">Agregar</button>`}
                </div>
            </div>
        </article>`).join("");
}

$("productos").addEventListener("error", (e) => {
    if (e.target.tagName !== "IMG") return;
    e.target.insertAdjacentHTML("afterend", FOTO_PENDIENTE);
    e.target.remove();
}, true);

$("categoriasBarra").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    state.cat = b.dataset.cat;
    renderCategorias();
    renderProductos();
});

$("productos").addEventListener("click", (e) => {
    const pers = e.target.closest("[data-personalizar]");
    const add = e.target.closest("[data-agregar]");
    if (pers) abrirPersonalizar(pers.dataset.personalizar);
    if (add) {
        const p = LUR.MENU.find(m => m.id === add.dataset.agregar);
        agregarItem({ id: p.id, cat: p.cat, nombre: p.nombre, detalle: "", precio: p.precio, cant: 1 });
    }
});

function abrirModal(id) {
    const m = $(id);
    m.classList.add("abierto");
    m.setAttribute("aria-hidden", "false");
    $("overlay").classList.add("activo");
    document.body.classList.add("sin-scroll");
}
function cerrarModal(id) {
    const m = $(id);
    m.classList.remove("abierto");
    m.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.abierto") && !$("carrito").classList.contains("abierto")) {
        $("overlay").classList.remove("activo");
        document.body.classList.remove("sin-scroll");
    }
}
function abrirCarrito() {
    $("carrito").classList.add("abierto");
    $("carrito").setAttribute("aria-hidden", "false");
    $("overlay").classList.add("activo");
    document.body.classList.add("sin-scroll");
}
function cerrarCarrito() {
    $("carrito").classList.remove("abierto");
    $("carrito").setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.abierto")) {
        $("overlay").classList.remove("activo");
        document.body.classList.remove("sin-scroll");
    }
}
function cerrarTodo() {
    document.querySelectorAll(".modal.abierto").forEach(m => cerrarModal(m.id));
    cerrarCarrito();
}

$("btnCarrito").addEventListener("click", abrirCarrito);
$("btnCerrarCarrito").addEventListener("click", cerrarCarrito);
$("overlay").addEventListener("click", cerrarTodo);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarTodo(); });
document.querySelectorAll("[data-cerrar]").forEach(b =>
    b.addEventListener("click", () => cerrarModal(b.dataset.cerrar)));

let pers = null;

function abrirPersonalizar(id) {
    pers = LUR.MENU.find(m => m.id === id);
    $("modalTitulo").textContent = `Personalizar ${pers.nombre}`;

    const radio = (name, lista, checkedIdx = 0) => lista.map((o, i) => `
        <label class="opcion">
            <input type="radio" name="${name}" value="${esc(o.id)}" data-extra="${o.extra}" ${i === checkedIdx ? "checked" : ""}>
            <span>${esc(o.id)}</span><em>${o.extra ? "+" + fmt(o.extra) : "Incluido"}</em>
        </label>`).join("");

    $("modalPersBody").innerHTML = `
        <h4>Tamaño</h4>
        <div class="opciones">${radio("tamano", LUR.TAMANOS)}</div>
        <h4>Masa</h4>
        <div class="opciones">${radio("masa", LUR.MASAS)}</div>
        <h4>Toppings adicionales</h4>
        <div class="opciones">
            ${LUR.TOPPINGS.map(t => `
                <label class="opcion">
                    <input type="checkbox" value="${esc(t.id)}" data-extra="${t.extra}">
                    <span>${t.icon} ${esc(t.id)}</span><em>+${fmt(t.extra)}</em>
                </label>`).join("")}
        </div>`;
    totalPers();
    abrirModal("modalPersonalizar");
}

function leerPers() {
    const body = $("modalPersBody");
    const tam = body.querySelector('input[name="tamano"]:checked');
    const masa = body.querySelector('input[name="masa"]:checked');
    const tops = [...body.querySelectorAll('input[type="checkbox"]:checked')];
    const extra = [tam, masa, ...tops].reduce((s, i) => s + parseFloat(i.dataset.extra), 0);
    return {
        precio: pers.precio + extra,
        detalle: [tam.value, masa.value, ...tops.map(t => t.value)].join(", "),
        opts: { tamano: tam.value, masa: masa.value, toppings: tops.map(t => t.value) }
    };
}
function totalPers() { $("modalTotal").textContent = fmt(leerPers().precio); }

$("modalPersBody").addEventListener("change", totalPers);
$("btnAgregarPers").addEventListener("click", () => {
    const { precio, detalle, opts } = leerPers();
    agregarItem({ id: pers.id, cat: pers.cat, nombre: pers.nombre, detalle, precio, cant: 1, opts });
    cerrarModal("modalPersonalizar");
});

function agregarItem(item) {
    const key = item.id + "|" + item.detalle;
    const ex = state.cart.find(i => i.key === key);
    if (ex) ex.cant += 1;
    else state.cart.push({ ...item, key });
    persistir();
    renderCarrito();
    LUR.toast(`${item.nombre} agregado al carrito`);
}

function calcTotales() {
    const subtotal = state.cart.reduce((s, i) => s + i.precio * i.cant, 0);
    const c = state.cupon ? LUR.CUPONES[state.cupon] : null;
    const cuponActivo = !!c && subtotal >= c.min && subtotal > 0;

    let descuento = 0, envioGratis = false;
    if (cuponActivo) {
        if (c.tipo === "pct") descuento = subtotal * c.valor / 100;
        else if (c.tipo === "monto") descuento = c.valor;
        else if (c.tipo === "envio") envioGratis = true;
    }
    descuento = Math.min(descuento, subtotal);

    let envio = 0;
    if (state.modo === "delivery" && subtotal > 0) {
        envio = (subtotal >= LUR.ENVIO.gratisDesde || envioGratis) ? 0 : LUR.ENVIO.costo;
    }
    const total = Math.round((subtotal - descuento + envio) * 100) / 100;
    return { subtotal, descuento, envio, total, cuponActivo };
}

function renderCarrito() {
    const cant = state.cart.reduce((s, i) => s + i.cant, 0);
    $("cantidad").textContent = cant;
    $("cantidad").classList.toggle("oculto", cant === 0);

    $("carritoServicio").innerHTML = state.modo === "recojo"
        ? `🏪 <strong>Recojo en tienda</strong> · sin costo de envío`
        : state.distrito === OTRO
            ? `🛵 <strong>Delivery fuera de zona</strong> · la tienda cotiza el envío`
            : `🛵 <strong>Delivery</strong>${state.distrito ? ` a ${esc(state.distrito)}` : ""} · ~${LUR.ENVIO.minutosDelivery} min`;

    const lista = $("productosCarrito");
    if (!state.cart.length) {
        lista.innerHTML = `<p class="carrito-vacio">Tu carrito está vacío.<br><a href="#menu" id="irCarta">Ver la carta</a></p>`;
    } else {
        lista.innerHTML = state.cart.map(i => `
            <div class="carrito-item">
                <div class="ci-info">
                    <strong>${esc(i.nombre)}</strong>
                    ${i.detalle ? `<small>${esc(i.detalle)}</small>` : ""}
                    <span>${fmt(i.precio)} c/u</span>
                </div>
                <div class="ci-cant" role="group" aria-label="Cantidad de ${esc(i.nombre)}">
                    <button type="button" data-accion="menos" data-key="${esc(i.key)}" aria-label="Quitar uno">−</button>
                    <span>${i.cant}</span>
                    <button type="button" data-accion="mas" data-key="${esc(i.key)}" aria-label="Agregar uno">+</button>
                </div>
                <strong class="ci-total">${fmt(i.precio * i.cant)}</strong>
            </div>`).join("");
    }

    const t = calcTotales();
    $("totales").innerHTML = `
        <div><dt>Subtotal</dt><dd>${fmt(t.subtotal)}</dd></div>
        ${t.descuento ? `<div class="desc"><dt>Descuento (${esc(state.cupon)})</dt><dd>− ${fmt(t.descuento)}</dd></div>` : ""}
        <div><dt>Envío</dt><dd>${state.modo === "recojo" ? "Gratis" : (t.envio ? fmt(t.envio) : (t.subtotal ? "Gratis" : "—"))}</dd></div>
        <div class="total-final"><dt>Total</dt><dd>${fmt(t.total)}</dd></div>
        ${state.modo === "delivery" && t.subtotal && t.subtotal < LUR.ENVIO.gratisDesde && !t.cuponActivo
            ? `<p class="nota-envio">Agrega ${fmt(LUR.ENVIO.gratisDesde - t.subtotal)} más y el envío es gratis.</p>` : ""}`;

    if (state.cupon && !t.cuponActivo && t.subtotal > 0) {
        const c = LUR.CUPONES[state.cupon];
        $("cuponMsg").textContent = `El cupón ${state.cupon} requiere un mínimo de ${fmt(c.min)}.`;
        $("cuponMsg").className = "cupon-msg error";
    } else if (t.cuponActivo) {
        $("cuponMsg").textContent = `✓ ${LUR.CUPONES[state.cupon].texto}`;
        $("cuponMsg").className = "cupon-msg ok";
    } else {
        $("cuponMsg").textContent = "";
    }
    $("btnContinuar").disabled = state.cart.length === 0;
}

$("productosCarrito").addEventListener("click", (e) => {
    if (e.target.id === "irCarta") { cerrarCarrito(); return; }
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    const it = state.cart.find(i => i.key === b.dataset.key);
    if (!it) return;
    it.cant += b.dataset.accion === "mas" ? 1 : -1;
    if (it.cant <= 0) state.cart = state.cart.filter(i => i !== it);
    persistir();
    renderCarrito();
});

$("formCupon").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = $("inputCupon").value.trim().toUpperCase();
    if (!code) return;
    const c = LUR.CUPONES[code];
    const { subtotal } = calcTotales();
    if (!c) {
        $("cuponMsg").textContent = "Ese cupón no existe o ya venció.";
        $("cuponMsg").className = "cupon-msg error";
        return;
    }
    state.cupon = code;
    persistir();
    $("inputCupon").value = "";
    renderCarrito();
    if (subtotal < c.min) LUR.toast(`Cupón guardado: requiere mínimo ${fmt(c.min)}`);
});

document.querySelectorAll("[data-copiar]").forEach(el => el.addEventListener("click", () => {
    state.cupon = el.dataset.copiar;
    persistir();
    renderCarrito();
    LUR.toast(`Cupón ${state.cupon} guardado. Se aplicará en tu carrito.`);
}));

function renderPagos() {
    $("ckPagos").innerHTML = LUR.PAGOS.map((p, i) => `
        <label class="opcion">
            <input type="radio" name="pago" value="${p.id}" ${i === 0 ? "checked" : ""}>
            <span>${p.icon} ${p.label}</span>
        </label>`).join("");
}
$("ckPagos").addEventListener("change", () => {
    const pago = document.querySelector('input[name="pago"]:checked').value;
    $("ckPagaConBox").classList.toggle("oculto", pago !== "efectivo");
});

function aplicarModoCheckout() {
    document.querySelectorAll("[data-modo-checkout]").forEach(b => {
        const on = b.dataset.modoCheckout === state.modo;
        b.classList.toggle("activo", on);
        b.setAttribute("aria-checked", on);
    });
    $("ckDelivery").classList.toggle("oculto", state.modo !== "delivery");
    renderResumenCheckout();
}
document.querySelectorAll("[data-modo-checkout]").forEach(b =>
    b.addEventListener("click", () => { state.modo = b.dataset.modoCheckout; persistir(); aplicarModo(); aplicarModoCheckout(); }));

function renderResumenCheckout() {
    const t = calcTotales();
    $("ckResumen").innerHTML = `
        <h4>Resumen</h4>
        <ul>${state.cart.map(i => `<li><span>${i.cant} × ${esc(i.nombre)}${i.detalle ? ` <small>(${esc(i.detalle)})</small>` : ""}</span><span>${fmt(i.precio * i.cant)}</span></li>`).join("")}</ul>
        <div class="ck-lineas">
            <div><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
            ${t.descuento ? `<div><span>Descuento</span><span>− ${fmt(t.descuento)}</span></div>` : ""}
            <div><span>Envío</span><span>${t.envio ? fmt(t.envio) : "Gratis"}</span></div>
            ${fueraDeZona() ? `<div class="linea-zona"><span>Recargo por zona</span><span>Lo confirma la tienda</span></div>` : ""}
        </div>`;
    $("ckTotal").textContent = fmt(t.total);
    $("ckTotalEtiqueta").textContent = fueraDeZona() ? "Total sin recargo" : "Total";
    $("btnCkEnviar").textContent = fueraDeZona() ? "Enviar a evaluación" : "Confirmar pedido";
    $("ckOtroBloque").classList.toggle("oculto", !fueraDeZona());
}

function abrirCheckout() {
    const s = sesion();
    const ultimo = JSON.parse(localStorage.getItem("lur_ultimo_envio") || "{}");

    $("ckNombre").value = (s && s.nombre) || ultimo.nombre || "";
    $("ckTelefono").value = (s && s.telefono) || ultimo.telefono || "";
    $("ckDireccion").value = ultimo.direccion || "";
    $("ckReferencia").value = ultimo.referencia || "";
    opcionesDistrito($("ckDistrito"), state.distrito || ultimo.distrito || "");
    if ($("ckDistrito").value) state.distrito = $("ckDistrito").value;
    $("ckDistritoOtro").value = ultimo.otro || "";
    $("listaDistritosExtra").innerHTML = LUR.DISTRITOS_EXTRA.map(d => `<option value="${esc(d)}"></option>`).join("");
    $("ckNotas").value = "";
    $("ckPagaCon").value = "";
    $("ckError").textContent = "";
    renderPagos();
    $("ckPagaConBox").classList.remove("oculto");
    aplicarModoCheckout();

    $("ckCorreo").innerHTML = s && s.email
        ? `📧 Te enviaremos el comprobante a <strong>${esc(s.email)}</strong>`
        : `⚠️ Tu cuenta no tiene correo registrado, así que no recibirás comprobante por email.`;

    cerrarCarrito();
    abrirModal("modalCheckout");
}

$("btnContinuar").addEventListener("click", () => {
    if (!state.cart.length) return;
    if (LUR.TIENDA_ESTADO && !LUR.TIENDA_ESTADO.abierta) { LUR.toast("Estamos cerrados por ahora: no recibimos pedidos.", "error"); return; }
    const s = sesion();
    if (!s) {
        abrirAcceso("Para finalizar tu pedido necesitas una cuenta. Crearla toma menos de un minuto y tu carrito se conserva.", "registro", true);
        return;
    }
    if (s.rol !== "cliente") { LUR.toast("Las cuentas de personal no pueden realizar compras.", "error"); return; }
    abrirCheckout();
});

let continuarCheckout = false;

function cambiarTabAcceso(tab) {
    const esLogin = tab === "login";
    $("formAccesoLogin").classList.toggle("oculto", !esLogin);
    $("formAccesoRegistro").classList.toggle("oculto", esLogin);
    document.querySelectorAll("[data-acceso-tab]").forEach(b => b.classList.toggle("activo", b.dataset.accesoTab === tab));
    $("accesoTitulo").textContent = esLogin ? "Inicia sesión" : "Crea tu cuenta";
    $("accesoError").textContent = "";
}

function abrirAcceso(aviso, tab, irACheckout) {
    continuarCheckout = !!irACheckout;
    $("accesoAviso").textContent = aviso || "";
    $("accesoAviso").classList.toggle("oculto", !aviso);
    cambiarTabAcceso(tab || "login");
    cerrarCarrito();
    abrirModal("modalAcceso");
}

document.querySelectorAll("[data-acceso-tab]").forEach(b =>
    b.addEventListener("click", () => cambiarTabAcceso(b.dataset.accesoTab)));

$("arNombre").addEventListener("input", () => {
    const limpio = $("arNombre").value.trim().toLowerCase().replace(/\s+/g, "");
    $("arVista").textContent = "U-" + (limpio || "…");
});

async function accesoExitoso(mensaje) {
    cerrarModal("modalAcceso");
    renderUsuario();
    await LUR.refrescar();
    renderTracker(); renderMisPedidos();
    LUR.toast(mensaje);
    if (continuarCheckout && state.cart.length) { continuarCheckout = false; abrirCheckout(); }
}

$("formAccesoLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const r = await LUR.Auth.login($("acUsuario").value, $("acPassword").value);
    btn.disabled = false;
    if (!r.ok) { $("accesoError").textContent = r.error; return; }
    if (r.usuario.rol !== "cliente") { location.href = LUR.Auth.home(r.usuario.rol); return; }
    $("acPassword").value = "";
    await accesoExitoso(`¡Hola, ${r.usuario.nombre}!`);
});

$("formAccesoRegistro").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const r = await LUR.Auth.registrar({
        nombre: $("arNombre").value, email: $("arEmail").value.trim(),
        telefono: $("arTelefono").value.trim(), password: $("arPassword").value
    });
    btn.disabled = false;
    if (!r.ok) { $("accesoError").textContent = r.error; return; }
    $("arPassword").value = "";
    await accesoExitoso(`¡Cuenta creada! Te enviamos un correo de bienvenida a ${r.usuario.email}`);
});

$("formCheckout").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = (m) => { $("ckError").textContent = m; };

    const nombre = $("ckNombre").value.trim();
    const telefono = $("ckTelefono").value.trim();
    const delivery = state.modo === "delivery";
    const direccion = $("ckDireccion").value.trim();
    const distrito = $("ckDistrito").value;

    if (!nombre) return err("Escribe tu nombre.");
    if (telefono.replace(/\D/g, "").length < 7) return err("Escribe un celular válido para que el repartidor pueda contactarte.");
    if (delivery && !direccion) return err("Escribe la dirección de entrega.");
    if (delivery && !distrito) return err("Selecciona tu distrito.");
    const otro = $("ckDistritoOtro").value.trim();
    const aEvaluacion = delivery && distrito === OTRO;
    if (aEvaluacion && otro.length < 2) return err("Escribe el nombre de tu distrito.");

    const t = calcTotales();
    const pagoSel = document.querySelector('input[name="pago"]:checked').value;
    const pagaCon = parseFloat($("ckPagaCon").value);
    const btn = $("formCheckout").querySelector('button[type="submit"]');
    btn.disabled = true;

    const crear = aEvaluacion ? LUR.crearSolicitudZona : LUR.crearPedido;
    const r = await crear({
        tipo: state.modo,
        cliente: { nombre, telefono },
        direccion: delivery ? direccion : "",
        distrito: delivery ? (aEvaluacion ? otro : distrito) : "",
        referencia: delivery ? $("ckReferencia").value.trim() : "",
        lat: delivery && state.pos ? state.pos.lat : undefined,
        lng: delivery && state.pos ? state.pos.lng : undefined,
        items: state.cart.map(i => ({ id: i.id, cant: i.cant, opts: i.opts })),
        cupon: t.cuponActivo ? state.cupon : null,
        pago: pagoSel,
        pagaCon: pagoSel === "efectivo" && pagaCon > 0 ? pagaCon : undefined,
        notas: $("ckNotas").value.trim()
    });
    btn.disabled = false;
    if (!r.ok) {
        if (r.status === 401) {
            cerrarModal("modalCheckout");
            renderUsuario();
            abrirAcceso("Tu sesión venció. Ingresa de nuevo para finalizar tu pedido.", "login", true);
            return;
        }
        return err(r.error);
    }

    localStorage.setItem("lur_ultimo_envio", JSON.stringify({ nombre, telefono, direccion, distrito: aEvaluacion ? "" : distrito, otro: aEvaluacion ? otro : "", referencia: $("ckReferencia").value.trim() }));

    state.cart = [];
    state.cupon = null;
    state.pos = null;
    if (delivery) state.distrito = aEvaluacion ? "" : distrito;
    persistir();
    renderCarrito();
    cerrarModal("modalCheckout");

    if (aEvaluacion) {
        renderSolicitudes();
        document.getElementById("pedido").scrollIntoView({ behavior: "smooth" });
        LUR.toast(`Solicitud enviada. La tienda evalúa el envío a ${otro} y te responde aquí.`, "aviso");
        return;
    }

    await seleccionarPedido(r.data.id);
    document.getElementById("pedido").scrollIntoView({ behavior: "smooth" });
    const correoCliente = (sesion() || {}).email;
    LUR.toast(correoCliente ? `¡Pedido #${r.data.id} confirmado! Te enviamos el comprobante a ${correoCliente}` : `¡Pedido #${r.data.id} confirmado!`);
});

function pedirUbicacion() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Tu navegador no permite ubicación."));
        navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => reject(new Error("No pudimos obtener tu ubicación. Revisa el permiso del navegador.")),
            { enableHighAccuracy: true, timeout: 10000 });
    });
}

$("btnUbicacion").addEventListener("click", async () => {
    const st = $("ubicacionEstado");
    st.className = ""; st.textContent = "Buscando tu ubicación…";
    try {
        const pos = await pedirUbicacion();
        const km = LUR.Mapa.distanciaKm(LUR.TIENDA, pos);
        if (km > LUR.RADIO_KM) {
            state.pos = pos;
            st.className = "error";
            st.textContent = `Estás a ${km.toFixed(1)} km del local, fuera de la zona habitual. Puedes enviar tu pedido a evaluación.`;
            $("ckDistrito").value = OTRO; state.distrito = OTRO; persistir(); renderCarrito(); renderResumenCheckout();
        } else {
            state.pos = pos;
            st.className = "ok";
            st.textContent = `✓ Ubicación detectada (a ${km.toFixed(1)} km del local)`;
        }
    } catch (e) { st.className = "error"; st.textContent = e.message; }
});

const solDescartadas = new Set(JSON.parse(localStorage.getItem("lur_sol_descartadas") || "[]"));
const solEstadoPrevio = new Map();

function renderSolicitudes() {
    const cont = $("solicitudesZona");
    const lista = (sesion() ? LUR.getSolicitudes() : []).filter(s =>
        s.estado === "pendiente" || s.estado === "cotizada" || (s.estado === "rechazada" && !solDescartadas.has(String(s.id))));
    cont.innerHTML = lista.map(s => {
        const cab = `<header><span class="sol-sello">Solicitud #${s.id}</span><h3>Delivery a ${esc(s.distrito)}</h3><small>${esc(s.direccion)}</small></header>`;
        const prods = `<p class="sol-prod">${s.items.map(i => `${i.cant} × ${esc(i.nombre)}`).join(" · ")}</p>`;
        if (s.estado === "pendiente") return `<article class="solicitud pendiente" data-id="${s.id}">${cab}${prods}
            <p class="sol-msg"><span class="sol-pulso" aria-hidden="true"></span>La tienda está revisando la distancia. Te responderemos aquí con el precio final; no se cocina nada hasta que aceptes.</p>
            <div class="sol-acciones"><button type="button" class="btn btn-chico btn-claro" data-sol-cancelar="${s.id}">Cancelar solicitud</button></div></article>`;
        if (s.estado === "cotizada") return `<article class="solicitud cotizada" data-id="${s.id}">${cab}${prods}
            <dl class="sol-precio">
                <div><dt>Subtotal</dt><dd>${fmt(s.subtotal)}</dd></div>
                ${s.descuento ? `<div><dt>Descuento</dt><dd>− ${fmt(s.descuento)}</dd></div>` : ""}
                <div><dt>Envío</dt><dd>${s.envio ? fmt(s.envio) : "Gratis"}</dd></div>
                <div class="sol-recargo"><dt>Recargo por zona${s.kmRuta ? ` (≈ ${s.kmRuta} km)` : ""}</dt><dd>${s.recargo ? fmt(s.recargo) : "Sin recargo"}</dd></div>
                <div class="sol-total"><dt>Total a pagar</dt><dd>${fmt(s.total)}</dd></div>
            </dl>
            ${s.notaAdmin ? `<p class="sol-nota">“${esc(s.notaAdmin)}”</p>` : ""}
            <div class="sol-acciones">
                <button type="button" class="btn btn-verde" data-sol-aceptar="${s.id}">Aceptar y hacer mi pedido</button>
                <button type="button" class="btn btn-chico btn-claro" data-sol-cancelar="${s.id}">No, cancelar</button>
            </div></article>`;
        return `<article class="solicitud rechazada" data-id="${s.id}">${cab}${prods}
            <p class="sol-msg"><strong>La tienda no pudo hacer este envío.</strong> ${esc(s.notaAdmin || "")}</p>
            <div class="sol-acciones"><button type="button" class="btn btn-chico btn-claro" data-sol-ok="${s.id}">Entendido</button></div></article>`;
    }).join("");
}

$("solicitudesZona").addEventListener("click", async (e) => {
    const bA = e.target.closest("[data-sol-aceptar]"), bC = e.target.closest("[data-sol-cancelar]"), bO = e.target.closest("[data-sol-ok]");
    if (bO) { solDescartadas.add(bO.dataset.solOk); localStorage.setItem("lur_sol_descartadas", JSON.stringify([...solDescartadas])); renderSolicitudes(); return; }
    if (bC) {
        if (!confirm("¿Cancelar esta solicitud?")) return;
        const r = await LUR.cancelarSolicitud(bC.dataset.solCancelar);
        LUR.toast(r.ok ? "Solicitud cancelada" : r.error, r.ok ? "ok" : "error");
        return;
    }
    if (bA) {
        bA.disabled = true;
        const r = await LUR.aceptarSolicitud(bA.dataset.solAceptar);
        if (!r.ok) { bA.disabled = false; LUR.toast(r.error, "error"); return; }
        await seleccionarPedido(r.data.id);
        const correoCliente = (sesion() || {}).email;
        LUR.toast(correoCliente ? `¡Pedido #${r.data.id} confirmado! Te enviamos el comprobante a ${correoCliente}` : `¡Pedido #${r.data.id} confirmado!`);
    }
});

function avisarRespuestasSolicitud() {
    for (const s of (sesion() ? LUR.getSolicitudes() : [])) {
        const antes = solEstadoPrevio.get(s.id);
        if (antes === "pendiente" && s.estado === "cotizada") {
            LUR.toast(`La tienda confirmó tu envío a ${s.distrito}: total ${fmt(s.total)}. Revísalo en “¿Dónde está mi pedido?”`, "aviso");
        } else if (antes === "pendiente" && s.estado === "rechazada") {
            LUR.toast(`La tienda no pudo hacer el envío a ${s.distrito}.`, "error");
        }
        solEstadoPrevio.set(s.id, s.estado);
    }
}

const ICONOS_PASOS = ["✓", "👨‍🍳", "🔥", "🛵", "🏠"];

function resetCalificaciones() {
    state.estrellas = 0;
    document.querySelectorAll("#estrellas button").forEach(b => b.classList.remove("activo"));
    $("calComentario").value = "";
}

async function seleccionarPedido(id) {
    const ok = await LUR.cargarSeguimiento(id);
    if (!ok) return false;
    const nuevo = String(id).replace(/\D/g, "");
    if (nuevo !== state.trackId) resetCalificaciones();
    state.trackId = nuevo;
    $("rastreoError").textContent = "";
    renderTracker();
    renderMisPedidos();
    return true;
}

$("formRastreo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = $("inputCodigoRastreo").value.replace(/\D/g, "");
    if (!codigo) { $("rastreoError").textContent = "Escribe el código de tu pedido."; return; }
    if (!(await seleccionarPedido(codigo))) {
        $("rastreoError").textContent = `No encontramos el pedido #${codigo}. Revisa el código e intenta de nuevo.`;
    }
});

function renderMisPedidos() {
    const mios = LUR.misPedidos().slice(0, 6);
    $("misPedidos").innerHTML = mios.length
        ? `<span class="mp-titulo">Mis pedidos:</span>` + mios.map(o => `
            <button type="button" class="mp-chip ${String(o.id) === state.trackId ? "activo" : ""}" data-track="${o.id}">
                #${o.id} · ${LUR.ESTADOS[o.estado].label}
            </button>`).join("")
        : "";
}
$("misPedidos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-track]");
    if (b) seleccionarPedido(b.dataset.track);
});

function renderTracker() {
    const o = state.trackId ? LUR.getOrder(state.trackId) : null;
    $("tracker").classList.toggle("oculto", !o);
    $("trackerVacio").classList.toggle("oculto", !!o);
    if (!o) return;

    const recojo = o.tipo === "recojo";
    const paso = LUR.pasoDe(o);
    const cancelado = o.estado === "cancelado";
    const entregado = o.estado === "entregado";

    $("trkTitulo").textContent = `Pedido #${o.id}`;
    $("trkSub").textContent = `${o.cliente.nombre} · ${recojo ? "Recojo en tienda" : "Delivery a " + o.distrito}`;
    if (cancelado) {
        $("trkEtaTitulo").textContent = "Estado";
        $("trkEta").textContent = "Cancelado";
        $("trkEtaMin").textContent = "";
    } else if (entregado) {
        const ult = o.historial[o.historial.length - 1];
        $("trkEtaTitulo").textContent = "Entregado a las";
        $("trkEta").textContent = LUR.hora(ult.ts);
        $("trkEtaMin").textContent = "";
    } else {
        $("trkEtaTitulo").textContent = recojo ? "Listo para recoger" : "Llegada estimada";
        $("trkEta").textContent = LUR.hora(o.eta);
        const m = LUR.minutosRestantes(o.eta);
        $("trkEtaMin").textContent = m > 0 ? `en ~${m} min` : "Unos minutos más…";
    }

    const nombres = recojo ? LUR.PASOS_RECOJO : LUR.PASOS_DELIVERY;
    const iconos = [...ICONOS_PASOS]; if (recojo) iconos[3] = "🏪";
    $("trkPasos").innerHTML = nombres.map((n, i) => {
        const num = i + 1;
        const cls = cancelado ? "" : (entregado || num < paso) ? "hecho" : (num === paso ? "actual" : "");
        return `<li class="${cls}"><div class="paso-icono" aria-hidden="true">${cls === "hecho" ? "✓" : iconos[i]}</div><span>${n}</span></li>`;
    }).join("");

    const msg = $("trkMensaje");
    const textoMsg = LUR.mensajeDe(o);
    if (msg.textContent !== textoMsg) {
        if (msg.textContent && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
            msg.classList.add("cambiando");
            setTimeout(() => { msg.textContent = textoMsg; msg.classList.remove("cambiando"); }, 170);
        } else msg.textContent = textoMsg;
    }
    msg.classList.toggle("cancelado", cancelado);

    $("trkMapa").classList.toggle("oculto", recojo);
    $("trkRecojo").classList.toggle("oculto", !recojo);
    if (!recojo) LUR.Mapa.mostrar($("trkMapa"), o);

    $("trkAvisoLogin").classList.toggle("oculto", !!sesion() || !!o.mio);

    const verRep = !recojo && o.repartidorNombre && ["asignado", "recogido", "camino", "entregado"].includes(o.estado);
    $("trkRepartidor").classList.toggle("oculto", !verRep);
    if (verRep) {
        $("trkRepartidor").innerHTML = `
            <div class="rep-avatar" aria-hidden="true">🛵</div>
            <div>
                <small>Tu repartidor</small>
                <strong>${esc(o.repartidorNombre)}</strong>
            </div>
            ${o.repartidorTelefono && o.estado !== "entregado" ? `<a class="btn btn-chico btn-claro" href="tel:${esc(o.repartidorTelefono.replace(/\s/g, ""))}">📞 Llamar</a>` : ""}`;
    }

    const verCodigo = !!o.codigo && !cancelado && !entregado;
    $("trkCodigoBox").classList.toggle("oculto", !verCodigo);
    if (verCodigo) $("trkCodigo").textContent = o.codigo;

    const pago = LUR.PAGOS.find(p => p.id === o.pago);
    $("trkResumen").innerHTML = `
        <h4>Tu pedido</h4>
        <ul>${o.items.map(i => `<li><span>${i.cant} × ${esc(i.nombre)}${i.detalle ? `<small>${esc(i.detalle)}</small>` : ""}</span><span>${fmt(i.precio * i.cant)}</span></li>`).join("")}</ul>
        <div class="ck-lineas">
            ${o.descuento ? `<div><span>Descuento</span><span>− ${fmt(o.descuento)}</span></div>` : ""}
            <div><span>Envío</span><span>${(o.envio - (o.recargoZona || 0)) > 0 ? fmt(o.envio - (o.recargoZona || 0)) : "Gratis"}</span></div>
            ${o.recargoZona ? `<div><span>Recargo por zona</span><span>${fmt(o.recargoZona)}</span></div>` : ""}
            <div class="total-final"><span>Total</span><span>${fmt(o.total)}</span></div>
        </div>
        <p class="resumen-meta">${pago ? pago.icon + " " + pago.label : ""}${recojo ? "" : (o.direccion ? `<br>📍 ${esc(o.direccion)}, ${esc(o.distrito)}` : "")}${o.notas ? `<br>📝 ${esc(o.notas)}` : ""}</p>`;

    $("trkHistorial").innerHTML = [...o.historial].reverse().map(h =>
        `<li><time>${LUR.hora(h.ts)}</time> ${esc(LUR.ESTADOS[h.estado].label)}</li>`).join("");

    $("btnCancelar").classList.toggle("oculto", !(o.mio && o.estado === "cola"));

    const puedeCalificar = entregado && !!o.mio;
    $("trkCalificar").classList.toggle("oculto", !puedeCalificar);
    $("calForm").classList.toggle("oculto", !!o.calificacion);
    $("calGracias").classList.toggle("oculto", !o.calificacion);
    if (puedeCalificar && o.calificacion) {
        $("calGracias").innerHTML = `<h4>¡Gracias por calificar tu pedido!</h4>
            <div class="estrellas fija" aria-label="${o.calificacion.estrellas} de 5">${"★".repeat(o.calificacion.estrellas)}${"☆".repeat(5 - o.calificacion.estrellas)}</div>
            ${o.calificacion.comentario ? `<p>“${esc(o.calificacion.comentario)}”</p>` : ""}`;
    }
    const hayRep = puedeCalificar && !recojo && !!o.repartidorNombre;
    $("calRepBloque").classList.toggle("oculto", !hayRep);
    if (hayRep) {
        $("repNombreCal").textContent = o.repartidorNombre;
        $("repForm").classList.toggle("oculto", !!o.calRepartidor);
        $("repGracias").classList.toggle("oculto", !o.calRepartidor);
        if (o.calRepartidor) {
            $("repGracias").innerHTML = `<h4>¡Gracias por calificar a ${esc(o.repartidorNombre)}!</h4>
                <div class="estrellas fija" aria-label="${o.calRepartidor.estrellas} de 5">${"★".repeat(o.calRepartidor.estrellas)}${"☆".repeat(5 - o.calRepartidor.estrellas)}</div>
                ${etiquetasHtml(o.calRepartidor.etiquetas)}
                ${o.calRepartidor.comentario ? `<p>“${esc(o.calRepartidor.comentario)}”</p>` : ""}`;
        }
    }
}

function etiquetasHtml(ids) {
    if (!ids || !ids.length) return "";
    return `<div class="cal-etq-lectura">${ids.map(id => {
        const e = LUR.ETIQUETAS_REPARTIDOR.find(x => x.id === id);
        return e ? `<span class="chip ${e.tipo === "positiva" ? "chip-verde" : "chip-rojo"}">${esc(e.label)}</span>` : "";
    }).join("")}</div>`;
}

$("btnCancelar").addEventListener("click", async () => {
    if (!confirm("¿Seguro que quieres cancelar tu pedido?")) return;
    const r = await LUR.cancelarMiPedido(state.trackId);
    LUR.toast(r.ok ? "Pedido cancelado" : r.error, r.ok ? "ok" : "error");
});

function crearEstrellas(idContenedor, alElegir) {
    const cont = $(idContenedor);
    cont.innerHTML = [1, 2, 3, 4, 5].map(n =>
        `<button type="button" role="radio" aria-label="${n} estrellas" data-n="${n}">★</button>`).join("");
    cont.addEventListener("click", (e) => {
        const b = e.target.closest("[data-n]");
        if (!b) return;
        const n = Number(b.dataset.n);
        alElegir(n);
        cont.querySelectorAll("button").forEach(x => x.classList.toggle("activo", Number(x.dataset.n) <= n));
    });
}
crearEstrellas("estrellas", (n) => { state.estrellas = n; });

$("btnCalificar").addEventListener("click", async () => {
    if (!state.estrellas) { LUR.toast("Elige de 1 a 5 estrellas", "error"); return; }
    const r = await LUR.calificar(state.trackId, state.estrellas, $("calComentario").value.trim());
    LUR.toast(r.ok ? "¡Gracias por tu opinión!" : r.error, r.ok ? "ok" : "error");
    if (r.ok) cargarOpiniones();
});

const TXT_ESTRELLAS = { 1: "Muy mala", 2: "Mala", 3: "Regular", 4: "Buena", 5: "Excelente" };
const cal = { id: null, estrellas: 0, etiquetas: new Set() };
const descartadas = new Set(JSON.parse(sessionStorage.getItem("lur_cal_descartadas") || "[]"));
const descartar = (id) => { descartadas.add(String(id)); sessionStorage.setItem("lur_cal_descartadas", JSON.stringify([...descartadas])); };

function cambiarTextoEstrellas(txt) {
    const el = $("calEstrellaTxt");
    if (el.textContent === txt) return;
    el.classList.add("cambiando");
    setTimeout(() => { el.textContent = txt; el.classList.remove("cambiando"); }, 120);
}

function pintarEtiquetas() {
    const hacer = (tipo) => LUR.ETIQUETAS_REPARTIDOR.filter(e => e.tipo === tipo).map(e =>
        `<button type="button" class="etq ${tipo === "positiva" ? "pos" : "neg"}" data-etq="${e.id}" aria-pressed="false">${esc(e.label)}</button>`).join("");
    $("etqPos").innerHTML = hacer("positiva");
    $("etqNeg").innerHTML = hacer("negativa");
}

function actualizarAvisoCal() {
    $("calAviso").classList.toggle("visible", cal.etiquetas.has("mal_estado") || cal.etiquetas.has("incompleto"));
}

function ordenarGruposCal() {
    const pos = $("grupoPos"), neg = $("grupoNeg");
    if (cal.estrellas && cal.estrellas <= 2) pos.before(neg); else neg.before(pos);
}

function abrirCalificarRepartidor(o) {
    if (!o || !o.repartidorNombre || o.calRepartidor) return;
    cal.id = o.id; cal.estrellas = 0; cal.etiquetas = new Set();
    $("calPedidoNum").textContent = `#${o.id}`;
    $("calRepNombre").textContent = o.repartidorNombre;
    $("calAvatar").textContent = o.repartidorNombre.trim().charAt(0).toUpperCase();
    $("calEstrellaTxt").textContent = "Toca una estrella";
    $("calRepComentario").value = "";
    $("calModalForm").classList.remove("oculto");
    $("calModalForm").style.display = "flex";
    $("calModalOk").classList.add("oculto");
    document.querySelectorAll("#estrellasRepModal button").forEach(b => b.classList.remove("activo"));
    pintarEtiquetas(); ordenarGruposCal(); actualizarAvisoCal();
    $("btnCalEnviar").disabled = false;
    abrirModal("modalCalificar");
}

crearEstrellas("estrellasRepModal", (n) => { cal.estrellas = n; cambiarTextoEstrellas(TXT_ESTRELLAS[n]); ordenarGruposCal(); });
{
    const zona = $("estrellasRepModal");
    zona.addEventListener("mouseover", (e) => { const b = e.target.closest("[data-n]"); if (b) cambiarTextoEstrellas(TXT_ESTRELLAS[b.dataset.n]); });
    zona.addEventListener("mouseleave", () => cambiarTextoEstrellas(cal.estrellas ? TXT_ESTRELLAS[cal.estrellas] : "Toca una estrella"));
}
$("modalCalificar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-etq]");
    if (!b) return;
    const id = b.dataset.etq;
    const activa = !cal.etiquetas.has(id);
    if (activa) cal.etiquetas.add(id); else cal.etiquetas.delete(id);
    b.setAttribute("aria-pressed", String(activa));
    actualizarAvisoCal();
});

function cerrarCalificarSinEnviar() { if (cal.id) descartar(cal.id); cerrarModal("modalCalificar"); }
$("btnCalAhoraNo").addEventListener("click", cerrarCalificarSinEnviar);
document.querySelector('[data-cerrar="modalCalificar"]')?.addEventListener("click", () => { if (cal.id) descartar(cal.id); });

$("btnCalEnviar").addEventListener("click", async () => {
    if (!cal.estrellas) { LUR.toast("Elige de 1 a 5 estrellas para tu repartidor", "error"); return; }
    const btn = $("btnCalEnviar");
    btn.disabled = true;
    const r = await LUR.calificarRepartidor(cal.id, cal.estrellas, $("calRepComentario").value.trim(), [...cal.etiquetas]);
    if (!r.ok) { btn.disabled = false; LUR.toast(r.error, "error"); return; }
    descartar(cal.id);
    const problema = cal.etiquetas.has("mal_estado") || cal.etiquetas.has("incompleto");
    $("calOkTxt").textContent = problema
        ? "Avisamos a la administración para revisar tu reporte. Lamentamos el inconveniente."
        : "Tu calificación nos ayuda a mejorar el servicio.";
    $("calModalForm").style.display = "none";
    $("calModalOk").classList.remove("oculto");
});

$("btnAbrirCalRep").addEventListener("click", () => abrirCalificarRepartidor(LUR.getOrder(state.trackId)));

function revisarCalificacionPendiente() {
    if (!sesion() || document.querySelector(".modal.abierto") || $("carrito").classList.contains("abierto")) return;
    const o = LUR.misPedidos().find(x => x.estado === "entregado" && x.tipo === "delivery" && x.repartidorNombre && !x.calRepartidor
        && !descartadas.has(String(x.id)) && Date.now() - x.historial[x.historial.length - 1].ts < 2 * 3600000);
    if (!o) return;
    descartar(o.id);
    if (state.trackId !== String(o.id) && state.trackId !== o.id) seleccionarPedido(o.id);
    abrirCalificarRepartidor(o);
}

{
    const caja = document.querySelector("#modalCalificar .modal-contenido"), asa = document.querySelector("#modalCalificar .hoja-asa");
    let y0 = null, dy = 0;
    asa.addEventListener("pointerdown", (e) => { y0 = e.clientY; dy = 0; caja.classList.add("arrastrando"); asa.setPointerCapture(e.pointerId); });
    asa.addEventListener("pointermove", (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); caja.style.transform = `translateY(${dy}px)`; });
    const soltar = () => {
        if (y0 === null) return;
        caja.classList.remove("arrastrando"); caja.style.transform = "";
        y0 = null;
        if (dy > 90) cerrarCalificarSinEnviar();
    };
    asa.addEventListener("pointerup", soltar); asa.addEventListener("pointercancel", soltar);
}

const estrellasTxt = (n) => "★".repeat(n) + "☆".repeat(5 - n);

function tiempoRelativo(ts) {
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d < 1) return "hoy";
    if (d === 1) return "ayer";
    if (d < 30) return `hace ${d} días`;
    const m = Math.floor(d / 30);
    return m === 1 ? "hace 1 mes" : `hace ${m} meses`;
}

async function cargarOpiniones() {
    const r = await LUR.http("GET", "/api/opiniones");
    if (!r.ok) return;
    const o = r.data;
    if (!o.total) {
        $("opResumen").innerHTML = `<p class="op-vacio">Aún no hay opiniones. ¡Sé el primero en calificar tu pedido!</p>`;
        $("opLista").innerHTML = "";
        return;
    }
    $("opResumen").innerHTML = `
        <div class="op-promedio">
            <strong>${o.promedio.toFixed(1)}</strong>
            <div class="estrellas fija" aria-label="${o.promedio} de 5">${estrellasTxt(Math.round(o.promedio))}</div>
            <small>${o.total} calificaciones</small>
        </div>
        <ul class="op-barras">
            ${o.reparto.map(x => `<li><span>${x.estrellas} ★</span><div class="barra"><i style="width:${Math.round(x.cantidad * 100 / o.total)}%"></i></div><span>${x.cantidad}</span></li>`).join("")}
        </ul>`;
    $("opLista").innerHTML = o.lista.map(x => `
        <article class="op-card">
            <div class="op-cab"><strong>${esc(x.nombre)}</strong><span class="estrellas fija" aria-label="${x.estrellas} de 5">${estrellasTxt(x.estrellas)}</span></div>
            <p>“${esc(x.comentario)}”</p>
            <small>✔ Compra verificada · ${esc(x.productos.join(", "))} · ${tiempoRelativo(x.ts)}</small>
        </article>`).join("");
}

const sinTildes = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

$("zonasChips").innerHTML = LUR.DISTRITOS.map(d => `<span class="zona-chip">${esc(d)}</span>`).join("");

if (LUR.Mapa.hayLeaflet()) {
    $("mapaCobertura").classList.remove("oculto");
    $("coberturaCss").classList.add("oculto");
    LUR.Mapa.cobertura($("mapaCobertura"));
}

function verificarZona() {
    const zona = sinTildes($("inputZona").value);
    const res = $("resultadoZona");
    if (!zona) { res.textContent = "Escribe el nombre de tu distrito."; res.className = ""; return; }
    const cubierto = LUR.DISTRITOS.some(d => {
        const dn = sinTildes(d);
        return dn.includes(zona) || zona.includes(dn.split(" (")[0]);
    });
    res.textContent = cubierto
        ? "✅ ¡Buenas noticias! Llegamos a tu zona."
        : "📍 Tu distrito no está en nuestra zona habitual, pero igual puedes pedir: al hacer tu pedido elige “Otro distrito” y la tienda te confirma un recargo por envío. También puedes recoger en tienda.";
    res.className = cubierto ? "resultado-ok" : "resultado-fuera";
}
$("btnZona").addEventListener("click", verificarZona);
$("inputZona").addEventListener("keydown", (e) => { if (e.key === "Enter") verificarZona(); });

$("btnZonaGps").addEventListener("click", async () => {
    const res = $("resultadoZona");
    res.className = ""; res.textContent = "Buscando tu ubicación…";
    try {
        const pos = await pedirUbicacion();
        const km = LUR.Mapa.distanciaKm(LUR.TIENDA, pos);
        LUR.Mapa.marcarUsuario($("mapaCobertura"), pos);
        const dentro = km <= LUR.RADIO_KM;
        res.textContent = dentro
            ? `✅ Estás a ${km.toFixed(1)} km del local: ¡llegamos a donde estás!`
            : `📍 Estás a ${km.toFixed(1)} km del local: fuera de la zona habitual. Puedes pedir igual: la tienda evalúa un recargo por envío.`;
        res.className = dentro ? "resultado-ok" : "resultado-fuera";
    } catch (e) { res.textContent = e.message; res.className = "resultado-fuera"; }
});

opcionesDistrito($("heroDistrito"), state.distrito);
renderUsuario();
renderCategorias();
renderProductos();
aplicarModo();

const param = new URLSearchParams(location.search).get("pedido");
if (param) await seleccionarPedido(param);
else {
    const mios = LUR.misPedidos();
    const activo = mios.find(o => !["entregado", "cancelado"].includes(o.estado));
    const porCalificar = mios.find(o => o.estado === "entregado" && Date.now() - o.historial[o.historial.length - 1].ts < 86400000
        && (!o.calificacion || (o.tipo === "delivery" && o.repartidorNombre && !o.calRepartidor)));
    const elegido = activo || porCalificar;
    if (elegido) await seleccionarPedido(elegido.id);
}

LUR.subscribe(() => { renderTracker(); renderMisPedidos(); renderSolicitudes(); avisarRespuestasSolicitud(); revisarCalificacionPendiente(); });
renderSolicitudes(); avisarRespuestasSolicitud();

setInterval(() => { renderTracker(); revisarCalificacionPendiente(); }, 30000);
revisarCalificacionPendiente();

function renderTienda() {
    const t = LUR.TIENDA_ESTADO || { abierta: true };
    const av = $("avisoCerrado");
    av.classList.toggle("oculto", t.abierta);
    if (!t.abierta) av.innerHTML = `<span>😴</span><div><strong>Estamos cerrados por ahora</strong><small>${esc(t.mensaje || "Puedes ver la carta, pero no recibimos pedidos hasta que volvamos a abrir.")}</small></div>`;
    $("btnContinuar").textContent = t.abierta ? "Continuar pedido" : "Cerrado por ahora";
    $("btnContinuar").classList.toggle("btn-cerrado", !t.abierta);
}
LUR.subscribe(renderTienda);

cargarOpiniones();
let ultimaOpinion = Date.now();
LUR.subscribe(() => { if (Date.now() - ultimaOpinion > 20000) { ultimaOpinion = Date.now(); cargarOpiniones(); } });
})();
