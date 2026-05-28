'use strict';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('form-profile-password')?.addEventListener('submit', changePassword);
});

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
