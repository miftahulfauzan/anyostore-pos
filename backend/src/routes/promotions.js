const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const router = express.Router();
router.use(authenticate);
const fail = (status, message) => Object.assign(new Error(message), { status });
const { money } = require('../money');
async function findPromotion(connection, branchId, code, subtotal, pcs = 0) {
  const [rows] = await connection.execute(`SELECT * FROM promotions WHERE branch_id=? AND UPPER(code)=UPPER(?) AND is_active=TRUE AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>=NOW()) AND (usage_limit IS NULL OR usage_count<usage_limit) FOR UPDATE`, [branchId, String(code || '').trim()]);
  const promo = rows[0]; if (!promo) throw fail(400, 'Kode promo tidak berlaku');
  if (Number(subtotal) < Number(promo.min_purchase)) throw fail(400, 'Belanja minimum promo belum terpenuhi');
  let discount;
  if (promo.discount_type === 'per_pcs') {
    if (Number(pcs) <= 0) throw fail(400, 'Jumlah pcs wajib diisi untuk voucher per pcs');
    discount = money(Number(promo.discount_value) * Number(pcs));
  } else if (promo.discount_type === 'percentage') {
    discount = money(subtotal * Number(promo.discount_value) / 100);
  } else {
    discount = Number(promo.discount_value);
  }
  if (promo.max_discount !== null) discount = Math.min(discount, Number(promo.max_discount));
  return { promo, discount: money(Math.min(discount, subtotal)) };
}
router.get('/', authorize('owner','manager','admin'), async (req,res,next) => { try { const requested=Number(req.query.branch_id); const branchId=req.user.role==='owner'&&Number.isInteger(requested)?requested:req.user.branch_id; const [rows] = await db.execute('SELECT * FROM promotions WHERE branch_id=? ORDER BY created_at DESC',[branchId]); res.json({success:true,data:rows}); } catch(e){next(e);} });
router.post('/', authorize('owner','manager','admin'), async (req,res,next) => { try { const p=req.body; const requestedBranch=Number(p.branch_id); const branchId=p && req.user.role==='owner'&&Number.isInteger(requestedBranch)?requestedBranch:req.user.branch_id; if(!p.code?.trim()||!p.name?.trim()||!['percentage','nominal','per_pcs'].includes(p.discount_type)||Number(p.discount_value)<=0) throw fail(400,'Data promo tidak valid'); const [r]=await db.execute('INSERT INTO promotions (branch_id,code,name,discount_type,discount_value,min_purchase,max_discount,starts_at,ends_at,usage_limit) VALUES (?,?,?,?,?,?,?,?,?,?)',[branchId,p.code.trim().toUpperCase(),p.name.trim(),p.discount_type,money(p.discount_value),money(p.min_purchase||0),p.max_discount?money(p.max_discount):null,p.starts_at||null,p.ends_at||null,p.usage_limit?Number(p.usage_limit):null]);res.status(201).json({success:true,data:{id:r.insertId}}); }catch(e){next(e);} });
router.post('/validate', async (req,res,next) => { try { const requestedBranch=Number(req.body.branch_id); const branchId=req.user.role==='owner'&&Number.isInteger(requestedBranch)?requestedBranch:req.user.branch_id; const c=await db.getConnection(); try { await c.beginTransaction(); const data=await findPromotion(c,branchId,req.body.code,Number(req.body.subtotal||0),Number(req.body.pcs||0)); await c.rollback(); res.json({success:true,data:{id:data.promo.id,code:data.promo.code,name:data.promo.name,discount:data.discount}}); } finally { c.release(); } } catch(e){next(e);} });
router.put('/:id/toggle-active', authorize('owner','manager','admin'), async (req,res,next)=>{try{
  const requested=Number(req.body?.branch_id);
  const branchId=req.user.role==='owner'&&Number.isInteger(requested)?requested:req.user.branch_id;
  const [r]=await db.execute('UPDATE promotions SET is_active=NOT is_active WHERE id=? AND branch_id=?',[req.params.id,branchId]);
  if(!r.affectedRows)throw fail(404,'Promo tidak ditemukan');res.json({success:true});}catch(e){next(e);}});
router.delete('/:id', authorize('owner','manager','admin'), async (req,res,next)=>{try{
  const requested=Number(req.query.branch_id);
  const branchId=req.user.role==='owner'&&Number.isInteger(requested)?requested:req.user.branch_id;
  const [r]=await db.execute('DELETE FROM promotions WHERE id=? AND branch_id=?',[req.params.id,branchId]);
  if(!r.affectedRows)throw fail(404,'Promo tidak ditemukan');res.json({success:true});}catch(e){next(e);}});
module.exports = { router, findPromotion };
