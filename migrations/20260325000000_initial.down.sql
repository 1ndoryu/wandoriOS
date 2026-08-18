-- Revertir migración inicial
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS "uuid-ossp";
