-- Landing page per cabang: slug eksplisit supaya tidak menebak dari nama/alamat.
-- anyostore.my.id/reseller  ->  branches.landing_slug = 'reseller' (Toko B).
ALTER TABLE branches ADD COLUMN landing_slug VARCHAR(60) NULL;

UPDATE branches
   SET landing_slug = 'reseller'
 WHERE LOWER(TRIM(name)) = 'toko b'
   AND (landing_slug IS NULL OR landing_slug = '');
