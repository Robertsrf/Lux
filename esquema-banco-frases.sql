-- =====================================================================
-- Lux by Emory — el banco de frases de la casa
-- Ejecutar en el SQL Editor DESPUÉS de esquema-frases.sql
--
-- QUÉ ES
-- Las 222 frases de "Banco de frases, cuidados y slogans", cargadas tal
-- como están escritas. NO se generó este archivo a mano: lo produjo un
-- analizador leyendo el .md original, para que ni una coma se desvíe.
--
-- OJO CON EL CONTEO: la cabecera del documento dice 234 frases. Son 222.
-- Cada categoría va de 1 a N sin saltos y no falló ninguna línea, así que
-- el número de la cabecera es el que está de más.
--
-- LAS REGLAS DEL BANCO, QUE EL SISTEMA RESPETA
--   · El ID es estable y es la llave primaria: sirve para llevar cuenta
--     de lo ya mostrado sin depender del texto.
--   · Cada frase declara en qué superficies vale: TV (televisor),
--     VEND (apoyo de la vendedora), CAPTION (redes).
--   · En el televisor NUNCA salen dos de la misma categoría seguidas.
--     Eso lo resuelve la interfaz, alternando categorías por turnos.
--   · Las frases con {CIUDAD}, {ESTADO} o {PALABRA_CLAVE} se OMITEN si
--     el dato no está cargado, en vez de mostrarse con el hueco.
--   · Aquí no entra ni un precio, ni una cantidad de piezas, ni un
--     porcentaje. Esos viven en grupos_precio, tramos y kits.
-- =====================================================================

create table if not exists frases (
  id         text primary key,          -- 'SLG-01': estable, del banco
  categoria  text not null,
  superficie text[] not null,
  texto      text not null,
  orden      int  not null default 0,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create index if not exists frases_superficie_idx on frases using gin (superficie);
create index if not exists frases_categoria_idx  on frases (categoria, orden);

alter table frases enable row level security;

drop policy if exists frases_leer  on frases;
drop policy if exists frases_admin on frases;

-- Solo con sesión: el banco es material de la casa, no del público.
create policy frases_leer  on frases for select to authenticated using (activo or es_admin());
create policy frases_admin on frases for all to authenticated
  using (es_admin()) with check (es_admin());

grant select on frases to authenticated;

-- Nombre de cada categoría, para poder decirlo en pantalla.
create table if not exists frases_categorias (
  codigo text primary key,
  nombre text not null,
  tono   text,
  -- La nota interna del banco. La de CUI es la que importa: el oro PVD
  -- aguanta ultrasonido, pero el IP negro NO, y usar con una pieza negra
  -- la misma demostracion le arruina el acabado delante de la clienta.
  nota   text
);
alter table frases_categorias add column if not exists tono text;
alter table frases_categorias add column if not exists nota text;
alter table frases_categorias enable row level security;
drop policy if exists frases_cat_leer on frases_categorias;
create policy frases_cat_leer on frases_categorias for select to authenticated using (true);
grant select on frases_categorias to authenticated;

insert into frases_categorias (codigo, nombre, tono, nota) values
  ('SLG', 'Slogans firma', 'ancla de marca, para fijar identidad', null),
  ('NSB', 'Permanencia', 'promesa central, demostrable', null),
  ('MAT', 'Materiales', 'educar, dar autoridad', null),
  ('PIEL', 'Piel sensible', 'cálido, resuelve un dolor concreto', null),
  ('PRU', 'Prueba antes que promesa', 'reto/demostración en vivo', null),
  ('RCP', 'Recompra', 'fidelidad, mecanismo del negocio', null),
  ('MEN', 'Al menor', 'cercano, para quien compra para sí', null),
  ('MAY', 'Al mayor', 'oportunidad, negocio propio', null),
  ('REG', 'Regalo y ocasión', 'emotivo, memorable', null),
  ('ENV', 'Envíos y orgullo local', 'cercanía + alcance nacional', null),
  ('AUT', 'Autoridad silenciosa', 'Rolex. Sobrio, seguro, atemporal', null),
  ('CUI', 'Cuidado y limpieza', 'consejo útil, sin sugerir fragilidad', 'el oro 18K PVD resiste incluso el ultrasonido (adhesión molecular) — úsalo como demostración de durabilidad. El acabado IP/PVD negro se comporta distinto y revela la base al desgastarse: NO uses con él la misma demo de durabilidad del oro'),
  ('MIC', 'Micro-frases para loop de televisor', 'destello corto (2–6 palabras) entre piezas', null),
  ('OBJ', 'Objeciones en una línea', 'respuesta lista para la vendedora', null),
  ('CTA', 'Cierres y palabras clave', 'invita a comentar o escribir', 'Palabras clave activas: ORO, MENOR, MAYOR, KIT, PRECIOS, REGALO')
on conflict (codigo) do update
  set nombre = excluded.nombre, tono = excluded.tono, nota = excluded.nota;

-- ---------------------------------------------------------------------
-- LAS 222 FRASES
-- ---------------------------------------------------------------------

insert into frases (id, categoria, superficie, texto, orden) values
  ('SLG-01', 'SLG', array['TV', 'VEND', 'CAPTION'], 'El oro que no se borra.', 1),
  ('SLG-02', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Joyería que dura años, no meses.', 2),
  ('SLG-03', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Prueba antes que promesa.', 3),
  ('SLG-04', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Calidad real, con respaldo técnico.', 4),
  ('SLG-05', 'SLG', array['TV', 'VEND', 'CAPTION'], 'No se mancha. No se pone verde. No irrita.', 5),
  ('SLG-06', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Desde Sabana de Mendoza para toda Venezuela.', 6),
  ('SLG-07', 'SLG', array['TV', 'VEND', 'CAPTION'], 'La última vez que te preocupas por una joya que se daña.', 7),
  ('SLG-08', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Belleza que resiste el uso diario.', 8),
  ('SLG-09', 'SLG', array['TV', 'VEND', 'CAPTION'], 'No vendemos moda pasajera. Vendemos permanencia.', 9),
  ('SLG-10', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Ver es creer.', 10),
  ('SLG-11', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Hecha para tu piel. Hecha para durar.', 11),
  ('SLG-12', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Elegancia que no se descama.', 12),
  ('SLG-13', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Lux by Emory: el brillo que se queda.', 13),
  ('SLG-14', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Materiales certificados. Confianza comprobada.', 14),
  ('SLG-15', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Lo importado se nota. Y se comprueba.', 15),
  ('SLG-16', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Joyería seria, para quien va en serio.', 16),
  ('SLG-17', 'SLG', array['TV', 'VEND', 'CAPTION'], 'El acero de los quirófanos, en tu piel.', 17),
  ('SLG-18', 'SLG', array['TV', 'VEND', 'CAPTION'], 'Compra una vez. Disfruta por años.', 18),
  ('NSB-01', 'NSB', array['TV', 'CAPTION'], 'El dorado común es una capita que se cae. Esto no.', 1),
  ('NSB-02', 'NSB', array['TV', 'CAPTION'], 'Baño de oro PVD: el oro se adhiere al metal a nivel molecular.', 2),
  ('NSB-03', 'NSB', array['TV', 'CAPTION'], 'No es una capa que se despega. Es oro que se queda.', 3),
  ('NSB-04', 'NSB', array['TV', 'CAPTION'], 'Agua, sudor y perfume: no le hacen nada.', 4),
  ('NSB-05', 'NSB', array['TV', 'CAPTION'], 'El brillo del primer día, todos los días.', 5),
  ('NSB-06', 'NSB', array['TV', 'CAPTION'], 'Úsala a diario y sigue igualita.', 6),
  ('NSB-07', 'NSB', array['TV', 'CAPTION'], 'Aquí no hay dedo verde que valga.', 7),
  ('NSB-08', 'NSB', array['TV', 'CAPTION'], 'Cero óxido. Cero manchas. Mismo brillo.', 8),
  ('NSB-09', 'NSB', array['TV', 'CAPTION'], 'Resiste la rutina, no solo la foto.', 9),
  ('NSB-10', 'NSB', array['TV', 'CAPTION'], 'Lo que brilla hoy, brilla el próximo año.', 10),
  ('NSB-11', 'NSB', array['TV', 'CAPTION'], 'El PVD no es un baño común: es tecnología.', 11),
  ('NSB-12', 'NSB', array['TV', 'CAPTION'], 'No la cuidas con miedo. La usas con confianza.', 12),
  ('NSB-13', 'NSB', array['TV', 'CAPTION'], 'Se moja, se seca, y sigue impecable.', 13),
  ('NSB-14', 'NSB', array['TV', 'CAPTION'], 'Duradero por dentro, precioso por fuera.', 14),
  ('NSB-15', 'NSB', array['TV', 'CAPTION'], 'Un acabado que no se rinde con el tiempo.', 15),
  ('NSB-16', 'NSB', array['TV', 'CAPTION'], 'El lujo que no se descama.', 16),
  ('MAT-01', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Acero inoxidable 316L: el mismo de los instrumentos médicos.', 1),
  ('MAT-02', 'MAT', array['TV', 'VEND', 'CAPTION'], '316L: no libera níquel de forma dañina. Seguro sobre tu piel.', 2),
  ('MAT-03', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Mucho más resistente y duradero que el acero común.', 3),
  ('MAT-04', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Aleación de titanio: uno de los metales más biocompatibles del mundo.', 4),
  ('MAT-05', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Titanio: pensado para las pieles más sensibles.', 5),
  ('MAT-06', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Baño de oro 18K PVD: proceso tecnológico, no un baño cualquiera.', 6),
  ('MAT-07', 'MAT', array['TV', 'VEND', 'CAPTION'], 'PVD: mayor resistencia al desgaste y brillo que dura.', 7),
  ('MAT-08', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Certificación SGS: entidad internacional que analiza los materiales.', 8),
  ('MAT-09', 'MAT', array['TV', 'VEND', 'CAPTION'], 'SGS confirma que es seguro para la piel y cumple estándares de calidad.', 9),
  ('MAT-10', 'MAT', array['TV', 'VEND', 'CAPTION'], 'No es que lo digamos nosotros: está comprobado.', 10),
  ('MAT-11', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Cada pieza tiene procesos verificados y acabado profesional.', 11),
  ('MAT-12', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Materiales que resuelven problemas reales: alergias, irritación, manchas.', 12),
  ('MAT-13', 'MAT', array['TV', 'VEND', 'CAPTION'], 'El titanio reduce casi por completo la picazón y la irritación.', 13),
  ('MAT-14', 'MAT', array['TV', 'VEND', 'CAPTION'], '316L: la nobleza del acero quirúrgico, en joyería.', 14),
  ('MAT-15', 'MAT', array['TV', 'VEND', 'CAPTION'], 'El oro PVD mantiene su color mucho más tiempo que el dorado común.', 15),
  ('MAT-16', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Detrás de cada pieza hay un estándar, no una promesa.', 16),
  ('MAT-17', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Calidad certificada: sabes exactamente lo que te pones.', 17),
  ('MAT-18', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Biocompatible, hipoalergénico, verificado.', 18),
  ('MAT-19', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Tecnología de acabado, no suerte.', 19),
  ('MAT-20', 'MAT', array['TV', 'VEND', 'CAPTION'], 'El respaldo técnico es lo que separa una joya de una bisutería.', 20),
  ('MAT-21', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Tres materiales nobles, un mismo estándar: durar.', 21),
  ('MAT-22', 'MAT', array['TV', 'VEND', 'CAPTION'], 'Lo que ves es lo que es. Y está comprobado.', 22),
  ('PIEL-01', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Si toda la bisutería te irrita, esto es para ti.', 1),
  ('PIEL-02', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Hipoalergénica de verdad: no pica, no enrojece, no mancha.', 2),
  ('PIEL-03', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Piel sensible, tranquila: material apto para uso diario.', 3),
  ('PIEL-04', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'El problema nunca fue tu piel. Era el material barato.', 4),
  ('PIEL-05', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Póntela todos los días, incluso en piel muy delicada.', 5),
  ('PIEL-06', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Segura sobre la piel, comprobado por laboratorio.', 6),
  ('PIEL-07', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Sin picazón, sin ardor, sin marcas rojas.', 7),
  ('PIEL-08', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Joyería que cuida tu piel mientras te embellece.', 8),
  ('PIEL-09', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Del tipo de material que se usa en medicina. Por algo será.', 9),
  ('PIEL-10', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Para quien ya se rindió con la bisutería que le irritaba.', 10),
  ('PIEL-11', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Bonita por fuera, amable con tu piel por dentro.', 11),
  ('PIEL-12', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Titanio y 316L: el dúo de las pieles difíciles.', 12),
  ('PIEL-13', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'Nada de alergias. Solo elegancia.', 13),
  ('PIEL-14', 'PIEL', array['TV', 'VEND', 'CAPTION'], 'La joya que por fin puedes no quitarte.', 14),
  ('PRU-01', 'PRU', array['TV', 'CAPTION'], 'La mojo, le echo perfume, la froto… y sigue igual.', 1),
  ('PRU-02', 'PRU', array['TV', 'CAPTION'], 'No te lo cuento: te lo demuestro.', 2),
  ('PRU-03', 'PRU', array['TV', 'CAPTION'], 'Siete días sin quitármela. Ducha, gym, perfume, playa. Intacta.', 3),
  ('PRU-04', 'PRU', array['TV', 'CAPTION'], 'Ponla a prueba. Ese es el punto.', 4),
  ('PRU-05', 'PRU', array['TV', 'CAPTION'], 'Aquí las joyas se demuestran, no se prometen.', 5),
  ('PRU-06', 'PRU', array['TV', 'CAPTION'], 'Sal, sudor y sol: la prueba real.', 6),
  ('PRU-07', 'PRU', array['TV', 'CAPTION'], 'La gente no me cree… hasta que lo ve.', 7),
  ('PRU-08', 'PRU', array['TV', 'CAPTION'], 'Míralo con tus ojos: cero cambios.', 8),
  ('PRU-09', 'PRU', array['TV', 'CAPTION'], 'La mejor garantía es la prueba en vivo.', 9),
  ('PRU-10', 'PRU', array['TV', 'CAPTION'], 'Si aguanta el uso diario, aguanta todo.', 10),
  ('PRU-11', 'PRU', array['TV', 'CAPTION'], 'Le hago de todo. Y no le pasa nada.', 11),
  ('PRU-12', 'PRU', array['TV', 'CAPTION'], 'La cámara no miente. La joya tampoco.', 12),
  ('RCP-01', 'RCP', array['VEND', 'CAPTION'], 'El secreto no es vender una vez: es que vuelvan.', 1),
  ('RCP-02', 'RCP', array['VEND', 'CAPTION'], 'La calidad trae al cliente de regreso.', 2),
  ('RCP-03', 'RCP', array['VEND', 'CAPTION'], 'No es una venta. Es un cliente.', 3),
  ('RCP-04', 'RCP', array['VEND', 'CAPTION'], 'Vuelven porque no se decepcionan.', 4),
  ('RCP-05', 'RCP', array['VEND', 'CAPTION'], 'Un cliente que confía, compra otra vez.', 5),
  ('RCP-06', 'RCP', array['VEND', 'CAPTION'], 'Mientras más rotas y regresas, mejor precio te doy.', 6),
  ('RCP-07', 'RCP', array['VEND', 'CAPTION'], 'Cada compra te acerca a un mejor precio.', 7),
  ('RCP-08', 'RCP', array['VEND', 'CAPTION'], 'Tus clientes vuelven por la calidad. Tú vuelves conmigo.', 8),
  ('RCP-09', 'RCP', array['VEND', 'CAPTION'], 'Aquí premiamos a quien confía y repite.', 9),
  ('RCP-10', 'RCP', array['VEND', 'CAPTION'], 'Un buen producto se recomienda solo.', 10),
  ('RCP-11', 'RCP', array['VEND', 'CAPTION'], 'La primera compra prueba la calidad. La segunda la confirma.', 11),
  ('RCP-12', 'RCP', array['VEND', 'CAPTION'], 'Fidelidad no es descuento: es que valió la pena.', 12),
  ('MEN-01', 'MEN', array['TV', 'VEND'], 'Una pieza para ti, para durar.', 1),
  ('MEN-02', 'MEN', array['TV', 'VEND'], 'Regálate calidad que no se pone fea.', 2),
  ('MEN-03', 'MEN', array['TV', 'VEND'], 'La joya que puedes usar hoy, mañana y el año que viene.', 3),
  ('MEN-04', 'MEN', array['TV', 'VEND'], 'Elegancia diaria sin miedo a estropearla.', 4),
  ('MEN-05', 'MEN', array['TV', 'VEND'], 'Compra tu pieza y olvídate del dedo verde.', 5),
  ('MEN-06', 'MEN', array['TV', 'VEND'], 'Un detalle bonito que te acompaña de día y de noche.', 6),
  ('MEN-07', 'MEN', array['TV', 'VEND'], 'Del trabajo a la cena, con la misma pieza.', 7),
  ('MEN-08', 'MEN', array['TV', 'VEND'], 'Tu accesorio favorito, ahora en versión que sí dura.', 8),
  ('MEN-09', 'MEN', array['TV', 'VEND'], 'Calidad de joyería fina, para tu día a día.', 9),
  ('MEN-10', 'MEN', array['TV', 'VEND'], 'Menos piezas, mejores piezas.', 10),
  ('MEN-11', 'MEN', array['TV', 'VEND'], 'Una compra que no vas a lamentar.', 11),
  ('MEN-12', 'MEN', array['TV', 'VEND'], 'Lo que te pones habla de ti. Que hable bien.', 12),
  ('MAY-01', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Compra al mayor y arma tu propio negocio.', 1),
  ('MAY-02', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Es tu negocio: tú le pones el precio, tuya es la ganancia.', 2),
  ('MAY-03', 'MAY', array['TV', 'VEND', 'CAPTION'], 'No eres vendedora de nadie. Eres dueña.', 3),
  ('MAY-04', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Inventario que no se vence ni se daña.', 4),
  ('MAY-05', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Pequeña, liviana y fácil de enviar a todo el país.', 5),
  ('MAY-06', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Todo el mundo usa accesorios… y los vuelve a comprar.', 6),
  ('MAY-07', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Mientras más piezas, mejor precio por pieza.', 7),
  ('MAY-08', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Empiezas con poco y creces a tu ritmo.', 8),
  ('MAY-09', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Solo necesitas tu teléfono, buenas fotos y ganas.', 9),
  ('MAY-10', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Vende calidad y tus clientas regresan solas.', 10),
  ('MAY-11', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Sin local, sin experiencia, sin complicarte.', 11),
  ('MAY-12', 'MAY', array['TV', 'VEND', 'CAPTION'], 'El mercado de los accesorios nunca se acaba.', 12),
  ('MAY-13', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Surte a tu zona con joyería que sí responde.', 13),
  ('MAY-14', 'MAY', array['TV', 'VEND', 'CAPTION'], 'Kits surtidos, al menor y al mayor. Pregunta por los tuyos.', 14),
  ('REG-01', 'REG', array['TV', 'CAPTION'], 'El regalo que sí dura.', 1),
  ('REG-02', 'REG', array['TV', 'CAPTION'], 'Deja de regalar cosas que se dañan en un mes.', 2),
  ('REG-03', 'REG', array['TV', 'CAPTION'], 'Un regalo que se recuerda cada vez que se lo ponen.', 3),
  ('REG-04', 'REG', array['TV', 'CAPTION'], 'El empaque impresiona. Lo de adentro, más.', 4),
  ('REG-05', 'REG', array['TV', 'CAPTION'], 'Regala permanencia, no algo pasajero.', 5),
  ('REG-06', 'REG', array['TV', 'CAPTION'], 'Para la persona que se merece algo que dure.', 6),
  ('REG-07', 'REG', array['TV', 'CAPTION'], 'Un detalle premium, de principio a fin.', 7),
  ('REG-08', 'REG', array['TV', 'CAPTION'], 'Se abre bonito. Se usa por años.', 8),
  ('REG-09', 'REG', array['TV', 'CAPTION'], 'El regalo que no pasa de moda.', 9),
  ('REG-10', 'REG', array['TV', 'CAPTION'], 'Elegancia envuelta, lista para sorprender.', 10),
  ('REG-11', 'REG', array['TV', 'CAPTION'], 'Un obsequio con respaldo: certificado y duradero.', 11),
  ('REG-12', 'REG', array['TV', 'CAPTION'], 'Regala algo que no tenga que reemplazarse.', 12),
  ('ENV-01', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Enviamos a toda Venezuela.', 1),
  ('ENV-02', 'ENV', array['TV', 'VEND', 'CAPTION'], 'No importa en qué parte del país estés: tu joya llega.', 2),
  ('ENV-03', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Distribuidor oficial en Sabana de Mendoza, municipio Sucre.', 3),
  ('ENV-04', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Empezamos en casa. Vamos por todo el país.', 4),
  ('ENV-05', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Bien empacado y seguro, hasta tu ciudad.', 5),
  ('ENV-06', 'ENV', array['TV', 'VEND', 'CAPTION'], 'De {CIUDAD} a donde estés: te llega.', 6),
  ('ENV-07', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Tu pedido, protegido de aquí hasta {ESTADO}.', 7),
  ('ENV-08', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Orgullo de Sabana de Mendoza, calidad para toda Venezuela.', 8),
  ('ENV-09', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Caracas, Maracaibo, Valencia, Barquisimeto… llegamos.', 9),
  ('ENV-10', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Compres una pieza o un kit, te llega igual de seguro.', 10),
  ('ENV-11', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Cercanía local, alcance nacional.', 11),
  ('ENV-12', 'ENV', array['TV', 'VEND', 'CAPTION'], 'Envíos a todo el país, sin excusas de distancia.', 12),
  ('AUT-01', 'AUT', array['TV'], 'El lujo no se grita. Se demuestra.', 1),
  ('AUT-02', 'AUT', array['TV'], 'La calidad no necesita adornos. Se sostiene sola.', 2),
  ('AUT-03', 'AUT', array['TV'], 'Consistencia: la misma calidad, en cada pieza.', 3),
  ('AUT-04', 'AUT', array['TV'], 'No perseguimos tendencias. Construimos permanencia.', 4),
  ('AUT-05', 'AUT', array['TV'], 'El detalle es el lujo.', 5),
  ('AUT-06', 'AUT', array['TV'], 'Confianza que se gana con hechos, no con frases.', 6),
  ('AUT-07', 'AUT', array['TV'], 'Lo atemporal nunca pasa de moda.', 7),
  ('AUT-08', 'AUT', array['TV'], 'Menos ruido, más respaldo.', 8),
  ('AUT-09', 'AUT', array['TV'], 'Una marca que responde por lo que vende.', 9),
  ('AUT-10', 'AUT', array['TV'], 'Elegancia serena, sin exageraciones.', 10),
  ('AUT-11', 'AUT', array['TV'], 'La escasez es real: cuando hay cupo, es cupo de verdad.', 11),
  ('AUT-12', 'AUT', array['TV'], 'Hacemos las cosas con calma. Y se nota.', 12),
  ('AUT-13', 'AUT', array['TV'], 'Autoridad tranquila: sabemos de lo que hablamos.', 13),
  ('AUT-14', 'AUT', array['TV'], 'El estándar no se negocia.', 14),
  ('CUI-01', 'CUI', array['VEND', 'CAPTION'], 'Resiste el día a día; un paño suave la mantiene como nueva.', 1),
  ('CUI-02', 'CUI', array['VEND', 'CAPTION'], 'Para brillo máximo: pásale un paño de microfibra seco.', 2),
  ('CUI-03', 'CUI', array['VEND', 'CAPTION'], '¿Se ensució? Agua tibia, jabón neutro suave y secar bien.', 3),
  ('CUI-04', 'CUI', array['VEND', 'CAPTION'], 'Sécala completamente antes de guardarla: brillo intacto.', 4),
  ('CUI-05', 'CUI', array['VEND', 'CAPTION'], 'Guárdala en su bolsita de marca para evitar rayones.', 5),
  ('CUI-06', 'CUI', array['VEND', 'CAPTION'], 'Piezas separadas al guardar: cada una conserva su acabado.', 6),
  ('CUI-07', 'CUI', array['VEND', 'CAPTION'], 'No necesita químicos agresivos; con poco, luce mucho.', 7),
  ('CUI-08', 'CUI', array['VEND', 'CAPTION'], 'El oro PVD aguanta hasta la limpieza ultrasónica. Eso es adhesión real.', 8),
  ('CUI-09', 'CUI', array['VEND', 'CAPTION'], 'Un secado rápido después del agua y queda impecable.', 9),
  ('CUI-10', 'CUI', array['VEND', 'CAPTION'], 'Nada de abrasivos ni esponjas duras: no hacen falta.', 10),
  ('CUI-11', 'CUI', array['VEND', 'CAPTION'], 'Para el cliente: la usas con confianza, la cuidas sin esfuerzo.', 11),
  ('CUI-12', 'CUI', array['VEND', 'CAPTION'], 'Un frasco, un paño y tu joya: limpieza en un minuto.', 12),
  ('CUI-13', 'CUI', array['VEND', 'CAPTION'], 'Consejo pro: guárdala seca y lejos de humedad estancada.', 13),
  ('CUI-14', 'CUI', array['VEND', 'CAPTION'], 'Limpieza semanal ligera = brillo de estreno todo el año.', 14),
  ('CUI-15', 'CUI', array['VEND', 'CAPTION'], 'El 316L resiste; aun así, tratarla bien la mantiene perfecta.', 15),
  ('CUI-16', 'CUI', array['VEND', 'CAPTION'], 'La limpieza en vivo es la mejor prueba: se limpia y sigue igual.', 16),
  ('CUI-17', 'CUI', array['VEND', 'CAPTION'], 'Si se opaca por crema o maquillaje, un paño la revive al instante.', 17),
  ('CUI-18', 'CUI', array['VEND', 'CAPTION'], 'Cuidarla no es protegerla del daño: es lucirla al máximo.', 18),
  ('CUI-19', 'CUI', array['VEND', 'CAPTION'], 'Un estuche cerrado la mantiene lista para el próximo uso.', 19),
  ('CUI-20', 'CUI', array['VEND', 'CAPTION'], 'Ultrasonido para el oro; para el negro IP, solo paño suave.', 20),
  ('CUI-21', 'CUI', array['VEND', 'CAPTION'], 'La rutina de cuidado es corta porque la pieza es buena.', 21),
  ('CUI-22', 'CUI', array['VEND', 'CAPTION'], 'Limpia, seca, guarda. Tres pasos y luce nueva.', 22),
  ('MIC-01', 'MIC', array['TV'], 'No se borra.', 1),
  ('MIC-02', 'MIC', array['TV'], 'No se pone verde.', 2),
  ('MIC-03', 'MIC', array['TV'], 'No irrita.', 3),
  ('MIC-04', 'MIC', array['TV'], 'Acero 316L.', 4),
  ('MIC-05', 'MIC', array['TV'], 'Titanio hipoalergénico.', 5),
  ('MIC-06', 'MIC', array['TV'], 'Oro 18K PVD.', 6),
  ('MIC-07', 'MIC', array['TV'], 'Certificación SGS.', 7),
  ('MIC-08', 'MIC', array['TV'], 'Hecha para durar.', 8),
  ('MIC-09', 'MIC', array['TV'], 'Ver es creer.', 9),
  ('MIC-10', 'MIC', array['TV'], 'Prueba antes que promesa.', 10),
  ('MIC-11', 'MIC', array['TV'], 'Calidad real.', 11),
  ('MIC-12', 'MIC', array['TV'], 'Brillo que se queda.', 12),
  ('MIC-13', 'MIC', array['TV'], 'Para toda Venezuela.', 13),
  ('MIC-14', 'MIC', array['TV'], 'Al menor y al mayor.', 14),
  ('MIC-15', 'MIC', array['TV'], 'Elegancia que resiste.', 15),
  ('MIC-16', 'MIC', array['TV'], 'El lujo se demuestra.', 16),
  ('MIC-17', 'MIC', array['TV'], 'Piel sensible, tranquila.', 17),
  ('MIC-18', 'MIC', array['TV'], 'Lux by Emory.', 18),
  ('OBJ-01', 'OBJ', array['VEND'], '"¿Se pone verde?" → El dorado común sí; esto es oro PVD sobre 316L, no una capa que se cae.', 1),
  ('OBJ-02', 'OBJ', array['VEND'], '"Me irrita todo" → Es el material barato; esto es acero quirúrgico con titanio, apto para piel muy sensible.', 2),
  ('OBJ-03', 'OBJ', array['VEND'], '"¿Llega a mi ciudad?" → Enviamos a toda Venezuela, bien empacado y seguro hasta tu estado.', 3),
  ('OBJ-04', 'OBJ', array['VEND'], '"¿Por qué es más caro?" → Tiene certificación SGS: sabes exactamente lo que te pones.', 4),
  ('OBJ-05', 'OBJ', array['VEND'], '"¿De verdad no se daña?" → Míralo: se moja, se le echa perfume, y sigue igual. Prueba antes que promesa.', 5),
  ('OBJ-06', 'OBJ', array['VEND'], '"¿Es como la bisutería normal?" → No: materiales certificados y acabado que resiste el uso diario.', 6),
  ('OBJ-07', 'OBJ', array['VEND'], '"No sé si me durará" → Está hecha para años, no meses; el brillo se mantiene con uso diario.', 7),
  ('OBJ-08', 'OBJ', array['VEND'], '"¿Sirve para revender?" → Sí: inventario que no se vence, fácil de enviar y con clientas que repiten.', 8),
  ('OBJ-09', 'OBJ', array['VEND'], '"¿Necesito experiencia?" → No: tu teléfono, buenas fotos y ganas. Empiezas con poco.', 9),
  ('OBJ-10', 'OBJ', array['VEND'], '"¿Cuánto cuesta el kit?" → Estamos renovando inventario; los kits al menor y al mayor se anuncian pronto. Te aviso apenas salgan.', 10),
  ('OBJ-11', 'OBJ', array['VEND'], '"¿Y si se me pone fea con el tiempo?" → Ese es justo el problema que resolvemos: no se mancha ni se descama.', 11),
  ('OBJ-12', 'OBJ', array['VEND'], '"¿Puedo bañarme con ella?" → Sí; agua, sudor y perfume no la afectan. Solo sécala después.', 12),
  ('CTA-01', 'CTA', array['CAPTION', 'VEND'], '¿Quieres ver los modelos? Escríbeme "{PALABRA_CLAVE}" 👇', 1),
  ('CTA-02', 'CTA', array['CAPTION', 'VEND'], '¿De qué ciudad nos ves? Comenta abajo 👇', 2),
  ('CTA-03', 'CTA', array['CAPTION', 'VEND'], '¿Te ha pasado lo del dedo verde? Cuéntame 👇', 3),
  ('CTA-04', 'CTA', array['CAPTION', 'VEND'], '¿Empezamos? Escríbeme y te digo cómo 👇', 4),
  ('CTA-05', 'CTA', array['CAPTION', 'VEND'], '¿Para quién sería este regalo? Etiquétalo 👇', 5),
  ('CTA-06', 'CTA', array['CAPTION', 'VEND'], '¿A qué {ESTADO} te lo enviamos? Comenta 👇', 6),
  ('CTA-07', 'CTA', array['CAPTION', 'VEND'], '¿Lo quieres para ti o para revender? Escríbeme 👇', 7),
  ('CTA-08', 'CTA', array['CAPTION', 'VEND'], '¿Sabías qué era SGS? Comenta 👇', 8),
  ('CTA-09', 'CTA', array['CAPTION', 'VEND'], 'Escríbeme "MAYOR" y te cuento cómo empezar 👇', 9),
  ('CTA-10', 'CTA', array['CAPTION', 'VEND'], '¿Cuál pieza te gustó más? Vótala en los comentarios 👇', 10),
  ('CTA-11', 'CTA', array['CAPTION', 'VEND'], 'Te aviso apenas salgan los kits: escríbeme "KIT" 👇', 11),
  ('CTA-12', 'CTA', array['CAPTION', 'VEND'], '¿Quieres la lista de precios sugeridos? Comenta "PRECIOS" 👇', 12)
on conflict (id) do update
  set categoria  = excluded.categoria,
      superficie = excluded.superficie,
      texto      = excluded.texto,
      orden      = excluded.orden;

-- ---------------------------------------------------------------------
-- LOS DATOS QUE RELLENAN LOS HUECOS
--
-- Cuatro frases traen {CIUDAD}, {ESTADO} o {PALABRA_CLAVE}. Mientras el
-- dato esté vacío, la interfaz las salta: mejor una frase menos que una
-- frase con una llave sin cerrar en un televisor.
--
-- La ciudad sale del pie del catálogo, que ya la dice. El estado se deja
-- vacío a propósito: no me toca inventarlo.
-- ---------------------------------------------------------------------

insert into textos (clave, valor) values
  ('ciudad', 'Sabana de Mendoza'),
  ('estado', '')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- SE RETIRAN LAS OCHO FRASES QUE PUSE A MANO
-- Eran un recorte de la Guía, hecho antes de tener este banco. Ahora
-- sobran: el banco trae las mismas ideas mejor escritas.
-- ---------------------------------------------------------------------

delete from consejos where momento = 'vitrina';

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select count(*) from frases;                        -> 222
--   select categoria, count(*) from frases group by 1;  -> 15 categorías
--   select count(*) from frases where 'TV' = any(superficie);   -> 164
--   select count(*) from frases where 'VEND' = any(superficie); -> 150
--   select count(*) from consejos where momento = 'vitrina';    -> 0
-- =====================================================================
