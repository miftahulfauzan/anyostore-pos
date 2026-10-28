function transactionBranch(user, requested, { allowAll = false } = {}) {
  if (user.role !== 'owner') return user.branch_id;
  if (allowAll && requested === 'all') return null;
  if (requested == null || requested === '') return user.branch_id;
  const id = Number(requested);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw Object.assign(new Error('Cabang tidak valid'), { status: 400 });
  }
  return id;
}

module.exports = { transactionBranch };
