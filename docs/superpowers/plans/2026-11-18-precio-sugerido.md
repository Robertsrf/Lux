# El precio sugerido que no sale completo — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la cadena del precio sugerido y el grupo salgan con el costo escrito, sin tener que cambiar el tipo, y que el precio propio se lea con `leerCifra`.

**Architecture:** la regla de "qué grupo pone la máquina" sale del componente a una función pura en `src/lib/grupoSugerido.ts`, probada con `node --test`. El formulario descarta respuestas viejas con un contador, enseña el error de la cuenta y lee el precio propio con `leerCifra`.

**Tech Stack:** React 19, TypeScript estricto, Supabase RPC, `node --test` sobre `.ts`.

**Spec:** `docs/superpowers/specs/2026-11-18-precio-sugerido-design.md`

## Global Constraints

- Sin SQL. Sin `any`. Dominio en español, API de React en inglés.
- Todos los `useMemo` antes del primer `return` temprano.
- Ficheros en CRLF: editar por líneas, no con reemplazos que busquen `\n`.
- El costo unitario sigue `type="number"` (excepción documentada).

## Review Focus

- Una pieza que se edita no cambia de grupo al abrirla (quien = dueño desde la carga).
- Elegir "Sin grupo" a mano también es una elección del dueño: no se rellena sola.
- Con precio propio escrito, la máquina no mueve el grupo.
- Una sugerencia de la otra escalera (llegó antes de cambiar el tipo) no toca nada.
- "0" o "12,5,0" en precio propio: aviso al guardar, nunca se guarda como vacío.

---

### Task 1: La regla del grupo, sola y probada

**Files:**
- Create: `src/lib/grupoSugerido.ts`
- Test: `scripts/pruebas/grupo-sugerido.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type QuienPusoGrupo = 'maquina' | 'dueno';
  export interface EstadoGrupo {
    grupo: string;              // form.grupo_precio_id ('' = sin grupo)
    quien: QuienPusoGrupo;
    tipoCambiado: boolean;
    escalera: Escalera;         // la del tipo de ahora
    costo: number;              // costo leído; <= 0 no asigna
    hayPrecioPropio: boolean;   // el campo no está vacío
  }
  /** null: la sugerencia es de la otra escalera, no se toca nada. */
  export function grupoTrasSugerencia(
    s: Pick<PrecioSugerido, 'grupo_id' | 'escalera'>, e: EstadoGrupo,
  ): { grupo: string; quien: QuienPusoGrupo } | null;
  ```
  Reglas: escalera distinta (`s.escalera ?? 'pieza'`) → null. Con `tipoCambiado`: grupo de la sugerencia si trae uno y no hay precio propio, si no el de antes; `quien = 'maquina'`. Si no: `quien === 'dueno'` → igual; sin `grupo_id`, con precio propio o costo ≤ 0 → igual; si no, `String(s.grupo_id)` y `'maquina'`.

- [ ] **Step 1: pruebas** — `grupoTrasSugerencia`: la máquina sigue al costo (G3 → G5 → G3); el dueño no se mueve (también con grupo ''); otra escalera → null; tipo cambiado reemplaza el del dueño y pasa a máquina; tipo cambiado sin grupo en la escalera nueva conserva el de antes; precio propio no mueve; costo 0 no asigna. Y `leerCifra` para el precio propio: '12,5' → 12.5, '12.50' → 12.5, '1.500,50' → 1500.5, '12,5,0' → null, '0' → null.
- [ ] **Step 2:** `npm run pruebas` falla (no existe el módulo).
- [ ] **Step 3:** escribir `src/lib/grupoSugerido.ts`.
- [ ] **Step 4:** `npm run pruebas` pasa.

### Task 2: El formulario usa la regla, descarta lo viejo y dice el error

**Files:** Modify `src/paginas/admin/FormularioModelo.tsx` (estado ~130–145, `pedirSugerencia` ~338, efecto ~355, carga ~203, selector y "Usar G…" ~729 y ~837, panel ~782).

- `autoAsignado` → `const [quienGrupo, setQuienGrupo] = useState<QuienPusoGrupo>(esNuevo ? 'maquina' : 'dueno')`; al cargar una pieza, `'dueno'`.
- `const ultimaPeticion = useRef(0)`: cada `pedirSugerencia` toma `++ultimaPeticion.current` y, al volver, ignora la respuesta (y el error) si ya no es la última.
- `const [errorSugerencia, setErrorSugerencia] = useState<string | null>(null)`: con error, `mensajeDeError(err)`; con éxito, null. En el panel "Como sale el precio", bajo la cadena: `<Aviso tono="alerta">No se pudo calcular el precio: {errorSugerencia} <button>Calcular otra vez</button></Aviso>`, que llama a `pedirSugerencia`.
- El efecto de asignación llama a `grupoTrasSugerencia`; si no es null, pone `tipoCambiado` en false, `quienGrupo` y, solo si cambia, el grupo.
- El selector de grupo y "Usar G…" ponen `quienGrupo = 'dueno'`.
- `npm run build` pasa.

### Task 3: Precio propio con `leerCifra`

**Files:** Modify `src/paginas/admin/FormularioModelo.tsx` (carga ~190, ~414, guardar ~456, ~486, ~535, campo ~743).

- `precioPropio = texto.trim() === '' ? null : leerCifra(texto)`; `precioPropioIlegible = texto.trim() !== '' && precioPropio === null`. `hayPrecioPropio = texto.trim() !== ''`.
- Campo `type="text" inputMode="decimal"`, pista "Con coma para los decimales: 12,50. Vacío: el del grupo."; con ilegible, `aria-invalid` y la pista dice "No se entiende esa cifra.".
- `guardar()`: si es ilegible, `setError('El precio propio no se entiende. Escríbelo con coma para los decimales (12,50) o déjalo vacío para usar el del grupo.')` y no guarda. Se manda `precioPropio`.
- `precioBcv` y el detalle de variantes usan `precioPropio`.
- Al cargar: `String(n).replace('.', ',')`.
- `npm run build` pasa.

### Task 4: Comprobar y documentar

- `npm run pruebas`, `npm run build`.
- En el navegador con sesión de administrador (red lenta): lo de "Cómo se comprueba" del diseño. Sin guardar nada.
- CLAUDE.md, Trampas: una línea ("Una petición que se repite al escribir descarta las respuestas viejas, y si falla lo dice").
- README de la fase: fase 1 hecha, con el commit.
- Commit.
