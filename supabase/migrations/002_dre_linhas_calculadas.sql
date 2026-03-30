-- Add formula_gerencial column for calculated DRE lines
-- tipo = 'calculada' enables lines computed from other lines (percent, fixed value, etc.)
ALTER TABLE dre_linhas ADD COLUMN IF NOT EXISTS formula_gerencial JSONB DEFAULT NULL;
