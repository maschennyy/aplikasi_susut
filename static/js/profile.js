'use strict';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('form-profile-info')?.addEventListener('submit', updateProfile);
  document.getElementById('form-profile-password')?.addEventListener('submit', changePassword);
});

async function updateProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const resp = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal menyimpan profile.');
    if (window.showToast) window.showToast('Profile berhasil diperbarui', 'success');
  } catch (err) {
    if (window.showToast) window.showToast(err.message, 'error');
  }
}

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    const resp = await fetch('/api/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal mengganti password.');
    form.reset();
    if (window.showToast) window.showToast('Password berhasil diganti', 'success');
  } catch (err) {
    if (window.showToast) window.showToast(err.message, 'error');
  }
}
