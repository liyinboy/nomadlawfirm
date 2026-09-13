document.addEventListener('DOMContentLoaded', () => {
  // Navbar scroll state
  const navbar = document.querySelector('.navbar');
  const onScroll = () => {
    if (!navbar) return;
    if (window.scrollY > 40) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile menu
  const toggle = document.querySelector('.nav-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  const openMobileMenu = () => {
    if (!mobileMenu) return;
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  const closeMobileMenu = () => {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
  };
  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      mobileMenu.classList.contains('open') ? closeMobileMenu() : openMobileMenu();
    });
    mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileMenu));
  }
  // Bottom app nav "Menu" button opens the same full-screen menu
  const bnMenuBtn = document.getElementById('bn-menu-btn');
  if (bnMenuBtn) bnMenuBtn.addEventListener('click', openMobileMenu);

  // Scroll reveal
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  // Gallery lightbox
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    const lbImg = lightbox.querySelector('img');
    const lbVideoWrap = lightbox.querySelector('.lb-video-wrap');
    const lbIframe = lbVideoWrap ? lbVideoWrap.querySelector('iframe') : null;
    const lbNativeVideo = lightbox.querySelector('.lb-video-native');
    const lbCap = lightbox.querySelector('.lb-cap');

    const hideAll = () => {
      lbImg.style.display = 'none';
      if (lbVideoWrap) lbVideoWrap.style.display = 'none';
      if (lbNativeVideo) { lbNativeVideo.style.display = 'none'; lbNativeVideo.pause(); }
    };

    document.querySelectorAll('.gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const isVideo = item.dataset.type === 'video';
        const source = item.dataset.videoSource;
        hideAll();
        if (isVideo && source === 'upload' && lbNativeVideo) {
          lbNativeVideo.src = item.dataset.videoUrl;
          lbNativeVideo.style.display = 'block';
          lbNativeVideo.play().catch(() => {});
        } else if (isVideo && source === 'youtube' && lbIframe) {
          lbIframe.src = `https://www.youtube.com/embed/${item.dataset.videoId}?autoplay=1&rel=0`;
          lbVideoWrap.style.display = 'block';
        } else {
          lbImg.src = item.dataset.full || item.querySelector('img, video').src;
          lbImg.style.display = 'block';
        }
        lbCap.textContent = item.dataset.caption || '';
        lightbox.classList.add('open');
      });
    });

    const closeLightbox = () => {
      lightbox.classList.remove('open');
      if (lbIframe) lbIframe.src = ''; // stop YouTube playback
      if (lbNativeVideo) { lbNativeVideo.pause(); lbNativeVideo.removeAttribute('src'); lbNativeVideo.load(); }
    };
    lightbox.querySelector('.lb-close').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
  }

  // Auto-hide flash messages
  document.querySelectorAll('.flash').forEach(f => {
    setTimeout(() => { f.style.transition = 'opacity .5s'; f.style.opacity = '0'; setTimeout(() => f.remove(), 500); }, 5000);
  });

  // ---------------------------------------------------------------
  // Konsultasi chat: kirim pesan via AJAX + polling balasan advokat
  // ---------------------------------------------------------------
  const chatWindow = document.getElementById('chat-window');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  if (chatWindow && window.__chatThread) {
    let lastMsgId = window.__chatThread.lastMsgId;
    chatWindow.scrollTop = chatWindow.scrollHeight;

    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const appendBubble = (msg, fromServer) => {
      const div = document.createElement('div');
      div.className = 'chat-bubble ' + (msg.sender === 'client' ? 'from-client' : 'from-admin');
      div.dataset.msgId = msg.id;
      const time = new Date(msg.sentAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `<span class="who">${msg.sender === 'client' ? 'Anda' : 'Advokat'}</span><p>${escapeHtml(msg.body)}</p><span class="time">${time}</span>`;
      chatWindow.appendChild(div);
      chatWindow.scrollTop = chatWindow.scrollHeight;
      if (fromServer) lastMsgId = msg.id;
    };

    const poll = async () => {
      try {
        const url = '/konsultasi/cek' + (lastMsgId ? `?since=${encodeURIComponent(lastMsgId)}` : '');
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        (data.messages || []).forEach(m => {
          if (m.sender === 'client') { lastMsgId = m.id; return; } // sudah tampil optimis, cukup majukan kursor
          appendBubble(m, true);
        });
        if (data.status === 'closed' && window.__chatThread.status === 'open') {
          window.location.reload();
        }
      } catch (e) { /* diamkan; coba lagi di interval berikutnya */ }
    };
    const pollTimer = setInterval(poll, 4000);
    window.addEventListener('beforeunload', () => clearInterval(pollTimer));

    if (chatForm && chatInput) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        chatInput.focus();
        appendBubble({ id: 'local-' + Date.now(), sender: 'client', body: text, sentAt: new Date().toISOString() }, false);
        try {
          await fetch('/konsultasi/kirim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: 'message=' + encodeURIComponent(text)
          });
          poll();
        } catch (err) { /* pesan tetap tampil optimis; akan konsisten di poll berikutnya */ }
      });
    }
  }
  // ---------------------------------------------------------------
  // Video Ad Widget (video terbaru dari galeri, muncul otomatis di beranda)
  // ---------------------------------------------------------------
  const videoAd = document.getElementById('video-ad');
  if (videoAd) {
    const videoId = videoAd.dataset.videoId;
    const dismissKey = 'nlf_video_ad_dismissed_' + videoId;
    const mediaEl = document.getElementById('video-ad-el');
    const muteBtn = document.getElementById('video-ad-mute');
    const closeBtn = document.getElementById('video-ad-close');
    const isIframe = mediaEl && mediaEl.tagName === 'IFRAME';
    let muted = true;

    const alreadyDismissed = () => {
      try { return sessionStorage.getItem(dismissKey) === '1'; } catch (e) { return false; }
    };
    const setDismissed = () => {
      try { sessionStorage.setItem(dismissKey, '1'); } catch (e) { /* abaikan bila storage diblokir */ }
    };

    if (!alreadyDismissed()) {
      setTimeout(() => { videoAd.classList.add('is-visible'); }, 1800);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        videoAd.classList.remove('is-visible');
        setDismissed();
        setTimeout(() => {
          if (!isIframe && mediaEl) mediaEl.pause();
          videoAd.style.display = 'none';
        }, 450);
      });
    }

    if (muteBtn) {
      const iconMute = muteBtn.querySelector('.ic-mute');
      const iconUnmute = muteBtn.querySelector('.ic-unmute');
      muteBtn.addEventListener('click', () => {
        muted = !muted;
        if (iconMute && iconUnmute) {
          iconMute.style.display = muted ? '' : 'none';
          iconUnmute.style.display = muted ? 'none' : '';
        }
        if (isIframe) {
          // YouTube dalam iframe lintas-domain tidak bisa di-toggle langsung,
          // jadi kita muat ulang sumbernya dengan parameter mute yang baru.
          const ytId = mediaEl.dataset.videoId;
          const base = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${ytId}&controls=0&modestbranding=1&playsinline=1&rel=0`;
          mediaEl.src = base;
        } else if (mediaEl) {
          mediaEl.muted = muted;
          if (!muted) mediaEl.play().catch(() => {});
        }
      });
    }
  }
});

// Daftarkan service worker supaya website bisa di-"Add to Home Screen" dan
// tetap bisa dibuka (aset dasarnya) saat koneksi lambat/terputus sebentar.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
