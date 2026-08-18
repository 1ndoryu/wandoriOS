-- [018A-85] Portada de proyecto: imagen opcional para el catálogo público.
ALTER TABLE projects ADD COLUMN cover_image VARCHAR(1000);
