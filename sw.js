// ── Service Worker — Ministério 60+ ──────────────────────
const NOTIFY_NUM = '5511995823831';
const IDB        = 'min60plus_sw';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

// Recebe mensagens da página principal
self.addEventListener('message', async e => {
  if (e.data?.type === 'SYNC')      await storeMembers(e.data.members);
  if (e.data?.type === 'CHECK_NOW') await checkBirthdays();
});

// Periodic Background Sync (Chrome/Edge com site salvo)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'birthday-check') e.waitUntil(checkBirthdays());
});

// Clique na notificação → abre WhatsApp
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.waUrl || '/';
  e.waitUntil(clients.openWindow(url));
});

// ── IndexedDB ─────────────────────────────────────────────
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = ev => {
      ev.target.result.createObjectStore('members', { keyPath: 'id' });
      ev.target.result.createObjectStore('meta', {});
    };
    r.onsuccess = ev => res(ev.target.result);
    r.onerror   = ev => rej(ev);
  });
}

async function storeMembers(list) {
  const db = await openDB();
  const tx = db.transaction('members', 'readwrite');
  const st = tx.objectStore('members');
  await new Promise(r => { st.clear().onsuccess = r; });
  list.forEach(m => st.put(m));
  await new Promise(r => { tx.oncomplete = r; });
}

async function getMembers() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction('members').objectStore('members').getAll();
    r.onsuccess = ev => res(ev.result || []);
    r.onerror   = ev => rej(ev);
  });
}

async function getMeta(key) {
  const db = await openDB();
  return new Promise(res => {
    const r = db.transaction('meta').objectStore('meta').get(key);
    r.onsuccess = ev => res(ev.target.result);
    r.onerror   = ()  => res(null);
  });
}

async function setMeta(key, val) {
  const db = await openDB();
  return new Promise(r => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(val, key);
    tx.oncomplete = r;
  });
}

// ── Verificação de aniversários ───────────────────────────
async function checkBirthdays() {
  const today = new Date();
  const key   = `notif_${today.getFullYear()}_${today.getMonth()}_${today.getDate()}`;

  // Evita notificar mais de uma vez no mesmo dia
  const already = await getMeta(key);
  if (already) return;

  const members   = await getMembers();
  const aniversariantes = members.filter(m => {
    if (!m.birthDate) return false;
    const [y, mo, d] = m.birthDate.split('-');
    const b = new Date(+y, +mo - 1, +d);
    return b.getMonth() === today.getMonth() && b.getDate() === today.getDate();
  });

  if (!aniversariantes.length) return;

  await setMeta(key, true);

  for (const m of aniversariantes) {
    const nascimento = new Date(m.birthDate + 'T00:00:00');
    const anos = today.getFullYear() - nascimento.getFullYear();
    const msg  = `🎂 *Lembrete de Aniversário — Ministério 60+*\n\nHoje, ${today.toLocaleDateString('pt-BR')}, é aniversário de:\n\n👤 *${m.name}*\n📱 ${m.phone}\n🎉 Completando *${anos} anos!*\n\nNão esqueça de ligar e parabenizar! 🙏❤️`;
    const waUrl = `https://wa.me/${NOTIFY_NUM}?text=${encodeURIComponent(msg)}`;

    await self.registration.showNotification(`🎂 Aniversário: ${m.name}`, {
      body:               `Hoje completa ${anos} anos! Toque para enviar parabéns pelo WhatsApp.`,
      icon:               './logo.png',
      badge:              './logo.png',
      tag:                `bday-${m.id}-${key}`,
      data:               { waUrl },
      requireInteraction: true,
      vibrate:            [200, 100, 200]
    });
  }
}
