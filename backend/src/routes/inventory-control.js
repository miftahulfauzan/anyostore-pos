const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../auth");
const { copyMediaFile } = require("../media-storage");
const { adjustStock } = require("../stock");
const { normalizeTransferSku, makeTargetSku } = require("../transfer-sku");
const {
  canTransferAcrossBranches,
  selectCanonicalProductByName,
} = require("../transfer-rules");
const {
  toTransferNumber,
  groupTransferMovements,
} = require("../transfer-history");
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

router.get(
  "/transfers/history",
  authorize("owner", "manager", "admin", "gudang"),
  async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        100,
        Math.max(10, Number.parseInt(req.query.limit, 10) || 25),
      );
      const offset = (page - 1) * limit;
      const where = ["1=1"];
      const params = [];
      const requestedBranch = String(req.query.branch_id || "");
      const requestedBranchId = Number(requestedBranch);
      const ownerAll = req.user.role === "owner" && requestedBranch === "all";
      const scopedBranchId = ownerAll
        ? null
        : req.user.role === "owner" &&
            Number.isInteger(requestedBranchId) &&
            requestedBranchId > 0
          ? requestedBranchId
          : Number(req.user.branch_id);

      if (!ownerAll) {
        if (!Number.isInteger(scopedBranchId) || scopedBranchId <= 0) {
          throw fail(400, "Cabang riwayat transfer tidak valid");
        }
        where.push("(wf.branch_id = ? OR wt.branch_id = ?)");
        params.push(scopedBranchId, scopedBranchId);
      }

      const direction = String(req.query.direction || "");
      if (direction && !["outgoing", "incoming"].includes(direction)) {
        throw fail(400, "Arah transfer tidak valid");
      }
      if (direction === "outgoing" && scopedBranchId) {
        where.push("wf.branch_id = ?");
        params.push(scopedBranchId);
      }
      if (direction === "incoming" && scopedBranchId) {
        where.push("wt.branch_id = ?");
        params.push(scopedBranchId);
      }

      const status = String(req.query.status || "");
      if (status && !["pending", "approved", "completed", "cancelled"].includes(status)) {
        throw fail(400, "Status transfer tidak valid");
      }
      if (status) {
        where.push("st.status = ?");
        params.push(status);
      }

      const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
      const dateFrom = String(req.query.start || req.query.date_from || "");
      const dateTo = String(req.query.end || req.query.date_to || "");
      if (dateFrom && !validDate(dateFrom)) throw fail(400, "Tanggal mulai tidak valid");
      if (dateTo && !validDate(dateTo)) throw fail(400, "Tanggal akhir tidak valid");
      if (dateFrom) {
        where.push("st.created_at >= ?");
        params.push(`${dateFrom} 00:00:00`);
      }
      if (dateTo) {
        where.push("st.created_at <= ?");
        params.push(`${dateTo} 23:59:59`);
      }

      const search = String(req.query.search || "").trim().slice(0, 100);
      if (search) {
        const pattern = `%${search}%`;
        where.push(`EXISTS (
          SELECT 1
          FROM stock_transfer_items sti_search
          JOIN products p_search ON p_search.id = sti_search.product_id
          WHERE sti_search.transfer_id = st.id
            AND (p_search.name LIKE ? OR p_search.sku LIKE ?)
        )`);
        params.push(pattern, pattern);
      }

      const whereSql = where.join(" AND ");
      const joins = `
        JOIN warehouses wf ON wf.id = st.from_warehouse_id
        JOIN branches bf ON bf.id = wf.branch_id
        JOIN warehouses wt ON wt.id = st.to_warehouse_id
        JOIN branches bt ON bt.id = wt.branch_id
      `;
      const [rows] = await db.execute(
        `SELECT
           st.id,
           st.status,
           st.notes,
           st.created_at,
           wf.id AS source_warehouse_id,
           wf.name AS source_warehouse_name,
           bf.id AS source_branch_id,
           bf.name AS source_branch_name,
           bf.type AS source_branch_type,
           wt.id AS destination_warehouse_id,
           wt.name AS destination_warehouse_name,
           bt.id AS destination_branch_id,
           bt.name AS destination_branch_name,
           bt.type AS destination_branch_type,
           u.name AS admin_name,
           COUNT(DISTINCT sti.id) AS product_count,
           COALESCE(SUM(sti.quantity), 0) AS total_qty
         FROM stock_transfers st
         ${joins}
         LEFT JOIN users u ON u.id = st.created_by
         LEFT JOIN stock_transfer_items sti ON sti.transfer_id = st.id
         WHERE ${whereSql}
         GROUP BY st.id, st.status, st.notes, st.created_at,
           wf.id, wf.name, bf.id, bf.name,
           bf.type, wt.id, wt.name, bt.id, bt.name, bt.type, u.name
         ORDER BY st.created_at DESC, st.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM stock_transfers st
         ${joins}
         WHERE ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.total || 0);
      const ids = rows.map((row) => row.id);
      let detailRows = [];
      if (ids.length) {
        const placeholders = ids.map(() => "?").join(",");
        [detailRows] = await db.execute(
          `SELECT
             sm.reference_id AS transfer_id,
             sm.id AS mutation_id,
             sm.branch_id,
             sm.warehouse_id,
             sm.product_id,
             sm.variant_id,
             sm.qty,
             sm.stock_before,
             sm.stock_after,
             p.name AS product_name,
             p.sku AS product_sku,
             pv.color AS variant_color,
             b.name AS branch_name,
             w.name AS warehouse_name
           FROM stock_mutations sm
           JOIN products p ON p.id = sm.product_id
           JOIN branches b ON b.id = sm.branch_id
           LEFT JOIN warehouses w ON w.id = sm.warehouse_id
           LEFT JOIN product_variants pv ON pv.id = sm.variant_id
           WHERE sm.reference_type IN ('transfer', 'inter_store_transfer')
             AND sm.reference_id IN (${placeholders})
           ORDER BY sm.reference_id, sm.id`,
          ids,
        );
      }

      const grouped = groupTransferMovements(detailRows);
      const data = rows.map((row) => {
        const detail = grouped.get(String(row.id)) || { from: [], to: [] };
        return {
          id: row.id,
          number: toTransferNumber(row.created_at, row.id),
          created_at: row.created_at,
          status: row.status,
          notes: row.notes || "",
          admin: row.admin_name || "Sistem",
          source: {
            branch_id: row.source_branch_id,
            branch_name: row.source_branch_name,
            branch_type: row.source_branch_type,
            warehouse_id: row.source_warehouse_id,
            warehouse_name: row.source_warehouse_name,
          },
          destination: {
            branch_id: row.destination_branch_id,
            branch_name: row.destination_branch_name,
            branch_type: row.destination_branch_type,
            warehouse_id: row.destination_warehouse_id,
            warehouse_name: row.destination_warehouse_name,
          },
          product_count: Number(row.product_count || 0),
          total_qty: Number(row.total_qty || 0),
          details: detail,
        };
      });

      res.json({
        success: true,
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (e) {
      next(e);
    }
  },
);

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
      const sourceSql = canTransferAcrossBranches(req.user.role)
        ? "SELECT id,branch_id FROM warehouses WHERE id=? AND is_active=TRUE FOR UPDATE"
        : "SELECT id,branch_id FROM warehouses WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE";
      const sourceParams = canTransferAcrossBranches(req.user.role)
        ? [from]
        : [from, req.user.branch_id];
      const [src] = await c.execute(sourceSql, sourceParams);
      if (!src[0]) throw fail(404, "Gudang asal tidak ditemukan di toko Anda");
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
      let createdProduct = false;
      const [source] = await c.execute(
        canTransferAcrossBranches(req.user.role)
          ? "SELECT id,branch_id FROM warehouses WHERE id=? AND is_active=TRUE FOR UPDATE"
          : "SELECT id,branch_id FROM warehouses WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE",
        canTransferAcrossBranches(req.user.role) ? [from] : [from, req.user.branch_id],
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
      let createdProduct = false;
      for (const item of items) {
        const q = Number(item.quantity),
          productId = Number(item.product_id),
          variantId = item.variant_id ? Number(item.variant_id) : null;
        if (!Number.isInteger(productId) || !Number.isInteger(q) || q <= 0)
          throw fail(400, "Item transfer tidak valid");
        const [p] = await c.execute(
          "SELECT id,category_id,name,description,sku,barcode,price,cost,min_stock,gender FROM products WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE",
          [productId, branchId],
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
        const [nameMatches] = await c.execute(
          "SELECT id,name,sku FROM products WHERE branch_id=? AND is_active=TRUE AND LOWER(TRIM(name))=LOWER(TRIM(?)) ORDER BY id FOR UPDATE",
          [target[0].branch_id, p[0].name],
        );
        const nameMatch = selectCanonicalProductByName(nameMatches, p[0].name);
        let dest = nameMatch.product ? [{ id: nameMatch.product.id }] : [];
        const key = normalizeTransferSku(p[0].sku);
        const newSku = makeTargetSku(target[0].branch_id, p[0].sku);
        if (!dest[0]) {
          [dest] = await c.execute(
            "SELECT id FROM products WHERE branch_id=? AND is_active=TRUE AND (UPPER(TRIM(sku))=? OR UPPER(TRIM(sku))=CONCAT('B-',?) OR UPPER(TRIM(sku))=CONCAT('B',branch_id,'-',?)) ORDER BY id LIMIT 1 FOR UPDATE",
            [target[0].branch_id, key, key, key],
          );
        }
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
            "SELECT id,color,size,sku,barcode,price FROM product_variants WHERE product_id=? AND is_active=TRUE",
            [productId],
          );
          const variantMap = new Map();
          for (const v of variants) {
            const [vr] = await c.execute(
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
            variantMap.set(v.id, vr.insertId);
          }
          const [wholesale] = await c.execute(
            "SELECT min_qty,max_qty,price,variant_id FROM wholesale_prices WHERE product_id=? AND is_active=TRUE",
            [productId],
          );
          for (const w of wholesale) {
            const mappedVariantId = w.variant_id != null ? (variantMap.get(w.variant_id) || null) : null;
            await c.execute(
              "INSERT INTO wholesale_prices (product_id,variant_id,min_qty,max_qty,price,is_active) VALUES (?,?,?,?,?,TRUE)",
              [newProductId, mappedVariantId, w.min_qty, w.max_qty, w.price],
            );
          }
          const [photos] = await c.execute(
            "SELECT filename,path,media_type,is_primary,sort_order,variant_id,`transform` FROM product_photos WHERE product_id=?",
            [productId],
          );
          for (const ph of photos) {
            const newPath = await copyMediaFile(ph.path, "products");
            const mappedPhotoVariantId = ph.variant_id != null ? (variantMap.get(ph.variant_id) || null) : null;
            await c.execute(
              "INSERT INTO product_photos (product_id,filename,path,media_type,is_primary,sort_order,variant_id,`transform`) VALUES (?,?,?,?,?,?,?,?)",
              [
                newProductId,
                ph.filename,
                newPath,
                ph.media_type,
                ph.is_primary,
                ph.sort_order,
                mappedPhotoVariantId,
                ph.transform,
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
