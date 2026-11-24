# Fase 9 — El administrativo, rehecho

## Lo que pidió el dueño (24/11/2026)

> "Absolutamente todo, landing, catálogo, y todo hasta el administrativo."

Va después de la auditoría (fase 8) y sobre lo que salga de ella: una forma
clara de ver lo que entra, lo que sale, lo invertido y lo que hay.

## Ya decidido (24/11/2026)

- **Estilo nuevo, con los colores y la letra de Lux**: como la landing, se
  conservan la paleta de `estilos/tokens.css` y la tipografía (Fraunces, EB
  Garamond, Jost); lo demás (densidad, tablas, gráficos, menús) se rehace.
- **El texto se mide a 4,5:1, siempre** (regla 5).

## Decisiones abiertas (preguntar al empezar, con opciones)

- ¿Las pantallas de la vendedora (Mostrador, Pedidos, Cierre, Conteo)
  entran, o solo las del administrador?
- ¿Qué tiene que contestar la primera pantalla que abre el dueño?
- Lo que diga el informe de la fase 8.

## Lo que sigue valiendo (no es visual)

- La vendedora no ve un solo número de costo (regla 1): eso vive en
  Postgres, no en la pantalla.
- Cada "$" dice cuál es (BCV o Binance); una cifra, un sitio: las pantallas
  leen de las fórmulas de la base, no las recalculan.
- El administrador también usa el teléfono.

## Depende de

La fase 8.
