export {};

const TOKEN_KEY = 'ritmo-presence-token-v1';

let currentAvatar = '';
let scheduled = false;

function isUsableAvatar(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function paintBrandAvatar(avatar = currentAvatar) {
  if (!isUsableAvatar(avatar)) return;
  currentAvatar = avatar;

  document.querySelectorAll<HTMLElement>('.brand-mark').forEach((brand) => {
    const existing = brand.querySelector<HTMLImageElement>('img[data-brand-avatar]');
    if (existing?.src === avatar) return;

    const image = document.createElement('img');
    image.src = avatar;
    image.alt = 'Foto de perfil';
    image.dataset.brandAvatar = 'true';
    image.decoding = 'async';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'cover';
    image.style.display = 'block';

    image.addEventListener('error', () => image.remove(), { once: true });
    brand.replaceChildren(image);
    brand.classList.add('has-profile-photo');
  });
}

function schedulePaint() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    paintBrandAvatar();

    const profileImage = document.querySelector<HTMLImageElement>('.profile-avatar img');
    if (profileImage?.src) paintBrandAvatar(profileImage.src);
  });
}

async function loadAccountAvatar() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  try {
    const response = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return;

    const payload = await response.json();
    if (isUsableAvatar(payload?.user?.avatar)) {
      paintBrandAvatar(payload.user.avatar);
    }
  } catch {
    // Mantém a inicial como fallback quando a conta está offline.
  }
}

const observer = new MutationObserver(schedulePaint);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('load', () => {
  schedulePaint();
  void loadAccountAvatar();
});

window.addEventListener('focus', () => void loadAccountAvatar());
