-- =============================================================================
-- Sorteo Mevo 4 motos — configurar el flujo "sorteo 4 motos"
--
-- Versión SIN bloque DO y sin dollar-quoting: solo sentencias SQL planas,
-- porque el editor SQL de Supabase corta los bloques DO y devuelve
-- "unterminated dollar-quoted string".
--
-- Qué hace:
--   1) Clona el flujo "Sorteo mevo 1 Toyota auris + 3 motos" (nodos, opciones,
--      bloques y flow_config) dentro del flujo ya creado "sorteo 4 motos".
--   2) Enlaza el flujo destino al sorteo "Sorteo Mevo 4 motos".
--   3) Reemplaza el nodo de bienvenida con el mensaje nuevo + imagen + las 5
--      opciones de boletas (5.000 / 10.000 / 20.000 / 50.000 / 100.000 Gs).
--
-- Idempotente: se puede correr varias veces.
-- =============================================================================


-- =============================================================================
-- PASO 1 — correr SOLO esta consulta: busca, entre todos los esquemas de
--          empresa, en cuál están los flujos del sorteo. El esquema con el
--          mayor "flujos_match" (deberían ser 2: el Auris y el de 4 motos) es
--          el de Mevo, y es el que va en el SET del paso 2.
-- =============================================================================

SELECT t.table_schema,
       (xpath('/row/c/text()', query_to_xml(
          format(
            'select count(*) as c from %I.chat_flows
              where label ilike ''%%auris%%'' or label ilike ''%%4 motos%%''',
            t.table_schema
          ), false, true, '')))[1]::text::int AS flujos_match
FROM information_schema.tables t
WHERE t.table_name = 'chat_flows'
ORDER BY flujos_match DESC NULLS LAST, t.table_schema
LIMIT 20;


-- =============================================================================
-- PASO 2 — poner el esquema que devolvió el paso 1 en la línea de abajo y
--          ejecutar TODO el paso 2 de una sola vez (seleccionar desde el SET
--          hasta el final y Run).
-- =============================================================================

SET search_path TO ESQUEMA_DE_MEVO;


-- 2.0) Control previo: así se llaman los flujos y sorteos que se van a usar.
--      El origen tiene que ser el único con "auris" y el destino el único
--      con "4 motos".

SELECT flow_code, label, activo, sorteo_id
FROM chat_flows
WHERE label ILIKE '%auris%' OR label ILIKE '%4 motos%'
   OR flow_code ILIKE '%auris%' OR flow_code ILIKE '%4_motos%'
ORDER BY label;

SELECT id, nombre, precio_por_boleto, estado
FROM sorteos
WHERE nombre ILIKE '%auris%' OR nombre ILIKE '%4 motos%'
ORDER BY nombre;


-- 2.1) Contexto resuelto (flujo origen, flujo destino, nodo de bienvenida,
--      nodo siguiente tras elegir boletas y sorteo). Los NOT NULL actúan de
--      freno: si algo no se resuelve, la ejecución falla y no cambia nada.

DROP TABLE IF EXISTS _mevo_ctx;

CREATE TEMP TABLE _mevo_ctx (
  empresa_id   uuid PRIMARY KEY,
  src_flow     text NOT NULL,
  dst_flow     text NOT NULL,
  welcome_node text NOT NULL,
  next_node    text NOT NULL,
  sorteo_id    uuid NOT NULL
);

INSERT INTO _mevo_ctx (empresa_id, src_flow, dst_flow, welcome_node, next_node, sorteo_id)
SELECT
  d.empresa_id,
  s.flow_code,
  d.flow_code,
  w.node_code,
  COALESCE(
    (SELECT o.next_node_code
       FROM chat_flow_options o
       JOIN chat_flow_nodes n ON n.id = o.node_id
      WHERE n.empresa_id = s.empresa_id
        AND n.flow_code = s.flow_code
        AND o.next_node_code IS NOT NULL
        AND o.option_payload ?| array['cantidad','cantidad_boletos','cantidad_boletas','cantidad_numeros','boletas','boletos']
      ORDER BY n.sort_order, o.sort_order
      LIMIT 1),
    (SELECT o.next_node_code
       FROM chat_flow_options o
      WHERE o.node_id = w.id AND o.next_node_code IS NOT NULL
      ORDER BY o.sort_order
      LIMIT 1)
  ),
  (SELECT r.id FROM sorteos r
    WHERE r.empresa_id = d.empresa_id AND r.nombre ILIKE '%4 motos%'
    ORDER BY r.created_at
    LIMIT 1)
FROM chat_flows d
JOIN chat_flows s
  ON s.empresa_id = d.empresa_id AND s.label ILIKE '%auris%'
CROSS JOIN LATERAL (
  SELECT n.id, n.node_code
    FROM chat_flow_nodes n
   WHERE n.empresa_id = s.empresa_id AND n.flow_code = s.flow_code AND n.is_active
   ORDER BY (n.node_code ~* 'bienvenid|inicio|welcome|start') DESC, n.sort_order
   LIMIT 1
) w
WHERE d.label ILIKE '%4 motos%';

-- Freno: si el contexto quedó vacío, esto corta con "division by zero".
SELECT 1 / (SELECT count(*) FROM _mevo_ctx)::int AS contexto_ok;

-- Control visual de lo que se va a tocar.
SELECT * FROM _mevo_ctx;


-- 2.2) Vaciar el flujo destino (opciones y bloques caen por FK).

DELETE FROM chat_flow_nodes n
USING _mevo_ctx c
WHERE n.empresa_id = c.empresa_id AND n.flow_code = c.dst_flow;


-- 2.3) Clonar nodos del flujo origen.

INSERT INTO chat_flow_nodes
  (empresa_id, flow_code, node_code, message_text, node_type, is_active,
   save_as_field, next_node_code, sort_order, crm_action_type, crm_action_config)
SELECT
  n.empresa_id, c.dst_flow, n.node_code, n.message_text, n.node_type, n.is_active,
  n.save_as_field, n.next_node_code, n.sort_order, n.crm_action_type, n.crm_action_config
FROM chat_flow_nodes n
JOIN _mevo_ctx c
  ON c.empresa_id = n.empresa_id AND c.src_flow = n.flow_code;


-- 2.4) Clonar opciones.

INSERT INTO chat_flow_options
  (node_id, label, option_value, meta_button_id, next_node_code, sort_order,
   option_payload, group_title, group_order)
SELECT
  dn.id, o.label, o.option_value, o.meta_button_id, o.next_node_code, o.sort_order,
  o.option_payload, o.group_title, o.group_order
FROM chat_flow_options o
JOIN chat_flow_nodes sn ON sn.id = o.node_id
JOIN _mevo_ctx c ON c.empresa_id = sn.empresa_id AND c.src_flow = sn.flow_code
JOIN chat_flow_nodes dn
  ON dn.empresa_id = sn.empresa_id AND dn.flow_code = c.dst_flow AND dn.node_code = sn.node_code;


-- 2.5) Clonar bloques (texto / imagen / botones).

INSERT INTO chat_flow_node_blocks
  (empresa_id, node_id, block_type, content_text, media_url, sort_order)
SELECT
  dn.empresa_id, dn.id, b.block_type, b.content_text, b.media_url, b.sort_order
FROM chat_flow_node_blocks b
JOIN chat_flow_nodes sn ON sn.id = b.node_id
JOIN _mevo_ctx c ON c.empresa_id = sn.empresa_id AND c.src_flow = sn.flow_code
JOIN chat_flow_nodes dn
  ON dn.empresa_id = sn.empresa_id AND dn.flow_code = c.dst_flow AND dn.node_code = sn.node_code;


-- 2.6) Mensaje de bienvenida nuevo.

UPDATE chat_flow_nodes n
SET message_text = '👋 ¡Holaaa! Bienvenido a MEVO SORTEOS 🎟️

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

🤩 ¡Con 1 boleta ya participás por las 4 motos!',
    node_type = 'buttons',
    is_active = true
FROM _mevo_ctx c
WHERE n.empresa_id = c.empresa_id
  AND n.flow_code = c.dst_flow
  AND n.node_code = c.welcome_node;


-- 2.7) Rehacer bloques del nodo de bienvenida: imagen (con el texto como
--      caption) + bloque de botones.

DELETE FROM chat_flow_node_blocks b
USING chat_flow_nodes n, _mevo_ctx c
WHERE b.node_id = n.id
  AND n.empresa_id = c.empresa_id
  AND n.flow_code = c.dst_flow
  AND n.node_code = c.welcome_node;

INSERT INTO chat_flow_node_blocks
  (empresa_id, node_id, block_type, content_text, media_url, sort_order)
SELECT n.empresa_id, n.id, v.block_type, v.content_text, v.media_url, v.sort_order
FROM chat_flow_nodes n
JOIN _mevo_ctx c
  ON c.empresa_id = n.empresa_id AND c.dst_flow = n.flow_code AND c.welcome_node = n.node_code
CROSS JOIN (VALUES
  ('image',
   '👋 ¡Holaaa! Bienvenido a MEVO SORTEOS 🎟️

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

🤩 ¡Con 1 boleta ya participás por las 4 motos!',
   'https://res.cloudinary.com/drupicep5/image/upload/v1790805557/imagen_2026-09-30_185909149_evhxk0.png',
   10),
  ('buttons', '🎟️ Elegí tu paquete de boletas 👇', NULL::text, 20)
) AS v(block_type, content_text, media_url, sort_order);


-- 2.8) Opciones de boletas del nodo de bienvenida.
--      Son 5, así que WhatsApp las manda como lista interactiva ("Ver opciones").

DELETE FROM chat_flow_options o
USING chat_flow_nodes n, _mevo_ctx c
WHERE o.node_id = n.id
  AND n.empresa_id = c.empresa_id
  AND n.flow_code = c.dst_flow
  AND n.node_code = c.welcome_node;

INSERT INTO chat_flow_options
  (node_id, label, option_value, meta_button_id, next_node_code, sort_order, option_payload)
SELECT
  n.id, v.label, v.option_value, v.meta_button_id, c.next_node, v.sort_order,
  jsonb_build_object(
    'cantidad', v.cantidad,
    'cantidad_boletos', v.cantidad,
    'monto', v.monto,
    'monto_compra', v.monto,
    'precio_fuente', 'promo',
    'promo_nombre', v.label
  )
FROM chat_flow_nodes n
JOIN _mevo_ctx c
  ON c.empresa_id = n.empresa_id AND c.dst_flow = n.flow_code AND c.welcome_node = n.node_code
CROSS JOIN (VALUES
  ('5.000 Gs → 1 boleta',     '1_boleta',   'promo_5k_1',    10,  1,   5000),
  ('10.000 Gs → 3 boletas',   '3_boletas',  'promo_10k_3',   20,  3,  10000),
  ('20.000 Gs → 7 boletas',   '7_boletas',  'promo_20k_7',   30,  7,  20000),
  ('50.000 Gs → 18 boletas',  '18_boletas', 'promo_50k_18',  40, 18,  50000),
  ('100.000 Gs → 40 boletas', '40_boletas', 'promo_100k_40', 50, 40, 100000)
) AS v(label, option_value, meta_button_id, sort_order, cantidad, monto);


-- 2.9) chat_flows del destino: config del origen + sorteo enlazado + activo.

UPDATE chat_flows d
SET flow_config = COALESCE(s.flow_config, '{}'::jsonb)
                  || jsonb_build_object('restart_node_code', c.welcome_node)
                  || jsonb_build_object(
                       'restart_strong_keywords',
                       COALESCE(s.flow_config -> 'restart_strong_keywords', '[]'::jsonb)
                         || jsonb_build_array('4 motos', 'sorteo 4 motos', 'mevo 4 motos')
                     ),
    sorteo_id = c.sorteo_id,
    channel = 'whatsapp',
    activo = true,
    updated_at = now()
FROM _mevo_ctx c
JOIN chat_flows s ON s.empresa_id = c.empresa_id AND s.flow_code = c.src_flow
WHERE d.empresa_id = c.empresa_id AND d.flow_code = c.dst_flow;


-- 2.10) Verificación.

SELECT f.flow_code, f.label, f.activo, f.sorteo_id, f.flow_config
FROM chat_flows f
JOIN _mevo_ctx c ON c.empresa_id = f.empresa_id AND c.dst_flow = f.flow_code;

SELECT n.node_code, n.node_type, n.sort_order, n.next_node_code,
       (SELECT count(*) FROM chat_flow_options o WHERE o.node_id = n.id) AS opciones,
       (SELECT count(*) FROM chat_flow_node_blocks b WHERE b.node_id = n.id) AS bloques
FROM chat_flow_nodes n
JOIN _mevo_ctx c ON c.empresa_id = n.empresa_id AND c.dst_flow = n.flow_code
ORDER BY n.sort_order;

SELECT o.label, o.meta_button_id, o.next_node_code, o.sort_order, o.option_payload
FROM chat_flow_options o
JOIN chat_flow_nodes n ON n.id = o.node_id
JOIN _mevo_ctx c
  ON c.empresa_id = n.empresa_id AND c.dst_flow = n.flow_code AND c.welcome_node = n.node_code
ORDER BY o.sort_order;


-- =============================================================================
-- PASO 3 (opcional) — clonar las reglas de recontacto del flujo origen.
-- Correr DESPUÉS del paso 2 y en la MISMA pestaña (usa la tabla temporal).
-- Si el tenant no tiene chat_flow_recontact_rules, ignorar este paso.
-- =============================================================================

-- DELETE FROM chat_flow_recontact_rules r
-- USING _mevo_ctx c
-- WHERE r.empresa_id = c.empresa_id AND r.flow_code = c.dst_flow;
--
-- INSERT INTO chat_flow_recontact_rules
--   (empresa_id, flow_code, nombre, descripcion, activo, prioridad,
--    included_node_codes, excluded_node_codes, idle_after_seconds, max_attempts,
--    cooldown_seconds, schedule_config, guard_config, message_config)
-- SELECT
--   r.empresa_id, c.dst_flow, r.nombre, r.descripcion, r.activo, r.prioridad,
--   r.included_node_codes, r.excluded_node_codes, r.idle_after_seconds, r.max_attempts,
--   r.cooldown_seconds, r.schedule_config, r.guard_config, r.message_config
-- FROM chat_flow_recontact_rules r
-- JOIN _mevo_ctx c ON c.empresa_id = r.empresa_id AND c.src_flow = r.flow_code;
