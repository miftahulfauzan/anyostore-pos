const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../auth");
const { copyMediaFile } = require("../media-storage");
const { adjustStock } = require("../stock");
const router = express.Router();
router.use(authenticate);
const fail = (s, m) => Object.assign(new Error(m), { status: s });
async function balance(c, warehouseId, productId, variantId) {
  const [r] = await c.execute(
    "SELECT id, quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id <=> ? FOR UPDATE",
    [warehouseId, productId, variantId],
  );
  return r[0];
}
async function change(
  c,
  branchId,
  warehouseId,
  productId,
  variantId,
  qty,
  userId,
  type,
  refType,
  refId,
) {
  const row = await balance(c, warehouseId, productId, variantId);
  const before = row?.quantity || 0;
  const after = before + qty;
  if (after < 0) throw fail(400, "Stok gudang tidak mencukupi");
  await adjustStock(c, {
    branchId,
    warehouseId,
    productId,
    variantId,
    delta: qty,
    userId,
    type,
    referenceType: refType,
    referenceId: refId,
  });
}
// Alur transfer sengaja langsung 'completed' (self-approve) — tidak ada alur pending/approval terpisah.
router.post(
  "/transfers",
  authorize("owner", "manager", "admin", "gudang"),
  async (req, res, next) => {
    const c = await db.getConnection();
    try {
      const {
        from_warehouse_id: from,
        to_warehouse_id: to,
        notes,
        items,
      } = req.body;
      if (
        !Number.isInteger(Number(from)) ||
        !Number.isInteger(Number(to)) ||
        from === to ||
        !Array.isArray(items) ||
        !items.length
      )
        throw fail(400, "Data transfer tidak valid");
      await c.beginTransaction();
      const [src] = await c.execute(
        "SELECT id,branch_id FROM warehouses WHERE id=? AND is_active=TRUE FOR UPDATE",
        [from],
      );
      if (!src[0]) throw fail(404, "Gudang asal tidak ditemukan");
      const branchId = src[0].branch_id;
      const [w] = await c.execute(
        "SELECT id FROM warehouses WHERE id=? AND branch_id=? AND is_active=TRUE",
        [to, branchId],
      );
      if (!w[0])
        throw fail(404, "Gudang tujuan tidak ditemukan di cabang yang sama");
      const [t] = await c.execute(
        "INSERT INTO stock_transfers (from_warehouse_id,to_warehouse_id,branch_id,status,notes,created_by,approved_by,approved_at) VALUES (?, ?, ?, 'completed', ?, ?, ?, NOW())",
        [from, to, branchId, notes?.trim() || null, req.user.id, req.user.id],
      );
      for (const item of items) {
        const q = Number(item.quantity);
        if (
          !Number.isInteger(Number(item.product_id)) ||
          !Number.isInteger(q) ||
          q <= 0
        )
          throw fail(400, "Item transfer tidak valid");
        const [pi] = await c.execute(
          "SELECT name FROM products WHERE id=? AND branch_id=? AND is_active=TRUE",
          [item.product_id, branchId],
        );
        if (!pi[0]) throw fail(404, "Produk tidak ditemukan");
        if (!item.variant_id) {
          const [pc] = await c.execute(
            "SELECT COUNT(*) AS cnt FROM product_variants WHERE product_id=? AND is_active=TRUE",
            [item.product_id],
          );
          if (Number(pc[0].cnt) > 0)
            throw fail(
              400,
              "Produk " + pi[0].name + " punya varian — wajib pilih warna",
            );
        }
        await change(
          c,
          branchId,
          from,
          item.product_id,
          item.variant_id || null,
          -q,
          req.user.id,
          "transfer_out",
          "transfer",
          t.insertId,
        );
        await change(
          c,
          branchId,
          to,
          item.product_id,
          item.variant_id || null,
          q,
          req.user.id,
          "transfer_in",
          "transfer",
          t.insertId,
        );
        await c.execute(
          "INSERT INTO stock_transfer_items (transfer_id,product_id,variant_id,quantity) VALUES (?,?,?,?)",
          [t.insertId, item.product_id, item.variant_id || null, q],
        );
      }
      await c.commit();
      res
        .status(201)
        .json({ success: true, data: { id: t.insertId, status: "completed" } });
    } catch (e) {
      await c.rollback();
      next(e);
    } finally {
      c.release();
    }
  },
);
router.get("/store-targets", authorize("owner", "manager", "admin", "gudang"), async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      "SELECT b.id,b.name,w.id AS warehouse_id,w.name AS warehouse_name FROM branches b JOIN warehouses w ON w.branch_id=b.id AND w.is_active=TRUE WHERE b.is_active=TRUE AND b.id<>? ORDER BY b.name,w.name",
      [req.user.branch_id],
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});
router.post(
  "/transfers/inter-store",
  authorize("owner", "manager", "admin", "gudang"),
  async (req, res, next) => {
    const c = await db.getConnection();
    try {
      const {
        from_warehouse_id: from,
        to_warehouse_id: to,
        items,
        notes,
      } = req.body;
      if (
        !Number.isInteger(Number(from)) ||
        !Number.isInteger(Number(to)) ||
        !Array.isArray(items) ||
        !items.length
      )
        throw fail(400, "Data transfer antartoko tidak valid");
      await c.beginTransaction();
      const [source] = await c.execute(
        "SELECT id,branch_id FROM warehouses WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE",
        [from, req.user.branch_id],
      );
      const [target] = await c.execute(
        "SELECT id,branch_id FROM warehouses WHERE id=? AND is_active=TRUE FOR UPDATE",
        [to],
      );
      if (
        !source[0] ||
        !target[0] ||
        source[0].branch_id === target[0].branch_id
      )
        throw fail(400, "Gudang asal atau tujuan tidak valid");
      const branchId = source[0].branch_id;
      const [t] = await c.execute(
        "INSERT INTO stock_transfers (from_warehouse_id,to_warehouse_id,branch_id,status,notes,created_by,approved_by,approved_at) VALUES (?, ?, ?, 'completed', ?, ?, ?, NOW())",
        [from, to, branchId, notes?.trim() || null, req.user.id, req.user.id],
      );
      for (const item of items) {
        const q = Number(item.quantity),
          productId = Number(item.product_id),
          variantId = item.variant_id ? Number(item.variant_id) : null;
        if (!Number.isInteger(productId) || !Number.isInteger(q) || q <= 0)
          throw fail(400, "Item transfer tidak valid");
        const [p] = await c.execute(
          "SELECT id,category_id,name,description,sku,barcode,price,cost,min_stock,gender FROM products WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE",
          [productId, req.user.branch_id],
        );
        if (!p[0]) throw fail(404, "Produk asal tidak ditemukan");
        if (!variantId) {
          const [pc] = await c.execute(
            "SELECT COUNT(*) AS cnt FROM product_variants WHERE product_id=? AND is_active=TRUE",
            [productId],
          );
          if (Number(pc[0].cnt) > 0)
            throw fail(
              400,
              "Produk " + p[0].name + " punya varian — wajib pilih warna",
            );
        }
        const baseSku = (p[0].sku || "").trim();
        const key = baseSku.replace(/^B\d*-/i, "").toUpperCase();
        const newSku = baseSku
          ? ("B" + target[0].branch_id + "-" + baseSku).slice(0, 50)
          : null;
        let [dest] = await c.execute(
          "SELECT id FROM products WHERE branch_id=? AND is_active=TRUE AND (UPPER(TRIM(sku))=? OR UPPER(TRIM(sku))=CONCAT('B-',?) OR UPPER(TRIM(sku))=CONCAT('B',branch_id,'-',?)) LIMIT 1 FOR UPDATE",
          [target[0].branch_id, key, key, key],
        );
        let createdProduct = false;
        if (!dest[0]) {
          if (!newSku)
            throw fail(
              400,
              "Produk asal tanpa SKU tidak bisa ditransfer antar toko",
            );
          const [dup] = await c.execute(
            "SELECT id FROM products WHERE sku=? LIMIT 1",
            [newSku],
          );
          if (dup[0]) throw fail(400, "SKU tujuan sudah ada di cabang lain");
          const [res] = await c.execute(
            "INSERT INTO products (branch_id,category_id,name,description,sku,barcode,price,cost,stock,min_stock,gender,is_active) VALUES (?,?,?,?,?,?,?,?,0,?,?,TRUE)",
            [
              target[0].branch_id,
              p[0].category_id,
              p[0].name,
              p[0].description,
              newSku,
              null,
              p[0].price,
              p[0].cost || 0,
              p[0].min_stock,
              p[0].gender,
            ],
          );
          const newProductId = res.insertId;
          const [variants] = await c.execute(
            "SELECT color,size,sku,barcode,price FROM product_variants WHERE product_id=? AND is_active=TRUE",
            [productId],
          );
          for (const v of variants) {
            await c.execute(
              "INSERT INTO product_variants (product_id,size,color,sku,barcode,stock,price,is_active) VALUES (?,?,?,?,?,0,?,TRUE)",
              [
                newProductId,
                v.size || null,
                v.color || null,
                null,
                null,
                v.price != null ? v.price : null,
              ],
            );
          }
          const [wholesale] = await c.execute(
            "SELECT min_qty,max_qty,price FROM wholesale_prices WHERE product_id=? AND is_active=TRUE",
            [productId],
          );
          for (const w of wholesale) {
            await c.execute(
              "INSERT INTO wholesale_prices (product_id,min_qty,max_qty,price,is_active) VALUES (?,?,?,?,TRUE)",
              [newProductId, w.min_qty, w.max_qty, w.price],
            );
          }
          const [photos] = await c.execute(
            "SELECT filename,path,media_type,is_primary,sort_order FROM product_photos WHERE product_id=?",
            [productId],
          );
          for (const ph of photos) {
            const newPath = await copyMediaFile(ph.path, "products");
            await c.execute(
              "INSERT INTO product_photos (product_id,filename,path,media_type,is_primary,sort_order) VALUES (?,?,?,?,?,?)",
              [
                newProductId,
                ph.filename,
                newPath,
                ph.media_type,
                ph.is_primary,
                ph.sort_order,
              ],
            );
          }
          dest = [{ id: newProductId }];
          createdProduct = true;
        }
        let destVariantId = null;
        if (variantId) {
          const [vv] = await c.execute(
            "SELECT id,color,price FROM product_variants WHERE id=? AND product_id=? AND is_active=TRUE FOR UPDATE",
            [variantId, productId],
          );
          if (!vv[0]) throw fail(404, "Varian warna asal tidak ditemukan");
          let [dv] = await c.execute(
            "SELECT id FROM product_variants WHERE product_id=? AND color=? AND is_active=TRUE LIMIT 1 FOR UPDATE",
            [dest[0].id, vv[0].color],
          );
          if (!dv[0]) {
            const [ins] = await c.execute(
              "INSERT INTO product_variants (product_id,size,color,sku,barcode,stock,price,is_active) VALUES (?,?,?,?,?,0,?,TRUE)",
              [
                dest[0].id,
                null,
                vv[0].color,
                null,
                null,
                vv[0].price != null ? vv[0].price : null,
              ],
            );
            dv = [{ id: ins.insertId }];
          }
          destVariantId = dv[0].id;
        }
        await change(
          c,
          branchId,
          from,
          productId,
          variantId,
          -q,
          req.user.id,
          "transfer_out",
          "inter_store_transfer",
          t.insertId,
        );
        await change(
          c,
          target[0].branch_id,
          to,
          dest[0].id,
          destVariantId,
          q,
          req.user.id,
          "transfer_in",
          "inter_store_transfer",
          t.insertId,
        );
        await c.execute(
          "INSERT INTO stock_transfer_items (transfer_id,product_id,variant_id,quantity) VALUES (?,?,?,?)",
          [t.insertId, productId, destVariantId, q],
        );
      }
      await c.commit();
      res
        .status(201)
        .json({
          success: true,
          data: {
            id: t.insertId,
            status: "completed",
            auto_created: createdProduct,
          },
        });
    } catch (e) {
      await c.rollback();
      next(e);
    } finally {
      c.release();
    }
  },
);
// Alur opname sengaja langsung 'approved' (self-approve) — tidak ada alur pending/approval terpisah.
router.post(
  "/opnames",
  authorize("owner", "manager", "admin", "gudang"),
  async (req, res, next) => {
    const c = await db.getConnection();
    try {
      const { warehouse_id: warehouseId, notes, items } = req.body;
      if (
        !Number.isInteger(Number(warehouseId)) ||
        !Array.isArray(items) ||
        !items.length
      )
        throw fail(400, "Data opname tidak valid");
      await c.beginTransaction();
      const [ws] = await c.execute(
        "SELECT id, branch_id FROM warehouses WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE",
        [warehouseId, req.user.branch_id],
      );
      if (!ws[0]) throw fail(404, "Gudang tidak ditemukan");
      const branchId = ws[0].branch_id;
      const productIds = [
        ...new Set(
          items.map((i) => Number(i.product_id)).filter(Number.isInteger),
        ),
      ];
      const ph = productIds.map(() => "?").join(",");
      const [prods] = productIds.length
        ? await c.execute(
            `SELECT id FROM products WHERE id IN (${ph}) AND branch_id=? AND is_active=TRUE`,
            [...productIds, req.user.branch_id],
          )
        : [[]];
      if (prods.length !== productIds.length)
        throw fail(400, "Satu atau lebih produk tidak ditemukan di toko ini");
      const [o] = await c.execute(
        "INSERT INTO stock_opnames (warehouse_id,branch_id,opname_date,total_items,status,approved_by,approved_at,notes,created_by) VALUES (?, ?, CURDATE(), ?, 'approved', ?, NOW(), ?, ?)",
        [
          warehouseId,
          branchId,
          items.length,
          req.user.id,
          notes?.trim() || null,
          req.user.id,
        ],
      );
      let diff = 0;
      for (const item of items) {
        const physical = Number(item.physical_stock);
        if (
          !Number.isInteger(Number(item.product_id)) ||
          !Number.isInteger(physical) ||
          physical < 0
        )
          throw fail(400, "Item opname tidak valid");
        const row = await balance(
          c,
          warehouseId,
          item.product_id,
          item.variant_id || null,
        );
        const system = row?.quantity || 0;
        const delta = physical - system;
        diff += delta;
        await c.execute(
          "INSERT INTO stock_opname_items (opname_id,product_id,variant_id,system_stock,physical_stock,selisih,notes) VALUES (?,?,?,?,?,?,?)",
          [
            o.insertId,
            item.product_id,
            item.variant_id || null,
            system,
            physical,
            delta,
            item.notes?.trim() || null,
          ],
        );
        if (delta)
          await change(
            c,
            branchId,
            warehouseId,
            item.product_id,
            item.variant_id || null,
            delta,
            req.user.id,
            "adjustment",
            "stock_opname",
            o.insertId,
          );
      }
      await c.execute(
        "UPDATE stock_opnames SET total_selisih = ? WHERE id = ?",
        [diff, o.insertId],
      );
      await c.commit();
      await db.execute(
        "INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)",
        [
          req.user.id,
          "stock_opname",
          `Opname gudang ${warehouseId}: ${items.length} item, selisih ${diff}`,
          req.ip,
          req.get("user-agent") || null,
        ],
      );
      res
        .status(201)
        .json({
          success: true,
          data: { id: o.insertId, total_selisih: diff, status: "approved" },
        });
    } catch (e) {
      await c.rollback();
      next(e);
    } finally {
      c.release();
    }
  },
);
module.exports = router;
