const { TRANSFER_CANCELLATION_ROLES } = require('./permissions');

const fail = (status, message) => Object.assign(new Error(message), { status });

function canCancelTransfer(user = {}, transfer = {}) {
  if (!TRANSFER_CANCELLATION_ROLES.includes(user.role)) return false;
  if (user.role === 'owner') return true;

  const branchId = Number(user.branch_id);
  return branchId === Number(transfer.source_branch_id)
    || branchId === Number(transfer.destination_branch_id)
    || Number(user.id) === Number(transfer.created_by);
}

function validateTransferStatus(status) {
  if (status === 'cancelled') throw fail(409, 'Transfer sudah dibatalkan');
  if (status !== 'completed') throw fail(400, 'Hanya transfer selesai yang dapat dibatalkan');
  return null;
}

function buildTransferCancellationMovements(transfer, items, reason = '') {
  const cleanReason = String(reason || '').trim().slice(0, 255);
  const note = `Pembatalan ${transfer.number || `transfer #${transfer.id}`}${cleanReason ? `: ${cleanReason}` : ''}`;
  const crossBranch = Number(transfer.source_branch_id) !== Number(transfer.destination_branch_id);

  return items.flatMap((item) => {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw fail(400, 'Rincian transfer tidak valid');
    }
    if (crossBranch && item.destination_product_id == null) {
      throw fail(400, 'Mapping produk tujuan transfer tidak tersedia');
    }
    if (crossBranch && item.variant_id != null && item.destination_variant_id == null) {
      throw fail(400, 'Mapping varian tujuan transfer tidak tersedia');
    }
    return [
      {
        side: 'destination',
        branchId: Number(transfer.destination_branch_id),
        warehouseId: Number(transfer.destination_warehouse_id),
        productId: Number(item.destination_product_id ?? item.product_id),
        variantId: item.destination_variant_id == null
          ? (item.variant_id == null ? null : Number(item.variant_id))
          : Number(item.destination_variant_id),
        delta: -quantity,
        type: 'adjustment',
        referenceType: 'transfer_cancel',
        referenceId: Number(transfer.id),
        notes: note,
      },
      {
        side: 'source',
        branchId: Number(transfer.source_branch_id),
        warehouseId: Number(transfer.source_warehouse_id),
        productId: Number(item.product_id),
        variantId: item.variant_id == null ? null : Number(item.variant_id),
        delta: quantity,
        type: 'adjustment',
        referenceType: 'transfer_cancel',
        referenceId: Number(transfer.id),
        notes: note,
      },
    ];
  });
}

module.exports = {
  TRANSFER_CANCELLATION_ROLES,
  buildTransferCancellationMovements,
  canCancelTransfer,
  validateTransferStatus,
};
