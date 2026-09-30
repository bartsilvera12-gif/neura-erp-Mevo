-- =============================================================================
-- Sorteo Mevo 4 motos — configurar el flujo "sorteo 4 motos"
--
-- Qué hace (en el schema del tenant Mevo, resuelto solo):
--   1) Clona TODO el flujo "Sorteo mevo 1 Toyota auris + 3 motos" (nodos,
--      opciones, bloques, flow_config y reglas de recontacto) dentro del flujo
--      ya creado "sorteo 4 motos".
--   2) Enlaza el flujo destino al sorteo "Sorteo Mevo 4 motos" (chat_flows.sorteo_id).
--   3) Reemplaza el nodo de bienvenida con el mensaje nuevo + imagen + las 5
--      opciones de boletas (5.000 / 10.000 / 20.000 / 50.000 / 100.000 Gs).
--
-- Uso: pegar tal cual en el SQL Editor de Supabase (service_role) y ejecutar.
-- Idempotente: se puede correr varias veces; siempre deja el flujo destino
-- igual al origen + los overrides del final.
--
-- Nota de compatibilidad: el editor de Supabase no tolera dollar-quoting
-- anidado ni format() posicional, así que este script usa un unico bloque DO
-- y arma las sentencias con %I / %L / %s.
-- =============================================================================

DO $do$
DECLARE
  -- ---------------------------------------------------------------- parámetros
  v_empresa_like  text := '%mevo%';     -- empresa (zentra_erp.empresas.nombre)
  v_src_like      text := '%auris%';    -- flujo ORIGEN  (Toyota auris + 3 motos)
  v_dst_like      text := '%4 motos%';  -- flujo DESTINO (sorteo 4 motos)
  v_sorteo_like   text := '%4 motos%';  -- sorteo (sorteos.nombre)

  v_imagen_url    text := 'https://res.cloudinary.com/drupicep5/image/upload/v1790805557/imagen_2026-09-30_185909149_evhxk0.png';

  v_bienvenida    text := '👋 ¡Holaaa! Bienvenido a MEVO SORTEOS 🎟️

🏍️ ¡PARTICIPÁ POR 4 MOTOS!

🔥 Kenton GTR 200 LTD 2026
🔥 Kenton Shark 2026
🔥 Kenton Storm 2026
🔥 Kenton Canyon 2026

🎟️ ¡TODO POR 5 MIL’I!
⚠️ BOLETAS LIMITADAS

📅 Fechas:
10 de octubre — GTR 200 LTD
17 de octubre — Shark
24 de octubre — Storm
31 de octubre — Canyon

🤩 ¡Con 1 boleta ya participás por las 4 motos!';

  v_cta           text := '🎟️ Elegí tu paquete de boletas 👇';

  -- ---------------------------------------------------------------- internos
  v_empresa_id    uuid;
  v_empresa_nom   text;
  v_schema        text;
  v_sorteo_schema text;
  v_src_flow      text;
  v_dst_flow      text;
  v_sorteo_id     uuid;
  v_welcome       text;
  v_next_node     text;
  v_cfg           jsonb;
  v_cols          text;
  v_cols_pref     text;
  v_n             bigint;
BEGIN
  PERFORM set_config('lock_timeout', '8s', true);
  PERFORM set_config('statement_timeout', '120s', true);

  -- 1) Empresa + schema de datos -------------------------------------------
  SELECT count(*) INTO v_n FROM zentra_erp.empresas e WHERE e.nombre ILIKE v_empresa_like;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Empresa: se esperaba 1 coincidencia para %, se encontraron %', v_empresa_like, v_n;
  END IF;

  SELECT e.id, e.nombre, coalesce(nullif(btrim(e.data_schema), ''), 'zentra_erp')
    INTO v_empresa_id, v_empresa_nom, v_schema
  FROM zentra_erp.empresas e
  WHERE e.nombre ILIKE v_empresa_like;

  IF to_regclass(format('%I.chat_flows', v_schema)) IS NULL THEN
    RAISE EXCEPTION 'El schema % no tiene chat_flows', v_schema;
  END IF;
  RAISE NOTICE 'Empresa: % (%) — schema: %', v_empresa_nom, v_empresa_id, v_schema;

  -- 2) Flujo origen y flujo destino ----------------------------------------
  EXECUTE format(
    'SELECT count(*), min(flow_code) FROM %I.chat_flows
      WHERE empresa_id = %L AND (label ILIKE %L OR flow_code ILIKE %L)',
    v_schema, v_empresa_id, v_src_like, v_src_like
  ) INTO v_n, v_src_flow;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Flujo ORIGEN: se esperaba 1 coincidencia para %, se encontraron %', v_src_like, v_n;
  END IF;

  EXECUTE format(
    'SELECT count(*), min(flow_code) FROM %I.chat_flows
      WHERE empresa_id = %L AND (label ILIKE %L OR flow_code ILIKE %L)',
    v_schema, v_empresa_id, v_dst_like, v_dst_like
  ) INTO v_n, v_dst_flow;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Flujo DESTINO: se esperaba 1 coincidencia para %, se encontraron %', v_dst_like, v_n;
  END IF;

  IF v_src_flow = v_dst_flow THEN
    RAISE EXCEPTION 'Origen y destino resolvieron al mismo flujo (%). Ajustá v_src_like / v_dst_like.', v_src_flow;
  END IF;
  RAISE NOTICE 'Origen: %  ->  Destino: %', v_src_flow, v_dst_flow;

  -- 3) Sorteo destino -------------------------------------------------------
  v_sorteo_schema := CASE
    WHEN to_regclass(format('%I.sorteos', v_schema)) IS NOT NULL THEN v_schema
    ELSE 'zentra_erp'
  END;

  EXECUTE format(
    'SELECT count(*), min(id::text)::uuid FROM %I.sorteos
      WHERE empresa_id = %L AND nombre ILIKE %L',
    v_sorteo_schema, v_empresa_id, v_sorteo_like
  ) INTO v_n, v_sorteo_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Sorteo: se esperaba 1 coincidencia para %, se encontraron %', v_sorteo_like, v_n;
  END IF;
  RAISE NOTICE 'Sorteo destino: % (schema %)', v_sorteo_id, v_sorteo_schema;

  -- 4) Limpiar el flujo destino (opciones y bloques caen por FK) ------------
  EXECUTE format(
    'DELETE FROM %I.chat_flow_nodes WHERE empresa_id = %L AND flow_code = %L',
    v_schema, v_empresa_id, v_dst_flow
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Nodos previos eliminados en destino: %', v_n;

  -- 5) Clonar NODOS (lista de columnas dinámica: tolera columnas nuevas) ----
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = v_schema AND table_name = 'chat_flow_nodes'
    AND column_name NOT IN ('id', 'flow_code', 'created_at', 'updated_at')
    AND is_generated = 'NEVER';

  EXECUTE format(
    'INSERT INTO %I.chat_flow_nodes (flow_code, %s)
     SELECT %L, %s FROM %I.chat_flow_nodes
      WHERE empresa_id = %L AND flow_code = %L',
    v_schema, v_cols, v_dst_flow, v_cols, v_schema, v_empresa_id, v_src_flow
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'El flujo origen % no tiene nodos', v_src_flow;
  END IF;
  RAISE NOTICE 'Nodos clonados: %', v_n;

  -- 6) Clonar OPCIONES ------------------------------------------------------
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg('o.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols, v_cols_pref
  FROM information_schema.columns
  WHERE table_schema = v_schema AND table_name = 'chat_flow_options'
    AND column_name NOT IN ('id', 'node_id', 'created_at', 'updated_at')
    AND is_generated = 'NEVER';

  EXECUTE format(
    'INSERT INTO %I.chat_flow_options (node_id, %s)
     SELECT dn.id, %s
       FROM %I.chat_flow_options o
       JOIN %I.chat_flow_nodes sn
         ON sn.id = o.node_id AND sn.empresa_id = %L AND sn.flow_code = %L
       JOIN %I.chat_flow_nodes dn
         ON dn.empresa_id = sn.empresa_id AND dn.flow_code = %L AND dn.node_code = sn.node_code',
    v_schema, v_cols, v_cols_pref, v_schema, v_schema, v_empresa_id, v_src_flow, v_schema, v_dst_flow
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Opciones clonadas: %', v_n;

  -- 7) Clonar BLOQUES (texto / imagen / botones) ---------------------------
  IF to_regclass(format('%I.chat_flow_node_blocks', v_schema)) IS NOT NULL THEN
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
           string_agg('b.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO v_cols, v_cols_pref
    FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'chat_flow_node_blocks'
      AND column_name NOT IN ('id', 'node_id', 'created_at', 'updated_at')
      AND is_generated = 'NEVER';

    EXECUTE format(
      'INSERT INTO %I.chat_flow_node_blocks (node_id, %s)
       SELECT dn.id, %s
         FROM %I.chat_flow_node_blocks b
         JOIN %I.chat_flow_nodes sn
           ON sn.id = b.node_id AND sn.empresa_id = %L AND sn.flow_code = %L
         JOIN %I.chat_flow_nodes dn
           ON dn.empresa_id = sn.empresa_id AND dn.flow_code = %L AND dn.node_code = sn.node_code',
      v_schema, v_cols, v_cols_pref, v_schema, v_schema, v_empresa_id, v_src_flow, v_schema, v_dst_flow
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'Bloques clonados: %', v_n;
  END IF;

  -- 8) Nodo de bienvenida del destino y nodo siguiente tras elegir cantidad -
  EXECUTE format(
    'SELECT node_code FROM %I.chat_flow_nodes
      WHERE empresa_id = %L AND flow_code = %L AND is_active
      ORDER BY (node_code ~* ''bienvenid|inicio|welcome|start'') DESC, sort_order ASC
      LIMIT 1',
    v_schema, v_empresa_id, v_dst_flow
  ) INTO v_welcome;
  IF v_welcome IS NULL THEN
    RAISE EXCEPTION 'No se pudo identificar el nodo de bienvenida en %', v_dst_flow;
  END IF;

  EXECUTE format(
    'SELECT o.next_node_code
       FROM %I.chat_flow_options o
       JOIN %I.chat_flow_nodes n ON n.id = o.node_id
      WHERE n.empresa_id = %L AND n.flow_code = %L
        AND o.next_node_code IS NOT NULL
        AND o.option_payload ?| array[''cantidad'',''cantidad_boletos'',''cantidad_boletas'',''cantidad_numeros'',''boletas'',''boletos'']
      ORDER BY n.sort_order, o.sort_order
      LIMIT 1',
    v_schema, v_schema, v_empresa_id, v_dst_flow
  ) INTO v_next_node;

  IF v_next_node IS NULL THEN
    -- Fallback: el destino del primer botón del propio nodo de bienvenida clonado.
    EXECUTE format(
      'SELECT o.next_node_code
         FROM %I.chat_flow_options o
         JOIN %I.chat_flow_nodes n ON n.id = o.node_id
        WHERE n.empresa_id = %L AND n.flow_code = %L AND n.node_code = %L
          AND o.next_node_code IS NOT NULL
        ORDER BY o.sort_order LIMIT 1',
      v_schema, v_schema, v_empresa_id, v_dst_flow, v_welcome
    ) INTO v_next_node;
  END IF;
  IF v_next_node IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el nodo siguiente a la elección de boletas en %', v_dst_flow;
  END IF;
  RAISE NOTICE 'Bienvenida: %  ->  siguiente: %', v_welcome, v_next_node;

  -- 9) Override del nodo de bienvenida: mensaje + imagen + 5 opciones -------
  EXECUTE format(
    'UPDATE %I.chat_flow_nodes
        SET message_text = %L, node_type = ''buttons'', is_active = true
      WHERE empresa_id = %L AND flow_code = %L AND node_code = %L',
    v_schema, v_bienvenida, v_empresa_id, v_dst_flow, v_welcome
  );

  EXECUTE format(
    'DELETE FROM %I.chat_flow_options o
      USING %I.chat_flow_nodes n
      WHERE o.node_id = n.id AND n.empresa_id = %L AND n.flow_code = %L AND n.node_code = %L',
    v_schema, v_schema, v_empresa_id, v_dst_flow, v_welcome
  );

  IF to_regclass(format('%I.chat_flow_node_blocks', v_schema)) IS NOT NULL THEN
    EXECUTE format(
      'DELETE FROM %I.chat_flow_node_blocks b
        USING %I.chat_flow_nodes n
        WHERE b.node_id = n.id AND n.empresa_id = %L AND n.flow_code = %L AND n.node_code = %L',
      v_schema, v_schema, v_empresa_id, v_dst_flow, v_welcome
    );

    EXECUTE format(
      'INSERT INTO %I.chat_flow_node_blocks (empresa_id, node_id, block_type, content_text, media_url, sort_order)
       SELECT n.empresa_id, n.id, v.block_type, v.content_text, v.media_url, v.sort_order
         FROM %I.chat_flow_nodes n
         CROSS JOIN (VALUES
           (''image'',   %L::text, %L::text, 10),
           (''buttons'', %L::text, NULL::text, 20)
         ) AS v(block_type, content_text, media_url, sort_order)
        WHERE n.empresa_id = %L AND n.flow_code = %L AND n.node_code = %L',
      v_schema, v_schema, v_bienvenida, v_imagen_url, v_cta, v_empresa_id, v_dst_flow, v_welcome
    );
  END IF;

  EXECUTE format(
    'INSERT INTO %I.chat_flow_options
       (node_id, label, option_value, meta_button_id, next_node_code, sort_order, option_payload)
     SELECT n.id, v.label, v.option_value, v.meta_button_id, %L, v.sort_order,
            jsonb_build_object(
              ''cantidad'', v.cantidad,
              ''cantidad_boletos'', v.cantidad,
              ''monto'', v.monto,
              ''monto_compra'', v.monto,
              ''precio_fuente'', ''promo'',
              ''promo_nombre'', v.label
            )
       FROM %I.chat_flow_nodes n
       CROSS JOIN (VALUES
         (''5.000 Gs → 1 boleta'',     ''1_boleta'',   ''promo_5k_1'',     10, 1,  5000),
         (''10.000 Gs → 3 boletas'',   ''3_boletas'',  ''promo_10k_3'',    20, 3,  10000),
         (''20.000 Gs → 7 boletas'',   ''7_boletas'',  ''promo_20k_7'',    30, 7,  20000),
         (''50.000 Gs → 18 boletas'',  ''18_boletas'', ''promo_50k_18'',   40, 18, 50000),
         (''100.000 Gs → 40 boletas'', ''40_boletas'', ''promo_100k_40'',  50, 40, 100000)
       ) AS v(label, option_value, meta_button_id, sort_order, cantidad, monto)
      WHERE n.empresa_id = %L AND n.flow_code = %L AND n.node_code = %L',
    v_schema, v_next_node, v_schema, v_empresa_id, v_dst_flow, v_welcome
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Opciones de boletas cargadas en %: %', v_welcome, v_n;

  -- 10) chat_flows del destino: copiar config del origen + enlazar sorteo ---
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'chat_flows' AND column_name = 'flow_config'
  ) THEN
    EXECUTE format(
      'SELECT coalesce(flow_config, ''{}''::jsonb) FROM %I.chat_flows
        WHERE empresa_id = %L AND flow_code = %L',
      v_schema, v_empresa_id, v_src_flow
    ) INTO v_cfg;

    v_cfg := coalesce(v_cfg, '{}'::jsonb)
             || jsonb_build_object('restart_node_code', v_welcome)
             || jsonb_build_object(
                  'restart_strong_keywords',
                  coalesce(v_cfg->'restart_strong_keywords', '[]'::jsonb)
                    || jsonb_build_array('4 motos', 'sorteo 4 motos', 'mevo 4 motos')
                );

    EXECUTE format(
      'UPDATE %I.chat_flows
          SET flow_config = %L, sorteo_id = %L, channel = ''whatsapp'', activo = true, updated_at = now()
        WHERE empresa_id = %L AND flow_code = %L',
      v_schema, v_cfg, v_sorteo_id, v_empresa_id, v_dst_flow
    );
  ELSE
    EXECUTE format(
      'UPDATE %I.chat_flows
          SET sorteo_id = %L, channel = ''whatsapp'', activo = true, updated_at = now()
        WHERE empresa_id = %L AND flow_code = %L',
      v_schema, v_sorteo_id, v_empresa_id, v_dst_flow
    );
  END IF;

  -- 11) Reglas de recontacto (si el tenant las tiene) -----------------------
  IF to_regclass(format('%I.chat_flow_recontact_rules', v_schema)) IS NOT NULL THEN
    EXECUTE format(
      'DELETE FROM %I.chat_flow_recontact_rules WHERE empresa_id = %L AND flow_code = %L',
      v_schema, v_empresa_id, v_dst_flow
    );

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'chat_flow_recontact_rules'
      AND column_name NOT IN ('id', 'flow_code', 'created_at', 'updated_at')
      AND is_generated = 'NEVER';

    EXECUTE format(
      'INSERT INTO %I.chat_flow_recontact_rules (flow_code, %s)
       SELECT %L, %s FROM %I.chat_flow_recontact_rules
        WHERE empresa_id = %L AND flow_code = %L',
      v_schema, v_cols, v_dst_flow, v_cols, v_schema, v_empresa_id, v_src_flow
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'Reglas de recontacto clonadas: %', v_n;
  END IF;

  RAISE NOTICE 'OK — flujo % listo (bienvenida %, sorteo %).', v_dst_flow, v_welcome, v_sorteo_id;
END
$do$;

-- =============================================================================
-- Verificación (reemplazar <data_schema> por el de Mevo y <flow_code_destino>)
-- =============================================================================
-- SELECT id, nombre, data_schema FROM zentra_erp.empresas WHERE nombre ILIKE '%mevo%';
--
-- SELECT f.flow_code, f.label, f.activo, f.sorteo_id, f.flow_config
--   FROM <data_schema>.chat_flows f
--  WHERE f.label ILIKE '%4 motos%';
--
-- SELECT n.node_code, n.node_type, n.sort_order, n.next_node_code,
--        (SELECT count(*) FROM <data_schema>.chat_flow_options o WHERE o.node_id = n.id) AS opciones,
--        (SELECT count(*) FROM <data_schema>.chat_flow_node_blocks b WHERE b.node_id = n.id) AS bloques
--   FROM <data_schema>.chat_flow_nodes n
--  WHERE n.flow_code = '<flow_code_destino>'
--  ORDER BY n.sort_order;
--
-- SELECT o.label, o.meta_button_id, o.next_node_code, o.option_payload
--   FROM <data_schema>.chat_flow_options o
--   JOIN <data_schema>.chat_flow_nodes n ON n.id = o.node_id
--  WHERE n.flow_code = '<flow_code_destino>' AND n.node_code = '<nodo_bienvenida>'
--  ORDER BY o.sort_order;
