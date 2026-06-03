-- youarethead — esquema de la wishlist
-- El server corre esto solo al arrancar (CREATE ... IF NOT EXISTS).
-- Lo dejo acá por si querés aplicarlo a mano o revisarlo.

CREATE TABLE IF NOT EXISTS wishlist (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT        NOT NULL,
  email_norm  TEXT        NOT NULL,
  ip_hash     TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un mail no se puede anotar dos veces (case-insensitive via email_norm).
CREATE UNIQUE INDEX IF NOT EXISTS wishlist_email_norm_uidx
  ON wishlist (email_norm);

-- Un alta por IP (hasheada). El índice parcial permite NULL si ONE_PER_IP=false.
CREATE UNIQUE INDEX IF NOT EXISTS wishlist_ip_uidx
  ON wishlist (ip_hash)
  WHERE ip_hash IS NOT NULL;
