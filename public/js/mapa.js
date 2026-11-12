LUR.Mapa = (() => {
    const hayLeaflet = () => typeof window.L !== "undefined" && typeof window.L.map === "function";

    function distanciaKm(a, b) {
        const R = 6371, rad = (x) => x * Math.PI / 180;
        const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    function puntoEnRuta(pts, t) {
        if (pts.length < 2) return pts[0];
        const tramos = []; let total = 0;
        for (let i = 1; i < pts.length; i++) { const d = distanciaKm(pts[i - 1], pts[i]); tramos.push(d); total += d; }
        let obj = Math.min(Math.max(t, 0), 1) * total;
        for (let i = 0; i < tramos.length; i++) {
            if (obj <= tramos[i]) {
                const k = tramos[i] ? obj / tramos[i] : 0;
                return { lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * k, lng: pts[i].lng + (pts[i + 1].lng - pts[i].lng) * k };
            }
            obj -= tramos[i];
        }
        return pts[pts.length - 1];
    }

    const rutas = new Map();
    function ruta(a, b) {
        const key = [a.lat, a.lng, b.lat, b.lng].map(n => n.toFixed(4)).join(",");
        if (rutas.has(key)) return rutas.get(key);
        const recta = [a, b];
        const p = (async () => {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 6000);
            try {
                const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
                const r = await fetch(url, { signal: ctl.signal });
                const j = await r.json();
                if (j.code === "Ok" && j.routes[0]) return j.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
            } catch (e) {  }
            finally { clearTimeout(t); }
            return recta;
        })();
        rutas.set(key, p);
        return p;
    }

    const icono = (emoji, extra = "") => L.divIcon({
        className: "mk " + extra, html: `<span>${emoji}</span>`, iconSize: [40, 40], iconAnchor: [20, 20]
    });
    const OSM = { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap" };

    function mostrar(el, o) {
        if (!hayLeaflet() || o.lat == null) { LUR.renderMapa(el, o); return; }
        const tienda = { lat: LUR.TIENDA.lat, lng: LUR.TIENDA.lng };
        const dest = { lat: o.lat, lng: o.lng };
        const origen = o.origenLat != null ? { lat: o.origenLat, lng: o.origenLng } : tienda;
        const clave = o.id + "|" + origen.lat.toFixed(4) + origen.lng.toFixed(4);

        if (!el._m || el._m.id !== clave) {
            if (el._m) el._m.map.remove();
            el.innerHTML = "";
            el.dataset.key = "";
            const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([tienda.lat, tienda.lng], 13);
            L.tileLayer(OSM.url, { maxZoom: 19, attribution: OSM.attr }).addTo(map);
            L.marker(origen, { icon: icono(origen === tienda ? "🍕" : "📍"), interactive: false }).addTo(map);
            L.marker(dest, { icon: icono(o.tipo === "recojo" ? "🏪" : "🏠"), interactive: false }).addTo(map);
            map.fitBounds(L.latLngBounds([origen, dest]).pad(0.25));
            const estado = { id: clave, map, moto: null, linea: null, ultima: "" };
            el._m = estado;
            ruta(origen, dest).then(pts => {
                if (el._m !== estado) return;
                estado.linea = L.polyline(pts.map(p => [p.lat, p.lng]), { color: "#e8361c", weight: 5, opacity: .85, dashArray: pts.length > 2 ? null : "8 10" }).addTo(map);
                map.fitBounds(estado.linea.getBounds().pad(0.2));
            });
            setTimeout(() => map.invalidateSize(), 200);
        }

        const m = el._m;
        let pos = null;
        if (o.estado === "entregado") pos = dest;
        else if (o.estado === "recogido" || o.estado === "camino") pos = (o.repLat != null) ? { lat: o.repLat, lng: o.repLng } : origen;
        const firma = pos ? pos.lat.toFixed(5) + pos.lng.toFixed(5) : "";
        if (firma !== m.ultima) {
            m.ultima = firma;
            if (!pos) { if (m.moto) { m.moto.remove(); m.moto = null; } }
            else if (!m.moto) m.moto = L.marker(pos, { icon: icono("🛵", "mk-moto"), zIndexOffset: 1000, interactive: false }).addTo(m.map);
            else m.moto.setLatLng(pos);
        }
    }

    function cobertura(el) {
        if (!hayLeaflet() || el._cob) return !!el._cob;
        const t = { lat: LUR.TIENDA.lat, lng: LUR.TIENDA.lng };
        const map = L.map(el, { scrollWheelZoom: false }).setView([t.lat, t.lng], 11);
        L.tileLayer(OSM.url, { maxZoom: 19, attribution: OSM.attr }).addTo(map);
        const circ = L.circle([t.lat, t.lng], { radius: LUR.RADIO_KM * 1000, color: "#e8361c", weight: 2, fillColor: "#e8361c", fillOpacity: .08 }).addTo(map);
        L.marker(t, { icon: icono("🍕"), interactive: false }).addTo(map);
        LUR.DISTRITOS_GEO.forEach(d => L.circleMarker([d.lat, d.lng], { radius: 5, color: "#1d1410", weight: 1, fillColor: "#ffc62e", fillOpacity: 1 }).bindTooltip(d.nombre).addTo(map));
        map.fitBounds(circ.getBounds());
        el._cob = { map };
        setTimeout(() => map.invalidateSize(), 200);
        return true;
    }

    function marcarUsuario(el, pos) {
        if (!el._cob) return;
        if (el._cob.yo) el._cob.yo.setLatLng(pos);
        else el._cob.yo = L.marker(pos, { icon: icono("📍") }).addTo(el._cob.map);
        el._cob.map.panTo(pos);
    }

    return { hayLeaflet, distanciaKm, puntoEnRuta, ruta, mostrar, cobertura, marcarUsuario };
})();
