# Cómo usar este paquete con Claude Code

## 1. Prepara el repo

```bash
mkdir lux-sistema && cd lux-sistema
git init
mkdir -p .claude/skills
```

Copia los archivos así:

```
lux-sistema/
├── PLAN.md                          <- la especificación
├── esquema.sql                      <- pégalo en el SQL Editor de Supabase
└── .claude/skills/
    ├── lux-ui/SKILL.md
    └── lux-codigo/SKILL.md
```

Las skills en `.claude/skills/` se cargan solas en Claude Code cuando la tarea las
necesita. No hay que invocarlas a mano.

## 2. Antes de la primera sesión

1. Crea el proyecto en Supabase (plan gratuito).
2. Abre el SQL Editor y ejecuta `esquema.sql` completo.
3. Crea el bucket de Storage `fotos`, con lectura pública y escritura solo admin.
4. Crea los 3 usuarios en Authentication:
   - `admin@lux.local` y `socio@lux.local` → contraseña larga real
   - `vendedora@lux.local` → contraseña derivada del PIN
5. Inserta las filas correspondientes en `perfiles` con el rol de cada uno.
6. Guarda la URL del proyecto y la `anon key` (esa sí puede ir al repo).

## 3. Primer mensaje a Claude Code

> Lee PLAN.md completo. Vamos a construir solo la **Fase 1**. No avances a la
> Fase 2. Al terminar, verifica cada punto del checklist de la Fase 1 y muéstrame
> el resultado de cada uno.

Al terminar cada fase, haz commit y arranca la siguiente en una sesión nueva.

## 4. Lo que falta definir (lo cargas tú en la app)

- Precios reales de cada grupo (G9, G11, G13, G20, G28)
- Costo unitario y peso de cada modelo
- Datos del lote actual: tasa Binance de compra, flete, costo de exhibidores
- Composición de los kits fijos de mayoreo
- Metas de la vendedora (viven en la tabla `configuracion`)

Ninguno de estos valores está quemado en el código, a propósito.
