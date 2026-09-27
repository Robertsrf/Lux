import { useCallback, useEffect, useMemo, useState } from 'react';
import { Aviso, Campo, Cargando, Vacio } from '../../../componentes/Piezas';
import { bsDeBcv, formatearBcv, formatearBs, formatearFecha } from '../../../lib/dinero';
import { enlaceWhatsApp, rpcRv } from '../../../lib/revendedor';
import { useTasa } from '../../../hooks/useTasa';
import type { ClienteRevendedor } from '../../../lib/tipos';
import { textoDeError, usePanelRv } from '../contexto';

interface Borrador { id: number | null; nombre: string; apellido: string; cedula: string; telefono: string; notas: string }
const VACIO: Borrador = { id: null, nombre: '', apellido: '', cedula: '', telefono: '', notas: '' };

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Sus clientas. No son las de la tienda: la tienda no las ve en su maestro.
 * Primero las que le deben, y cuánto; después las demás, la más reciente
 * arriba. Se buscan por nombre, cédula o teléfono.
 */
export function ClientesRv() {
  const { siSeCerro } = usePanelRv();
  const { tasa } = useTasa();
  const [lista, setLista] = useState<ClienteRevendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await rpcRv<ClienteRevendedor[]>('rv_clientes'));
      setError(null);
    } catch (e) {
      if (!siSeCerro(e)) setError(textoDeError(e));
    }
    setCargando(false);
  }, [siSeCerro]);

  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    if (!q) return lista;
    const digitos = q.replace(/\D/g, '');
    return lista.filter((c) =>
      sinAcentos(`${c.nombre} ${c.apellido ?? ''}`).includes(q)
      || (digitos.length >= 3 && ((c.cedula ?? '').replace(/\D/g, '').includes(digitos) || (c.telefono ?? '').replace(/\D/g, '').includes(digitos))));
  }, [lista, buscar]);

  const deuda = useMemo(() => lista.reduce((s, c) => s + Number(c.falta_usd), 0), [lista]);

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    setErrorForm(null);
    try {
      await rpcRv<number>('rv_guardar_cliente', {
        p_id: borrador.id, p_nombre: borrador.nombre, p_apellido: borrador.apellido,
        p_cedula: borrador.cedula, p_telefono: borrador.telefono, p_notas: borrador.notas,
      });
      setAviso(borrador.id ? 'Ficha guardada.' : `${borrador.nombre.trim()} ya está entre tus clientas.`);
      setBorrador(null);
      void cargar();
    } catch (e) {
      if (!siSeCerro(e)) setErrorForm(textoDeError(e));
    }
    setGuardando(false);
  }

  if (cargando) return <Cargando texto="Buscando tus clientas" />;

  const campo = (clave: keyof Omit<Borrador, 'id'>) => ({
    value: borrador?.[clave] ?? '',
    onChange: (e: { target: { value: string } }) => setBorrador((b) => (b ? { ...b, [clave]: e.target.value } : b)),
  });

  const formulario = borrador ? (
    <div className="tarjeta">
      <h2>{borrador.id ? 'Corregir la ficha' : 'Nueva clienta'}</h2>
      <div className="fila">
        <Campo etiqueta="Nombre" htmlFor="rc-nombre"><input id="rc-nombre" {...campo('nombre')} autoComplete="off" required /></Campo>
        <Campo etiqueta="Apellido" htmlFor="rc-apellido"><input id="rc-apellido" {...campo('apellido')} autoComplete="off" /></Campo>
      </div>
      <div className="fila" style={{ marginTop: 'var(--hueco-campos)' }}>
        <Campo etiqueta="Cédula" htmlFor="rc-cedula" pista="Con ella la reconoce tu catálogo."><input id="rc-cedula" inputMode="numeric" {...campo('cedula')} autoComplete="off" /></Campo>
        <Campo etiqueta="Teléfono" htmlFor="rc-tel" pista="Con el código: 0412 1234567."><input id="rc-tel" type="tel" {...campo('telefono')} autoComplete="off" /></Campo>
      </div>
      <div style={{ marginTop: 'var(--hueco-campos)' }}>
        <Campo etiqueta="Notas" htmlFor="rc-notas" pista="Su talla de anillo, lo que le gusta, cuándo le pagan."><input id="rc-notas" {...campo('notas')} autoComplete="off" /></Campo>
      </div>
      {errorForm ? <p className="campo__error" role="alert">{errorForm}</p> : null}
      <div className="acciones">
        <button type="button" className="boton boton--confirmar" disabled={guardando || !borrador.nombre.trim()} onClick={() => void guardar()}>
          {guardando ? 'Guardando' : 'Guardar'}
        </button>
        <button type="button" className="boton boton--secundario" onClick={() => { setBorrador(null); setErrorForm(null); }}>Cancelar</button>
      </div>
    </div>
  ) : null;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Clientas</h1>
          <p>
            {deuda > 0
              ? <>Te deben <strong>{formatearBcv(deuda)}</strong>{tasa ? `, hoy ${formatearBs(bsDeBcv(deuda, tasa.tasa_bcv))}` : ''}.</>
              : 'Tus clientas, lo que te compraron y lo que te deben.'}
          </p>
        </div>
        {!borrador ? (
          <button type="button" className="boton" onClick={() => { setAviso(null); setBorrador(VACIO); }}>Nueva clienta</button>
        ) : null}
      </div>

      {error ? <Aviso tono="error" titulo="No se pudieron leer tus clientas">{error}</Aviso> : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}

      {formulario}

      {lista.length > 0 ? (
        <div className="campo" style={{ margin: 'var(--e-5) 0' }}>
          <label htmlFor="rc-buscar">Buscar</label>
          <input id="rc-buscar" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre, cédula o teléfono" autoComplete="off" />
        </div>
      ) : null}

      {lista.length === 0 && !borrador ? (
        <Vacio titulo="Todavía no tienes clientas">
          <p>Se agregan solas cuando apartan desde tu catálogo. También puedes cargar una a mano.</p>
        </Vacio>
      ) : visibles.length === 0 && buscar ? (
        <Vacio titulo="Ninguna coincide"><p>Prueba con otra parte del nombre o con la cédula.</p></Vacio>
      ) : (
        <div className="rejilla rejilla--2">
          {visibles.map((c) => {
            const falta = Number(c.falta_usd);
            return (
              <div className="cliente-tarjeta cliente-tarjeta--fija" key={c.id}>
                <span className="cliente-tarjeta__nombre">{[c.nombre, c.apellido].filter(Boolean).join(' ')}</span>
                <span className="cliente-tarjeta__dato">
                  {[c.cedula ? `C.I. ${c.cedula}` : null, c.telefono].filter(Boolean).join(' · ') || 'Sin cédula ni teléfono'}
                </span>
                <span className="cliente-tarjeta__compras">
                  {c.compras === 0 ? 'Todavía no ha retirado nada' : `${c.compras} ${c.compras === 1 ? 'compra' : 'compras'} por ${formatearBcv(Number(c.comprado_usd))}`}
                  {c.abiertos > 0 ? ` · ${c.abiertos} ${c.abiertos === 1 ? 'apartado abierto' : 'apartados abiertos'}` : ''}
                </span>
                {c.notas ? <span className="cliente-tarjeta__dato">{c.notas}</span> : null}
                <div className="cliente-tarjeta__pie">
                  {falta > 0
                    ? <span className="etiqueta etiqueta--alerta">Te debe {formatearBcv(falta)}</span>
                    : <span className="cliente-tarjeta__fecha">{c.ultima ? `Última vez el ${formatearFecha(c.ultima)}` : ''}</span>}
                  <div className="grupo-botones">
                    {c.telefono ? (
                      <a className="boton boton--secundario boton--pequeno" href={enlaceWhatsApp(c.telefono, `Hola ${c.nombre.split(' ')[0]}, `)} target="_blank" rel="noopener noreferrer">
                        Escribirle
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="boton boton--secundario boton--pequeno"
                      onClick={() => {
                        setAviso(null);
                        setBorrador({ id: c.id, nombre: c.nombre, apellido: c.apellido ?? '', cedula: c.cedula ?? '', telefono: c.telefono ?? '', notas: c.notas ?? '' });
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
