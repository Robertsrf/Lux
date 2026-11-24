import type { Dispatch, SetStateAction } from 'react';
import type { Familia } from '../../../lib/familias';
import type { fuenteFoto } from '../../../lib/fotos';
import type { ModeloRevendedor, PerfilRevendedor } from '../../../lib/tipos';
import type { Para } from '../../../componentes/ElegirPara';
import type { EstadoTusDatos } from '../../../componentes/TusDatos';
import type { TemaResuelto } from './tema';

/**
 * Lo que el cerebro (`useCatalogoRv`) le da a cada plantilla. Las tres
 * reciben lo mismo y solo deciden cómo se ve: una regla del catálogo
 * (cuántas quedan, qué se puede pedir, el dije con su base) vive una sola
 * vez, en el cerebro.
 */
export interface CatalogoRv {
  usuario: string;
  perfil: PerfilRevendedor | null;
  perfilListo: boolean;
  tema: TemaResuelto;
  error: string | null;
  limpiarError: () => void;
  /** Trayendo piezas, o las que hay son de otra consulta. */
  cargando: boolean;
  primerNombre: string;
  /** Su WhatsApp, nunca el de la tienda. Null sin número válido. */
  escribirle: string | null;

  /* Lo que se ve */
  familias: Familia<ModeloRevendedor>[];
  estantes: { categoria: string; familias: Familia<ModeloRevendedor>[] }[];
  categorias: string[];
  tiposConFoto: { nombre: string; cuantas: number; foto: ReturnType<typeof fuenteFoto> }[];
  portada: ModeloRevendedor | null;
  /** Un tipo o una búsqueda: la lista en vez del inicio. */
  enLista: boolean;
  /** En la lista, cuántas familias se enseñan ("Ver más"). */
  visibles: number;
  verMas: () => void;
  /** Trajo las 400: puede haber más que no se ven. */
  alTope: boolean;
  limite: number;

  /* La ruta */
  categoria: string | null;
  setCategoria: (c: string | null) => void;
  para: Para | null;
  elegirPara: (p: Para | null) => void;
  texto: string;
  setTexto: (t: string) => void;
  alInicio: () => void;

  /* Lo elegido */
  resumen: { piezas: number; totalUsd: number };
  elegidos: { m: ModeloRevendedor; cantidad: number }[];
  llevas: (id: number) => number;
  disponible: (id: number) => number;
  agregar: (id: number) => void;
  cambiar: (id: number, cantidad: number) => void;
  vaciar: () => void;

  /* La ficha de una pieza */
  fichaAbierta: Familia<ModeloRevendedor> | null;
  abrirFicha: (clave: number) => void;
  cerrarFicha: () => void;
  esBase: (id: number) => boolean;
  /** Los dijes de su catálogo con su precio; null hasta pedirlos. */
  dijes: ModeloRevendedor[] | null;
  cargarDijes: () => Promise<void>;
  /** Cuelga un dije de una base. Null si se pudo; si no, por qué. */
  armarCon: (baseId: number, dijeId: number) => string | null;

  /* El pedido */
  pedidoAbierto: boolean;
  abrirPedido: () => void;
  cerrarPedido: () => void;
  datos: EstadoTusDatos;
  setDatos: Dispatch<SetStateAction<EstadoTusDatos>>;
  buscarSuClienta: (cedula: string) => PromiseLike<{ data: unknown; error: unknown }>;
  apartando: boolean;
  apartar: () => Promise<void>;

  /* Letra grande */
  letraGrande: boolean;
  alternarLetra: () => void;
}
