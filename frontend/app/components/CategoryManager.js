'use client';

import { useEffect, useState } from 'react';

export default function CategoryManager({ api, headers }) {
  const [categories, setCategories] = useState([]);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const [dragFrom, setDragFrom] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  async function load() {
    try {
      const r = await fetch(`${api}/products/categories?all=true`, { headers: headers() });
      const b = await r.json();
      setCategories(b.data || []);
    } catch {}
  }

  useEffect(() => { load(); }, []);

  async function saveOrder(list) {
    try {
      const r = await fetch(`${api}/products/categories/reorder`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ order: list.map((c) => c.id) }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Urutan kategori disimpan. Landing page mengikuti urutan ini.');
    } catch (e) { setMessage(e.message); }
  }

  function onDrop(toIndex) {
    if (dragFrom == null || dragFrom === toIndex) {
      setDragFrom(null);
      setDropTarget(null);
      return;
    }
    setCategories((current) => {
      const next = [...current];
      const [moved] = next.splice(dragFrom, 1);
      next.splice(toIndex, 0, moved);
      saveOrder(next);
      return next;
    });
    setDragFrom(null);
    setDropTarget(null);
  }

  async function addCategory(e) {
    e.preventDefault();
    if (!newName.trim()) return setMessage('Nama wajib diisi');
    try {
      const r = await fetch(`${api}/products/categories`, { method: 'POST', headers: headers(), body: JSON.stringify({ name: newName.trim() }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setNewName('');
      setMessage('Kategori berhasil ditambahkan.');
      load();
    } catch (e) { setMessage(e.message); }
  }

  async function updateCategory(id) {
    try {
      const r = await fetch(`${api}/products/categories/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ name: editName.trim() }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setEditing(null);
      setMessage('Kategori berhasil diperbarui.');
      load();
    } catch (e) { setMessage(e.message); }
  }

  async function deleteCategory(id, name) {
    if (!confirm(`Hapus kategori "${name}"?`)) return;
    try {
      const r = await fetch(`${api}/products/categories/${id}`, { method: 'DELETE', headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setCategories((current) => current.filter((c) => c.id !== id));
      setMessage('Kategori berhasil dihapus.');
    } catch (e) { setMessage(e.message); }
  }

  return (
    <section className="panel">
      <h2>Kategori Produk</h2>
      <p className="muted" style={{ fontSize: '.85rem' }}>Tarik baris untuk mengatur urutan — urutan ini dipakai di landing page. Kategori baru otomatis di urutan terakhir.</p>

      <form onSubmit={addCategory} style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama kategori" required style={{ flex: 1, minWidth: 180 }} />
        <button type="submit">Tambah</button>
      </form>

      {message && <p className="message" role="status" style={{ marginTop: '.5rem' }}>{message}</p>}

      <div className="table-wrap" style={{ marginTop: '.75rem' }}>
        <table>
          <thead><tr><th style={{ width: 60 }}>ID</th><th>Nama</th><th>Aksi</th></tr></thead>
          <tbody>
            {categories.map((c, index) => (
              <tr
                key={c.id}
                draggable
                onDragStart={(e) => { setDragFrom(index); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropTarget !== index) setDropTarget(index); }}
                onDrop={(e) => { e.preventDefault(); onDrop(index); }}
                onDragEnd={() => { setDragFrom(null); setDropTarget(null); }}
                style={{ cursor: 'grab', opacity: dragFrom === index ? .45 : 1, background: dropTarget === index && dragFrom !== index ? '#eef2ff' : undefined }}
              >
                <td>{c.id}</td>
                <td>
                  {editing === c.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', maxWidth: 220 }} />
                  ) : (
                    <strong>{c.name}</strong>
                  )}
                </td>
                <td style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                  {editing === c.id ? (
                    <>
                      <button type="button" className="small" onClick={() => updateCategory(c.id)}>Simpan</button>
                      <button type="button" className="small secondary" onClick={() => setEditing(null)}>Batal</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="small secondary" onClick={() => { setEditing(c.id); setEditName(c.name); }}>Edit</button>
                      <button type="button" className="small secondary" style={{ color: '#dc2626' }} onClick={() => deleteCategory(c.id, c.name)}>Hapus</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!categories.length && <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Belum ada kategori</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
