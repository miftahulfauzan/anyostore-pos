// Satu-satunya definisi pembulatan uang di backend. Sebelumnya tiap route
// punya versi sendiri (ada yang tanpa Number.EPSILON), sehingga nilai seperti
// 1.005 bisa dibulatkan berbeda (100 vs 101) antar fitur.
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

module.exports = { money };
