-- Reservasi stok untuk pesanan reseller.
--
-- Sebelumnya katalog publik sudah menghitung `available_stock =
-- quantity - reserved_quantity` tetapi `reserved_quantity` tidak pernah ditulis,
-- sehingga dua pembeli bisa memesan barang yang sama dan stok baru berkurang
-- saat admin melakukan convert (bisa sampai minus).
--
-- Tabel ini mencatat alokasi reservasi per gudang agar pelepasan/konsumsi bisa
-- tepat jumlahnya, termasuk bila satu produk tersebar di beberapa gudang.
CREATE TABLE IF NOT EXISTS reseller_stock_reservations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    branch_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    released_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES reseller_orders(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_reseller_reservation_order (order_id),
    INDEX idx_reseller_reservation_open (released_at, created_at)
);