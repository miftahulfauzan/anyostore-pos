function getProductSelectionPlacement(view) {
  return view === 'grid' ? 'thumbnail' : 'column';
}

module.exports = { getProductSelectionPlacement };
