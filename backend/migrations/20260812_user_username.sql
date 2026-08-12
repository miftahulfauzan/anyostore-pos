ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL AFTER name;

-- Isi username dari bagian depan email untuk akun yang sudah ada
UPDATE users u
JOIN (
  SELECT id, LEFT(email, LOCATE('@', email) - 1) AS base
  FROM users
) x ON x.id = u.id
SET u.username = x.base
WHERE u.username IS NULL OR u.username = '';

-- Username bentrok -> tambahkan akhiran id agar unik
UPDATE users u
JOIN (
  SELECT id, base, ROW_NUMBER() OVER (PARTITION BY base ORDER BY id) AS rn
  FROM (SELECT id, LEFT(email, LOCATE('@', email) - 1) AS base FROM users) t
) r ON r.id = u.id
SET u.username = CONCAT(r.base, '-', u.id)
WHERE r.rn > 1;

-- Jaring pengaman kalau email tidak valid
UPDATE users SET username = CONCAT('user', id)
WHERE username IS NULL OR username = '';

CREATE UNIQUE INDEX idx_users_username ON users(username);
