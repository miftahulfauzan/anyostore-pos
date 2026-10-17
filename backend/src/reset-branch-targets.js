const TARGET_NAME_GROUPS = [
  ['Toko B', 'Toko Blok B', 'Blok B'],
  ['Anyostore Metro', 'Metro'],
];

function pickUniqueBranch(branches, names, description, availableBranches = branches) {
  const matches = branches.filter((branch) => names.includes(branch.name));
  if (matches.length !== 1) {
    throw new Error(`${description}: expected exactly one match for ${names.join(' / ')}; found ${matches.length}. Branches=${JSON.stringify(availableBranches)}`);
  }
  return matches[0];
}

module.exports = { TARGET_NAME_GROUPS, pickUniqueBranch };
