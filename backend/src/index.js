const app = require('./app');
const { port } = require('./config');

// Audit stok otomatis (boot + harian 03.00 WIB) supaya products.stock /
// product_variants.stock selalu sinkron dengan warehouse_stocks.
require('./stock-audit').startStockAudit();

app.listen(port, () => console.log(`POS API listening on port ${port}`));
