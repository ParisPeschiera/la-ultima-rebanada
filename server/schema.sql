PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    rol           TEXT    NOT NULL CHECK (rol IN ('cliente','cocinero','delivery','admin')),
    nombre        TEXT    NOT NULL,
    telefono      TEXT    NOT NULL DEFAULT '',
    email         TEXT    COLLATE NOCASE,
    dni           TEXT,
    activo        INTEGER NOT NULL DEFAULT 1,
    inhabilitado_en     INTEGER,
    inhabilitado_motivo TEXT,
    inhabilitado_por    INTEGER REFERENCES usuarios(id),
    creado        INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_dni ON usuarios(dni) WHERE dni IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_usuarios_no_borrar
BEFORE DELETE ON usuarios
BEGIN
    SELECT RAISE(ABORT, 'Las cuentas no se pueden borrar: se inhabilitan para conservar el historial.');
END;
CREATE TRIGGER IF NOT EXISTS trg_personal_no_reactivar
BEFORE UPDATE OF activo ON usuarios
WHEN OLD.activo = 0 AND NEW.activo = 1 AND OLD.rol <> 'cliente'
BEGIN
    SELECT RAISE(ABORT, 'El personal inhabilitado no puede volver a trabajar: la inhabilitación es definitiva.');
END;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

CREATE TABLE IF NOT EXISTS pedidos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    cliente_nombre   TEXT    NOT NULL,
    cliente_telefono TEXT    NOT NULL,
    tipo             TEXT    NOT NULL CHECK (tipo IN ('delivery','recojo')),
    direccion        TEXT    NOT NULL DEFAULT '',
    distrito         TEXT    NOT NULL DEFAULT '',
    referencia       TEXT    NOT NULL DEFAULT '',
    lat              REAL,
    lng              REAL,
    subtotal         REAL    NOT NULL,
    envio            REAL    NOT NULL,
    descuento        REAL    NOT NULL,
    cupon            TEXT,
    total            REAL    NOT NULL,
    pago             TEXT    NOT NULL CHECK (pago IN ('efectivo','tarjeta','yape')),
    paga_con         REAL,
    notas            TEXT    NOT NULL DEFAULT '',
    estado           TEXT    NOT NULL DEFAULT 'cola'
                     CHECK (estado IN ('cola','cocinando','horno','listo','asignado','recogido','camino','entregado','cancelado')),
    repartidor_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    progreso         REAL    NOT NULL DEFAULT 0,
    rep_lat          REAL,
    rep_lng          REAL,
    codigo           TEXT    NOT NULL,
    creado           INTEGER NOT NULL,
    eta              INTEGER NOT NULL,
    cal_estrellas    INTEGER CHECK (cal_estrellas BETWEEN 1 AND 5),
    cal_comentario   TEXT,
    cal_oculta       INTEGER NOT NULL DEFAULT 0,
    rep_estrellas    INTEGER,
    rep_comentario   TEXT,
    rep_etiquetas    TEXT,
    recargo_zona     REAL    NOT NULL DEFAULT 0,
    ruta_orden       INTEGER,
    origen_lat       REAL,
    origen_lng       REAL
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id   INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id TEXT    NOT NULL,
    categoria   TEXT    NOT NULL,
    nombre      TEXT    NOT NULL,
    detalle     TEXT    NOT NULL DEFAULT '',
    precio      REAL    NOT NULL,
    cantidad    INTEGER NOT NULL CHECK (cantidad > 0)
);

CREATE TABLE IF NOT EXISTS historial_estados (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    estado     TEXT    NOT NULL,
    ts         INTEGER NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS solicitudes_zona (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id      INTEGER NOT NULL REFERENCES usuarios(id),
    cliente_nombre  TEXT    NOT NULL,
    cliente_telefono TEXT   NOT NULL,
    distrito        TEXT    NOT NULL,
    direccion       TEXT    NOT NULL,
    referencia      TEXT,
    lat             REAL,
    lng             REAL,
    km_linea        REAL,
    pedido_json     TEXT    NOT NULL,
    estado          TEXT    NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','cotizada','aceptada','rechazada','cancelada')),
    recargo         REAL,
    km_ruta         REAL,
    nota_admin      TEXT,
    creado          INTEGER NOT NULL,
    cotizado_en     INTEGER,
    resuelto_en     INTEGER,
    admin_id        INTEGER REFERENCES usuarios(id),
    pedido_id       INTEGER REFERENCES pedidos(id)
);
CREATE INDEX IF NOT EXISTS idx_solic_estado ON solicitudes_zona(estado);

CREATE TABLE IF NOT EXISTS notificaciones (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo      TEXT    NOT NULL,
    pedido_id INTEGER,
    texto     TEXT    NOT NULL,
    ts        INTEGER NOT NULL,
    leida     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventario (
    id     TEXT PRIMARY KEY,
    insumo TEXT NOT NULL,
    stock  REAL NOT NULL,
    minimo REAL NOT NULL,
    unidad TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_creado     ON pedidos(creado);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado     ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente    ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_repartidor ON pedidos(repartidor_id);
CREATE INDEX IF NOT EXISTS idx_historial_pedido   ON historial_estados(pedido_id);
