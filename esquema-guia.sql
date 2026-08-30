-- =====================================================================
-- Lux by Emory — la guía del colaborador, dentro del sistema
-- Ejecutar en el SQL Editor DESPUÉS de esquema-parche-piso.sql
--
-- La guía impresa se lee una vez y se guarda en un cajón. Estas mismas
-- frases, dentro del mostrador, están donde la vendedora las necesita:
-- con la clienta delante.
--
-- Se siembra el contenido de la Edición I · 2026. El dueño puede
-- editarlo, agregar o desactivar sin tocar código.
-- =====================================================================

create table if not exists consejos (
  id        bigserial primary key,
  momento   text not null,
  etiqueta  text,
  texto     text not null,
  nota      text,
  orden     int  not null default 0,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

create index if not exists consejos_momento_idx on consejos (momento, orden);

alter table consejos enable row level security;

drop policy if exists consejos_leer  on consejos;
drop policy if exists consejos_admin on consejos;

create policy consejos_leer  on consejos for select to authenticated using (activo or es_admin());
create policy consejos_admin on consejos for all to authenticated
  using (es_admin()) with check (es_admin());

grant select on consejos to authenticated;

-- ---------------------------------------------------------------------
-- LOS 4 PILARES — el conocimiento base
-- ---------------------------------------------------------------------

insert into consejos (momento, etiqueta, texto, nota, orden) values
  ('pilar', 'Acero inoxidable 316L quirúrgico',
   'El de los instrumentos médicos. Resistente, no libera níquel dañino, mucho más duradero que el acero común.',
   null, 1),
  ('pilar', 'Aleación de titanio',
   'De los metales más biocompatibles. Ideal para piel sensible; reduce casi por completo la irritación o picazón.',
   null, 2),
  ('pilar', 'Baño de oro 18K PVD',
   'No es un baño común: es un proceso tecnológico. El oro se adhiere al metal, resiste el desgaste, no se cae fácil y no mancha la piel.',
   null, 3),
  ('pilar', 'Certificación SGS',
   'Entidad internacional que confirma que los materiales son seguros para la piel y cumplen estándares de calidad. No es que lo digamos: está comprobado.',
   'Menciona el respaldo, pero nunca muestres ni entregues el certificado: es un documento interno.', 4)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- LOS 4 PRINCIPIOS — si dudas, vuelve a ellos
-- ---------------------------------------------------------------------

insert into consejos (momento, etiqueta, texto, nota, orden) values
  ('principio', 'Educa antes de vender',
   'El cliente confía en quien le enseña. Primero explica el material, luego ofrece.',
   'Tu conocimiento es tu mejor herramienta de venta.', 1),
  ('principio', 'Ver es creer',
   'Demuestra en vivo por qué no se borra ni se pone verde. La prueba convence más que mil palabras.',
   null, 2),
  ('principio', 'Cierra con una pregunta',
   'No preguntes "¿te lo llevas?". Ofrece siempre un paso: probarse, elegir entre dos, apartar.',
   'Facilita el sí.', 3),
  ('principio', 'Recompra sobre todo',
   'El negocio no es la primera venta: es que el cliente vuelva. La calidad lo trae de regreso; tú lo tratas para que quiera volver.',
   null, 4)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- EL RITUAL DE ATENCIÓN EN 6 PASOS
-- ---------------------------------------------------------------------

insert into consejos (momento, etiqueta, texto, nota, orden) values
  ('paso', '1 · Recibe con calma',
   'Saluda con una sonrisa apenas entra el cliente, sin encimarte. Deja que respire y hazle sentir que puede mirar y tocar con confianza.',
   null, 1),
  ('paso', '2 · Escucha y pregunta',
   'Averigua qué busca: ¿para ella, para regalo, piel sensible, diario u ocasión?',
   'Una buena pregunta vende más que un buen discurso.', 2),
  ('paso', '3 · Educa',
   'Explica el material desde los pilares: acero 316L, titanio, baño PVD, certificación SGS.',
   'Conviertes una pieza bonita en una decisión segura.', 3),
  ('paso', '4 · Demuestra — ver es creer',
   'Muestra en vivo por qué no se borra ni se pone verde. La prueba vale más que la promesa.',
   null, 4),
  ('paso', '5 · Cierra con una pregunta',
   'Ofrece un paso concreto: medir, elegir entre dos, apartar, envolver.',
   'Nunca presiones ni inventes urgencia.', 5),
  ('paso', '6 · Despide para que vuelva',
   'Empaca con cuidado, agradece e invita a regresar. Un cliente bien tratado es el mejor anuncio de la marca.',
   null, 6)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- BANCO DE FRASES
-- ---------------------------------------------------------------------

insert into consejos (momento, etiqueta, texto, nota, orden) values
  ('recibir', 'Bienvenida principal',
   'Bienvenida a Lux, con confianza que aquí todo se puede tocar y probar.', null, 1),
  ('recibir', 'Si viene mirando desde afuera',
   'Hola, pasa con calma. Mira todo lo que quieras, y la pieza que te llame te la muestro de cerca.', null, 2),
  ('recibir', 'Para abrir conversación',
   '¿Es tu primera vez con nosotros?',
   'Si dice que sí, es tu entrada perfecta para contarle qué hace distinta a la marca.', 3),

  ('descubrir', 'Para orientar',
   '¿Buscas algo para ti o es para regalar?', null, 1),
  ('descubrir', 'Para conectar con el dolor real',
   '¿Tienes la piel sensible o te ha irritado la bisutería antes? Porque justo eso es lo nuestro.', null, 2),
  ('descubrir', 'Para acotar el gusto',
   '¿Te gusta más en dorado o en plateado? ¿Para el día a día o para una ocasión?', null, 3),

  ('educar', 'Discurso oficial',
   'Todo lo que ves aquí está hecho con acero quirúrgico 316L —el mismo de los instrumentos médicos—, con titanio y baño de oro 18K PVD. Por eso no se mancha, no se pone verde y no te irrita, aunque la uses todos los días.',
   null, 1),
  ('educar', 'Versión corta para una pieza',
   'Esta es acero 316L con baño de oro PVD: aguanta agua, sudor y perfume sin perder el brillo.', null, 2),
  ('educar', 'Para sumar autoridad',
   'Y no es solo lo que yo te diga: nuestros materiales tienen certificación SGS, que es internacional.',
   'Menciona el respaldo, pero nunca muestres ni entregues el certificado.', 3),

  ('demostrar', 'Para introducir la prueba',
   'Deja te muestro por qué te lo digo con tanta seguridad…', null, 1),
  ('demostrar', 'Durante la demostración',
   'Mira: la mojo, le paso el paño… y sigue igualita. Eso mismo es lo que te llevas a casa.', null, 2),
  ('demostrar', 'Para cerrar la idea',
   'Por eso te dura años y no meses. No es un gasto, es una pieza que se queda contigo.', null, 3),

  ('cerrar', 'Cierre por prueba',
   '¿Te la mido para que veas cómo te queda puesta?', null, 1),
  ('cerrar', 'Cierre por elección',
   '¿Con cuál te quedas, con esta o con esta?',
   'Elegir entre dos es más fácil que decidir entre sí y no.', 2),
  ('cerrar', 'Cierre suave, sin presión',
   '¿Te la aparto mientras lo piensas? Sin compromiso.', null, 3),
  ('cerrar', 'Cierre final',
   '¿Te la envuelvo?', null, 4),

  ('despedir', 'Agradecer',
   'Gracias por confiar en Lux. Úsala con todo, que para eso está hecha.', null, 1),
  ('despedir', 'Invitar a volver',
   'Cuando quieras combinarla con otra pieza o regalar algo especial, aquí te espero.', null, 2),
  ('despedir', 'Cierre cálido',
   'Que la disfrutes muchísimo. Cualquier cosa, te das la vuelta cuando gustes.', null, 3)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- MANEJO DE OBJECIONES
-- Una objeción es una pregunta disfrazada: se valida, se educa y —si se
-- puede— se demuestra. Nunca se discute.
-- ---------------------------------------------------------------------

insert into consejos (momento, etiqueta, texto, nota, orden) values
  ('objecion', 'Seguro se pone verde como todo.',
   'Te entiendo, a todas nos ha pasado con la bisutería barata. Pero eso pasa porque el dorado común es una capa finita que se despega. Esto es distinto — deja te lo demuestro.',
   null, 1),
  ('objecion', '¿Y esto es oro de verdad?',
   'Es baño de oro 18K PVD sobre acero quirúrgico. No es oro macizo —por eso tiene este precio accesible—, pero el oro va pegado al metal con un proceso tecnológico, así que no se cae ni se borra como el dorado común.',
   null, 2),
  ('objecion', 'Está muy caro.',
   'Te entiendo. Pero piensa que no es un accesorio que botas en un mes: te dura años sin mancharse ni irritarte. Al final sale más económico que comprar bisutería barata una y otra vez. ¿Quieres que te muestre una opción un poco más ligera?',
   null, 3),
  ('objecion', 'Lo voy a pensar.',
   'Claro, con toda calma. ¿Te la aparto por hoy mientras lo decides? Así no la pierdes, y sin ningún compromiso.',
   'Apartar es un cierre, no una despedida.', 4)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- LO QUE NUNCA SE HACE
-- ---------------------------------------------------------------------

insert into consejos (momento, etiqueta, texto, nota, orden) values
  ('nunca', 'Inventar cifras',
   'Nunca inventes precios ni prometas ganancias, y nunca uses urgencia falsa. Ante cualquier duda de precio, descuento o kit, consulta antes de cerrar.',
   'La honestidad es parte del producto.', 1),
  ('nunca', 'Mostrar el certificado SGS',
   'Se menciona, no se enseña. Es un documento interno del negocio, no material para el cliente.',
   null, 2),
  ('nunca', 'Descuidar una pieza',
   'No dejes varias piezas fuera de la vitrina al mismo tiempo sin control, ni le des la espalda a una pieza que esté sobre el mostrador.',
   null, 3),
  ('nunca', 'Ocultar una diferencia',
   'Ninguna diferencia de caja o de inventario se calla, por pequeña que sea. Avisar siempre es lo correcto.',
   null, 4),
  ('nunca', 'Hablar de más',
   'No hables mal de otras marcas ni de clientes, ni reveles el proveedor o datos internos del negocio. El lujo no necesita atacar.',
   null, 5)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- LOS TEXTOS DEL CATÁLOGO, SACADOS DE LA GUÍA
-- ---------------------------------------------------------------------

update textos set valor =
  'Joyería hipoalergénica de calidad real: no se mancha, no se pone verde y no irrita. Acero inoxidable 316L quirúrgico —el mismo de los instrumentos médicos—, aleación de titanio y baño de oro 18K PVD, con certificación SGS internacional. Es la última vez que tendrás que preocuparte porque una pieza se manche, te irrite o se ponga fea.',
  actualizado_en = now()
where clave = 'catalogo_intro' and trim(valor) = '';

update textos set valor =
  'Acero inoxidable 316L quirúrgico con aleación de titanio y baño de oro 18K PVD. No se mancha, no se pone verde y no irrita la piel, aunque la uses todos los días.',
  actualizado_en = now()
where clave = 'materiales_largo';

update textos set valor = 'Acero 316L · Titanio · Oro 18K PVD'
where clave = 'materiales_corto';

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACION
--   select momento, count(*) from consejos group by momento order by 1;
--     -> cerrar 4, demostrar 3, descubrir 3, despedir 3, educar 3,
--        nunca 5, objecion 4, paso 6, pilar 4, principio 4
-- =====================================================================
