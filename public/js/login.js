const $ = (id) => document.getElementById(id);
const msg = (texto, tipo) => { const m = $("mensaje"); m.textContent = texto; m.className = tipo || ""; };

(function mostrarSesionActiva() {
    const s = LUR.Auth.session();
    if (!s) return;
    $("sesionActiva").classList.remove("oculto");
    $("sesionTexto").textContent = `Sesión activa: ${s.usuario}`;
    $("sesionContinuar").href = LUR.Auth.home(s.rol);
    $("sesionSalir").addEventListener("click", () => { LUR.Auth.logout(); location.reload(); });
})();

function mostrarFormulario(tipo) {
    const esLogin = tipo === "login";
    $("loginForm").classList.toggle("oculto", !esLogin);
    $("registroForm").classList.toggle("oculto", esLogin);
    $("tabLogin").classList.toggle("active", esLogin);
    $("tabRegistro").classList.toggle("active", !esLogin);
    $("tabLogin").setAttribute("aria-selected", esLogin);
    $("tabRegistro").setAttribute("aria-selected", !esLogin);
    msg("");
}
$("tabLogin").addEventListener("click", () => mostrarFormulario("login"));
$("tabRegistro").addEventListener("click", () => mostrarFormulario("registro"));

LUR.init().catch(() => {  });

$("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("loginForm").querySelector("button[type=submit]");
    btn.disabled = true;
    const r = await LUR.Auth.login($("usuario").value, $("password").value);
    btn.disabled = false;
    if (!r.ok) return msg(r.error, "error");
    window.location.href = LUR.Auth.home(r.usuario.rol);
});

$("regNombre").addEventListener("input", () => {
    const limpio = $("regNombre").value.trim().toLowerCase().replace(/\s+/g, "");
    $("vistaUsuario").textContent = "U-" + (limpio || "…");
});

$("registroForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await LUR.Auth.registrar({
        nombre: $("regNombre").value,
        email: $("regEmail").value.trim(),
        password: $("regPassword").value,
        telefono: $("regTelefono").value.trim()
    });
    if (!r.ok) return msg(r.error, "error");
    msg(`¡Cuenta creada! Tu usuario es ${r.usuario.usuario}`, "ok");
    setTimeout(() => { window.location.href = "index.html"; }, 1200);
});
