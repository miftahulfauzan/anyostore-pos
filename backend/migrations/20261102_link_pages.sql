-- Support multiple custom Linktree-style pages per branch while preserving
-- each branch's existing link_page configuration and statistics.
CREATE TABLE IF NOT EXISTS link_pages (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(80) NOT NULL,
    config LONGTEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_link_page_slug (slug),
    KEY idx_link_pages_branch (branch_id, is_default, id),
    CONSTRAINT fk_link_pages_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

INSERT INTO link_pages (branch_id, name, slug, config, is_default, is_published)
SELECT b.id, b.name, CONCAT('toko-', b.id), COALESCE(s.`value`, '{}'), TRUE, TRUE
FROM branches b
LEFT JOIN store_settings s ON s.branch_id = b.id AND s.`key` = 'link_page'
WHERE NOT EXISTS (SELECT 1 FROM link_pages p WHERE p.branch_id = b.id);

CREATE TABLE IF NOT EXISTS link_page_page_views (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    page_id BIGINT UNSIGNED NOT NULL,
    view_date DATE NOT NULL,
    views INT NOT NULL DEFAULT 0,
    UNIQUE KEY unique_link_page_view_date (page_id, view_date),
    CONSTRAINT fk_link_page_page_views_page FOREIGN KEY (page_id) REFERENCES link_pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS link_page_page_clicks (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    page_id BIGINT UNSIGNED NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    label VARCHAR(120) NOT NULL DEFAULT '',
    clicks INT NOT NULL DEFAULT 0,
    last_clicked_at DATETIME DEFAULT NULL,
    UNIQUE KEY unique_link_page_click_item (page_id, item_id),
    CONSTRAINT fk_link_page_page_clicks_page FOREIGN KEY (page_id) REFERENCES link_pages(id) ON DELETE CASCADE
);

INSERT INTO link_page_page_views (page_id, view_date, views)
SELECT p.id, v.view_date, v.views
FROM link_page_views v
JOIN link_pages p ON p.branch_id = v.branch_id AND p.is_default = TRUE
ON DUPLICATE KEY UPDATE views = VALUES(views);

INSERT INTO link_page_page_clicks (page_id, item_id, label, clicks, last_clicked_at)
SELECT p.id, c.item_id, c.label, c.clicks, c.last_clicked_at
FROM link_page_clicks c
JOIN link_pages p ON p.branch_id = c.branch_id AND p.is_default = TRUE
ON DUPLICATE KEY UPDATE
    label = VALUES(label),
    clicks = VALUES(clicks),
    last_clicked_at = VALUES(last_clicked_at);
