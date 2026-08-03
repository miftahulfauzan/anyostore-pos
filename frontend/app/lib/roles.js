export const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  admin: 'Admin',
  kasir: 'Kasir',
  gudang: 'Admin Gudang',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : '');
}
