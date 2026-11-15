// Mark brand Shopee & TikTok untuk tombol marketplace.
// Digambar sebagai SVG inline supaya tetap tajam di semua ukuran dan tidak
// menambah permintaan gambar. Bentuk mengikuti logo resmi: Shopee = lingkaran
// oranye dengan tas belanja hitam + huruf S; TikTok = tas putih dengan sisi
// cyan/merah di atas kotak hitam.

export function ShopeeMark({ size = 18, style }) {
  const s = Number(size) || 18;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
    >
      <circle cx="24" cy="24" r="24" fill="#ee4d2d" />
      {/* gagang tas */}
      <path d="M17 20v-3a7 7 0 0 1 14 0v3" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="round" />
      {/* badan tas */}
      <path d="M13.5 19.5h21l1.6 15.2a3 3 0 0 1-3 3.3H14.9a3 3 0 0 1-3-3.3z" fill="#111" />
      {/* huruf S */}
      <text
        x="24"
        y="33.4"
        textAnchor="middle"
        fill="#ee4d2d"
        fontFamily="Helvetica, Arial, sans-serif"
        fontSize="13.5"
        fontWeight="800"
      >
        S
      </text>
    </svg>
  );
}

export function TikTokMark({ size = 18, style }) {
  const s = Number(size) || 18;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
    >
      <rect width="48" height="48" rx="10" fill="#010101" />
      {/* bayangan cyan & merah di belakang tas */}
      <path d="M17 15v17.5a4.5 4.5 0 1 0 3 4.2V15z" fill="#25f4ee" transform="translate(-1.4 0)" />
      <path d="M17 15v17.5a4.5 4.5 0 1 0 3 4.2V15z" fill="#fe2c55" transform="translate(1.4 0)" />
      {/* tas putih */}
      <path d="M17 15v17.5a4.5 4.5 0 1 0 3.4 4.35V15z" fill="#fff" />
      <path d="M20.4 15.6h6.2l-.5 5.6h-5.7z" fill="#fff" />
      <path d="M24.2 18.6h7.2l-.6 6.1h-6.6z" fill="#fff" />
      <circle cx="20.5" cy="26.4" r="1.7" fill="#010101" />
      <circle cx="27.2" cy="26.4" r="1.7" fill="#010101" />
    </svg>
  );
}