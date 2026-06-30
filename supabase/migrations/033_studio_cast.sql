-- Gestructureerde cast voor de Creator Studio: een lijst rollen die elk gekoppeld
-- kunnen worden aan een gemaakt character of door AI gegenereerd worden (met vast
-- anker). Per scène kan worden afgeweken (scene.cast_overrides, in de scenes jsonb).
-- main_character_id / supporting_character_id / character_reference_urls blijven
-- bestaan voor back-compat + seeding. Defensief gelezen; werkt ook zonder migratie.

-- 'cast' is een gereserveerd SQL-keyword, daarom cast_roles.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cast_roles jsonb NOT NULL DEFAULT '[]'::jsonb;
