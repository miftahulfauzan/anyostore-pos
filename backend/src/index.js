const app = require('./app');
const { port } = require('./config');

app.listen(port, () => console.log(`POS API listening on port ${port}`));
