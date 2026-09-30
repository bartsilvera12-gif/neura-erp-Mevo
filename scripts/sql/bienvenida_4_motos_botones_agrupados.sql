SET search_path TO mevoerp;

WITH nodo AS (
  SELECT n.id
  FROM chat_flow_nodes n
  WHERE n.flow_code = 'sorteo_4_motos'
    AND EXISTS (
      SELECT 1 FROM chat_flow_options o
      WHERE o.node_id = n.id AND o.meta_button_id LIKE 'promo@_%' ESCAPE '@'
    )
)
DELETE FROM chat_flow_options o
USING nodo
WHERE o.node_id = nodo.id;

WITH nodo AS (
  SELECT n.id
  FROM chat_flow_nodes n
  WHERE n.flow_code = 'sorteo_4_motos'
    AND n.node_type = 'buttons'
    AND EXISTS (
      SELECT 1 FROM chat_flow_node_blocks b
      WHERE b.node_id = n.id AND b.block_type = 'image'
    )
)
INSERT INTO chat_flow_options
  (node_id, label, option_value, meta_button_id, next_node_code, sort_order,
   group_title, group_order, option_payload)
SELECT
  nodo.id, v.label, v.option_value, v.meta_button_id, 'resumen_de_compra', v.sort_order,
  v.group_title, v.group_order,
  jsonb_build_object(
    'cantidad', v.cantidad, 'cantidad_boletos', v.cantidad,
    'monto', v.monto, 'monto_compra', v.monto,
    'precio_fuente', 'promo', 'promo_nombre', v.label
  )
FROM nodo
CROSS JOIN (VALUES
  ('1 boleta → 5.000 Gs',  '1_boleta',   'promo_5k_1',    10,  1,   5000, '🔥 Populares',   1),
  ('3 boletas → 10.000',   '3_boletas',  'promo_10k_3',   20,  3,  10000, '🔥 Populares',   1),
  ('7 boletas → 20.000',   '7_boletas',  'promo_20k_7',   30,  7,  20000, '🔥 Populares',   1),
  ('18 boletas → 50.000',  '18_boletas', 'promo_50k_18',  40, 18,  50000, '🤩 Más chances', 2),
  ('40 boletas → 100.000', '40_boletas', 'promo_100k_40', 50, 40, 100000, '🤩 Más chances', 2)
) AS v(label, option_value, meta_button_id, sort_order, cantidad, monto, group_title, group_order);
