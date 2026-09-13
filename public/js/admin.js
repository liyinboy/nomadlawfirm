document.addEventListener('DOMContentLoaded', () => {
  // Mobile admin nav toggle
  const adminToggle = document.getElementById('admin-mobile-toggle');
  const adminNav = document.getElementById('admin-nav');
  if (adminToggle && adminNav) {
    adminToggle.addEventListener('click', () => adminNav.classList.toggle('mobile-open'));
  }

  // Confirm before delete
  document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', (e) => {
      const msg = form.dataset.confirm || 'Yakin ingin menghapus data ini?';
      if (!confirm(msg)) e.preventDefault();
    });
  });

  // Live image preview on file input
  document.querySelectorAll('input[type="file"][data-preview]').forEach(input => {
    const target = document.querySelector(input.dataset.preview);
    input.addEventListener('change', () => {
      if (input.files && input.files[0] && target) {
        const reader = new FileReader();
        reader.onload = (e) => { target.src = e.target.result; target.style.display = 'block'; };
        reader.readAsDataURL(input.files[0]);
      }
    });
  });

  // Auto-hide flash
  document.querySelectorAll('.flash').forEach(f => {
    setTimeout(() => { f.style.transition = 'opacity .5s'; f.style.opacity = '0'; setTimeout(() => f.remove(), 500); }, 5000);
  });
});
