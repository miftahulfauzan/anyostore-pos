-- Statistik halaman link bio (views harian + klik per link).
CREATE TABLE IF NOT EXISTS link_page_views (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    view_date DATE NOT NULL,
    views INT NOT NULL DEFAULT 0,
    UNIQUE KEY unique_branch_date (branch_id, view_date),
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS link_page_clicks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    label VARCHAR(120) NOT NULL DEFAULT '',
    clicks INT NOT NULL DEFAULT 0,
    last_clicked_at DATETIME DEFAULT NULL,
    UNIQUE KEY unique_branch_item (branch_id, item_id),
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);
