/* [018A-12] Analytics no conserva user-agent en claro. Los eventos ya
 * existentes se anonimizan una vez al aplicar la migración; los nuevos se
 * reciben solo con consentimiento y el handler guarda hashes. */
UPDATE analytics_events SET user_agent = NULL WHERE user_agent IS NOT NULL;

COMMENT ON COLUMN analytics_events.ip_hash IS
  'SHA-256 de la IP; no es una IP recuperable y se elimina por retención';
COMMENT ON COLUMN analytics_events.user_agent IS
  'SHA-256 del user-agent cuando existe consentimiento; nunca texto en claro';
