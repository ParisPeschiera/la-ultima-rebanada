const TIENDA = { lat: -12.1265, lng: -77.0285, direccion: "Av. Larco 1234, Miraflores" };
const RADIO_KM = 15;

const MENU = [
    { id: "pepperoni",    cat: "pizzas", nombre: "Pepperoni Clásica", desc: "Salsa de tomate, mozzarella y abundante pepperoni.", precio: 29.9, img: "productos/pepperoni.webp", badge: "Popular", custom: true },
    { id: "hawaiana",     cat: "pizzas", nombre: "Hawaiana", desc: "Mozzarella, jamón y piña con nuestra salsa especial.", precio: 31.9, img: "productos/hawaiana.webp", badge: "Favorita", custom: true },
    { id: "carnes",       cat: "pizzas", nombre: "Carnes Lovers", desc: "Pepperoni, jamón, salchicha y carne sazonada.", precio: 36.9, img: "productos/carnes-lovers.webp", badge: "Especial", custom: true },
    { id: "vegetariana",  cat: "pizzas", nombre: "Vegetariana", desc: "Champiñones, pimiento, cebolla, aceitunas y mozzarella.", precio: 30.9, img: "productos/vegetariana.webp", badge: "Vegetariana", custom: true },
    { id: "margarita",    cat: "pizzas", nombre: "Margarita", desc: "Tomate fresco, albahaca y mozzarella. La de siempre.", precio: 26.9, img: "productos/margarita.webp", custom: true },
    { id: "cuatroquesos", cat: "pizzas", nombre: "Cuatro Quesos", desc: "Mozzarella, parmesano, gouda y provolone.", precio: 34.9, img: "productos/cuatro-quesos.webp", badge: "Nueva", custom: true },
    { id: "americana",    cat: "pizzas", nombre: "Americana", desc: "Jamón, mozzarella y salsa de tomate. Sencilla y clásica.", precio: 28.9, img: "productos/americana.webp", custom: true },

    { id: "combo-lur",      cat: "combos", nombre: "Combo Última Rebanada", desc: "1 pizza grande + 2 gaseosas + pan al ajo.", precio: 49.9, img: "productos/combo.webp", badge: "Promo de hoy" },
    { id: "combo-pareja",   cat: "combos", nombre: "Combo Pareja", desc: "2 pizzas medianas a elección + 1 gaseosa de 1.5 L.", precio: 59.9, img: "productos/combo-pareja.webp" },
    { id: "combo-familiar", cat: "combos", nombre: "Combo Familiar", desc: "2 pizzas familiares + 4 palitos de queso + gaseosa 2 L.", precio: 89.9, img: "productos/combo-familiar.webp", badge: "Ahorra S/ 14" },

    { id: "panajo",      cat: "entradas", nombre: "Pan al ajo", desc: "6 piezas con mantequilla de ajo y orégano.", precio: 11.9, img: "productos/panajo.webp" },
    { id: "panajoqueso", cat: "entradas", nombre: "Pan al ajo con queso", desc: "6 piezas gratinadas con mozzarella.", precio: 14.9, img: "productos/panajoqueso.webp", badge: "Favorito" },
    { id: "palitos",     cat: "entradas", nombre: "Palitos de queso", desc: "8 palitos rellenos de mozzarella con salsa marinara.", precio: 14.9, img: "productos/palitos.webp" },
    { id: "ensalada",    cat: "entradas", nombre: "Ensalada César", desc: "Lechuga, crutones, parmesano y aderezo césar.", precio: 16.9, img: "productos/ensalada.webp" },

    { id: "lasagna",   cat: "pastas", nombre: "Lasagna de carne", desc: "Capas de pasta, carne, salsa pomodoro y queso gratinado.", precio: 24.9, img: "productos/lasagna.webp", badge: "Top ventas" },
    { id: "spaghetti", cat: "pastas", nombre: "Spaghetti a la boloñesa", desc: "Spaghetti con salsa de carne y parmesano.", precio: 22.9, img: "productos/spaghetti.webp" },

    { id: "canela",  cat: "postres", nombre: "Rollos de canela", desc: "6 rollos tibios con glaseado de vainilla.", precio: 12.9, img: "productos/canela.webp", badge: "Imperdible" },
    { id: "brownie", cat: "postres", nombre: "Brownie de chocolate", desc: "Brownie húmedo con trozos de chocolate.", precio: 10.9, img: "productos/brownie.webp" },
    { id: "volcan",  cat: "postres", nombre: "Volcán de chocolate", desc: "Bizcocho tibio con centro de chocolate fundido.", precio: 13.9, img: "productos/volcan.webp" },

    { id: "inca15",  cat: "bebidas", nombre: "Inca Kola 1.5 L", desc: "Bien helada.", precio: 8.5, img: "productos/inca15.webp" },
    { id: "coca15",  cat: "bebidas", nombre: "Coca-Cola 1.5 L", desc: "Bien helada.", precio: 8.5, img: "productos/coca15.webp" },
    { id: "sprite15", cat: "bebidas", nombre: "Sprite 1.5 L", desc: "Bien helada.", precio: 8.5, img: "productos/sprite15.webp" },
    { id: "agua",    cat: "bebidas", nombre: "Agua mineral 600 ml", desc: "Sin gas.", precio: 3.5, img: "productos/agua.webp" }
];

const CATEGORIAS = [
    { id: "pizzas", label: "Pizzas", icon: "🍕" },
    { id: "combos", label: "Combos", icon: "🎉" },
    { id: "entradas", label: "Entradas", icon: "🥖" },
    { id: "pastas", label: "Pastas", icon: "🍝" },
    { id: "postres", label: "Postres", icon: "🍰" },
    { id: "bebidas", label: "Bebidas", icon: "🥤" }
];

const TAMANOS = [{ id: "Personal", extra: 0 }, { id: "Mediana", extra: 6 }, { id: "Familiar", extra: 12 }];
const MASAS = [{ id: "Clásica", extra: 0 }, { id: "Delgada", extra: 0 }, { id: "Borde de queso", extra: 4 }];
const TOPPINGS = [
    { id: "Queso extra", icon: "🧀", extra: 3 },
    { id: "Champiñones", icon: "🍄", extra: 2.5 },
    { id: "Pepperoni extra", icon: "🍕", extra: 4 },
    { id: "Aceitunas", icon: "🫒", extra: 2 },
    { id: "Tocino", icon: "🥓", extra: 3.5 }
];

const CUPONES = {
    LUR10: { tipo: "pct", valor: 10, min: 0, texto: "10% de descuento en tu pedido" },
    BIENVENIDO: { tipo: "monto", valor: 8, min: 40, texto: "S/ 8 de descuento en pedidos desde S/ 40" },
    ENVIOGRATIS: { tipo: "envio", valor: 0, min: 0, texto: "Envío gratis en tu pedido" }
};

const ENVIO = { costo: 5, gratisDesde: 70, minutosDelivery: 35, minutosRecojo: 20 };

const DISTRITOS = [
    { nombre: "San Isidro", lat: -12.0977, lng: -77.0365 },
    { nombre: "Miraflores", lat: -12.1219, lng: -77.0297 },
    { nombre: "Lince", lat: -12.0850, lng: -77.0340 },
    { nombre: "Jesús María", lat: -12.0700, lng: -77.0430 },
    { nombre: "Magdalena del Mar", lat: -12.0900, lng: -77.0720 },
    { nombre: "Pueblo Libre", lat: -12.0720, lng: -77.0630 },
    { nombre: "San Borja", lat: -12.1080, lng: -76.9970 },
    { nombre: "Surquillo", lat: -12.1110, lng: -77.0140 },
    { nombre: "Barranco", lat: -12.1400, lng: -77.0200 },
    { nombre: "San Miguel", lat: -12.0780, lng: -77.0900 },
    { nombre: "La Victoria", lat: -12.0650, lng: -77.0150 },
    { nombre: "Santiago de Surco (zona norte)", lat: -12.1300, lng: -76.9930 }
];

const DISTRITOS_EXTRA = [
    { nombre: "San Luis", lat: -12.0756, lng: -76.9980 }, { nombre: "El Agustino", lat: -12.0490, lng: -77.0100 },
    { nombre: "Santa Anita", lat: -12.0430, lng: -76.9710 }, { nombre: "Ate", lat: -12.0260, lng: -76.9170 },
    { nombre: "La Molina", lat: -12.0870, lng: -76.9080 }, { nombre: "Rímac", lat: -12.0290, lng: -77.0430 },
    { nombre: "Cercado de Lima", lat: -12.0464, lng: -77.0428 }, { nombre: "Breña", lat: -12.0580, lng: -77.0510 },
    { nombre: "Santiago de Surco", lat: -12.1450, lng: -76.9930 }, { nombre: "Chorrillos", lat: -12.1700, lng: -77.0100 },
    { nombre: "San Juan de Miraflores", lat: -12.1550, lng: -76.9700 }, { nombre: "Villa María del Triunfo", lat: -12.1650, lng: -76.9400 },
    { nombre: "Villa El Salvador", lat: -12.2150, lng: -76.9400 }, { nombre: "Los Olivos", lat: -11.9900, lng: -77.0700 },
    { nombre: "San Martín de Porres", lat: -12.0000, lng: -77.0900 }, { nombre: "Independencia", lat: -11.9950, lng: -77.0560 },
    { nombre: "Callao", lat: -12.0560, lng: -77.1180 }, { nombre: "La Perla", lat: -12.0700, lng: -77.1150 }
];
const ENVIO_FUERA = { minimo: 5, kmIncluidos: 10, porKm: 1, factorRuta: 1.3, maxKm: 40, maxRecargo: 60 };

const PAGOS = ["efectivo", "tarjeta", "yape"];

const TZ_HORAS = Number(process.env.TZ_HORAS ?? -5);
const fechaLocal = (ts) => new Date(ts + TZ_HORAS * 3600000).toISOString().slice(0, 10);
const inicioDiaLocal = (fecha) => { const [y, m, d] = fecha.split("-").map(Number); return Date.UTC(y, m - 1, d) - TZ_HORAS * 3600000; };

const redondear = (n) => Math.round(n * 100) / 100;

function distanciaKm(a, b) {
    const R = 6371, rad = (x) => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const buscarDistrito = (nombre, lista) => lista.find(d => sinTildes(d.nombre) === sinTildes(nombre));

function recargoSugerido(kmLinea) {
    if (!Number.isFinite(kmLinea)) return ENVIO_FUERA.minimo;
    const kmRuta = kmLinea * ENVIO_FUERA.factorRuta;
    const extra = Math.max(0, kmRuta - ENVIO_FUERA.kmIncluidos) * ENVIO_FUERA.porKm;
    return Math.round((ENVIO_FUERA.minimo + extra) * 2) / 2;
}

function calcularItem(entrada) {
    const prod = MENU.find(m => m.id === entrada.id);
    if (!prod) return { ok: false, error: "Producto inexistente." };
    const cant = Number(entrada.cant);
    if (!Number.isInteger(cant) || cant < 1 || cant > 20) return { ok: false, error: "Cantidad no válida." };

    let precio = prod.precio;
    let detalle = "";
    if (prod.custom) {
        const o = entrada.opts || {};
        const tam = TAMANOS.find(t => t.id === o.tamano) || TAMANOS[0];
        const masa = MASAS.find(m => m.id === o.masa) || MASAS[0];
        const tops = (Array.isArray(o.toppings) ? o.toppings : [])
            .map(n => TOPPINGS.find(t => t.id === n)).filter(Boolean);
        const unicos = [...new Set(tops)];
        precio += tam.extra + masa.extra + unicos.reduce((s, t) => s + t.extra, 0);
        detalle = [tam.id, masa.id, ...unicos.map(t => t.id)].join(", ");
    }
    return { ok: true, item: { id: prod.id, cat: prod.cat, nombre: prod.nombre, detalle, precio: redondear(precio), cant } };
}

function calcularTotales(items, tipo, cuponCodigo) {
    const subtotal = redondear(items.reduce((s, i) => s + i.precio * i.cant, 0));
    const c = cuponCodigo ? CUPONES[String(cuponCodigo).toUpperCase()] : null;
    const activo = !!c && subtotal >= c.min;

    let descuento = 0, envioGratis = false;
    if (activo) {
        if (c.tipo === "pct") descuento = subtotal * c.valor / 100;
        else if (c.tipo === "monto") descuento = c.valor;
        else if (c.tipo === "envio") envioGratis = true;
    }
    descuento = redondear(Math.min(descuento, subtotal));
    const envio = tipo === "delivery" && !(subtotal >= ENVIO.gratisDesde || envioGratis) ? ENVIO.costo : 0;
    return {
        subtotal, descuento, envio,
        cupon: activo ? String(cuponCodigo).toUpperCase() : null,
        total: redondear(subtotal - descuento + envio)
    };
}

const ETIQUETAS_REPARTIDOR = [
    { id: "puntual", label: "Llegó a tiempo", tipo: "positiva" },
    { id: "buen_estado", label: "Pedido en buen estado", tipo: "positiva" },
    { id: "amable", label: "Amable y cordial", tipo: "positiva" },
    { id: "indicaciones", label: "Siguió mis indicaciones", tipo: "positiva" },
    { id: "tarde", label: "Llegó tarde", tipo: "negativa" },
    { id: "mal_estado", label: "Pedido en mal estado", tipo: "negativa" },
    { id: "incompleto", label: "Pedido incompleto", tipo: "negativa" },
    { id: "poco_amable", label: "Poco amable", tipo: "negativa" },
    { id: "sin_indicaciones", label: "No siguió mis indicaciones", tipo: "negativa" }
];

const BASE_PIZZA = { masa: 1, queso: 0.3, salsa: 0.2 };
const RECETAS = { hawaiana: { pina: 0.5 }, pepperoni: { pepperoni: 0.2 }, carnes: { pepperoni: 0.15 } };
function insumosDe(categoria, productoId, cantidad) {
    const o = {};
    if (categoria === "pizzas") for (const [k, v] of Object.entries(BASE_PIZZA)) o[k] = v * cantidad;
    for (const [k, v] of Object.entries(RECETAS[productoId] || {})) o[k] = (o[k] || 0) + v * cantidad;
    return o;
}

module.exports = {
    insumosDe,
    ETIQUETAS_REPARTIDOR,
    TZ_HORAS, fechaLocal, inicioDiaLocal,
    DISTRITOS_EXTRA, ENVIO_FUERA, sinTildes, buscarDistrito, recargoSugerido, TIENDA, RADIO_KM, MENU, CATEGORIAS, TAMANOS, MASAS, TOPPINGS, CUPONES, ENVIO, DISTRITOS, PAGOS,
    distanciaKm, calcularItem, calcularTotales, redondear
};
