'use strict';
const $ = id => document.getElementById(id),
  KEY = 'lunch-club:v1',
  categories = ['全部', '早餐', '午餐', '晚餐', '夜宵'],
  emojis = ['🍜', '🍚', '🥟', '🍲', '🍔', '🍕', '🥗', '🍢', '🥪', '🍣', '🍰', '🧋'];
let state = {
    version: 1,
    shops: [],
    history: []
  },
  filter = '全部',
  spinning = false,
  angle = 0,
  editing = null,
  toastTimer, confirmAction = null,
  storageBlocked = false;

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true, 4200)
}

function validate(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.shops) || data.shops.length > 100 || !Array.isArray(data.history) || data.history.length > 20) throw Error('备份格式不正确');
  const ids = new Set();
  const shops = data.shops.map(s => {
    if (!s || typeof s.id !== 'string' || !s.id || s.id.length > 100 || ids.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 32 || !emojis.includes(s.emoji) || !['随时', ...categories.slice(1)].includes(s.category) || typeof s.note !== 'string' || s.note.length > 80 || typeof s.enabled !== 'boolean' || !(s.price === null || (Number.isInteger(s.price) && s.price >= 0 && s.price <= 9999))) throw Error('店铺数据不正确');
    ids.add(s.id);
    return {
      id: s.id,
      name: s.name.trim(),
      emoji: s.emoji,
      category: s.category,
      price: s.price,
      note: s.note,
      enabled: s.enabled
    }
  });
  const history = data.history.map(h => {
    if (!h || typeof h.name !== 'string' || h.name.length > 32 || !emojis.includes(h.emoji) || !Number.isFinite(h.time) || h.time < 0 || h.time > 8640000000000000) throw Error('历史记录不正确');
    return {
      name: h.name,
      emoji: h.emoji,
      time: h.time
    }
  });
  return {
    version: 1,
    shops,
    history
  }
}
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = validate(JSON.parse(raw))
} catch (error) {
  storageBlocked = true;
  $('save-status').textContent = '储存读取异常 · 请先导出备份';
  setTimeout(() => toast('未能读取原菜单。将尝试获取共享菜单。'), 100)
}
let revision = 0,
  cloudReady = false,
  saving = false,
  syncing = false,
  localMigration = state.shops.map(s => ({
    ...s
  }));
try {
  const cached = localStorage.getItem(KEY + ':cloud');
  if (cached) state = validate(JSON.parse(cached))
} catch {}
let hadLocal = (() => {
  try {
    return !storageBlocked && !!localStorage.getItem(KEY)
  } catch {
    return false
  }
})();

function persist() {
  if (storageBlocked) return false;
  try {
    localStorage.setItem(KEY + ':cloud', JSON.stringify(state));
    return true
  } catch {
    return false
  }
}

function cloudStatus(message) {
  $('save-status').textContent = message
}
async function cloudRequest(method = 'GET', body) {
  const response = await fetch('/eat/api/pool', {
    method,
    cache: 'no-store',
    headers: body ? {
      'Content-Type': 'application/json'
    } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000)
  });
  let data;
  try {
    data = await response.json()
  } catch {
    throw Error('共享服务尚未启用，请完成数据库部署')
  }
  if (!response.ok) {
    const error = Error(data.error || '同步失败，请稍后重试');
    error.data = data;
    error.status = response.status;
    throw error
  }
  return data
}

function applyCloud(data) {
  if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw Error('共享菜单版本无效');
  const shops = data.shops === null ? [] : validate({
    version: 1,
    shops: data.shops,
    history: []
  }).shops;
  state.shops = shops;
  revision = data.revision;
  cloudReady = true;
  persist();
  $('migrate').hidden = !hadLocal;
}
async function syncPool(manual = false) {
  if (syncing || saving || spinning || $('editor').open || $('confirm-dialog').open) return;
  syncing = true;
  render();
  try {
    const data = await cloudRequest();
    const changed = !cloudReady || data.revision !== revision;
    if (changed) {
      applyCloud(data);
      resetResult();
      render()
    }
    cloudStatus('云端共用 · 已同步');
    if (manual) toast('共享奖池已更新')
  } catch (error) {
    cloudStatus(cloudReady ? '同步暂断 · 点击同步重试' : '共享未连接 · 点击同步重试');
    if (manual) toast(error.message)
  } finally {
    syncing = false;
    render()
  }
}
async function saveShops(shops) {
  if (saving || syncing || !cloudReady) {
    toast('请先连接共享奖池');
    return false
  }
  saving = true;
  cloudStatus('正在保存到云端…');
  render();
  try {
    const data = await cloudRequest('PUT', {
      revision,
      shops
    });
    applyCloud(data);
    cloudStatus('云端共用 · 已保存');
    resetResult();
    return true
  } catch (error) {
    if (error.status === 409) {
      applyCloud(error.data);
      cloudStatus('奖池已更新 · 请重新确认修改')
    } else cloudStatus('云端保存失败 · 请重试');
    toast(error.message);
    return false
  } finally {
    saving = false;
    render()
  }
}
$('sync-now').onclick = () => syncPool(true);
$('migrate').onclick = () => confirm('共享这台设备原来的菜单？', '将替换当前共享奖池，所有人都能看到和修改。', async () => {
  if (await saveShops(localMigration)) {
    localMigration = [];
    hadLocal = false;
    try {
      localStorage.removeItem(KEY)
    } catch {}
    $('migrate').hidden = true;
    toast('本机菜单已共享')
  }
});

function eligible() {
  return state.shops.filter(s => s.enabled && (filter === '全部' || s.category === '随时' || s.category === filter))
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node
}

function render() {
  const list = eligible();
  $('total-count').textContent = state.shops.length + ' 家';
  $('eligible-count').textContent = list.length + ' 家待翻牌';
  $('spin').disabled = spinning || saving || syncing || !list.length;
  $('spin-label').textContent = spinning ? '命运正在下单…' : list.length ? '帮我决定！' : '先添加或启用一家店';
  $('add').disabled = spinning || saving || !cloudReady || syncing;
  $('import').disabled = spinning || saving || !cloudReady || syncing;
  $('migrate').disabled = spinning || saving || !cloudReady || syncing;
  $('sync-now').disabled = spinning || saving || syncing;
  $('shop-form').querySelector('button[type=submit]').disabled = saving;
  $('delete-shop').disabled = saving;
  $('clear-history').disabled = spinning || !state.history.length;
  $('filters').replaceChildren();
  categories.forEach(c => {
    const b = element('button', 'chip' + (filter === c ? ' active' : ''), c);
    b.setAttribute('aria-pressed', String(filter === c));
    b.disabled = spinning;
    b.onclick = () => {
      filter = c;
      resetResult();
      render()
    };
    $('filters').append(b)
  });
  $('cards').replaceChildren();
  const shown = state.shops.filter(s => filter === '全部' || s.category === '随时' || s.category === filter);
  if (!shown.length) $('cards').append(element('div', 'empty', '这里还没有店铺，添加一家喜欢的小店吧。'));
  shown.forEach(s => {
    const row = element('div', 'shop' + (s.enabled ? '' : ' off'));
    row.append(element('div', 'food-icon', s.emoji));
    const copy = element('div', 'shop-copy');
    copy.append(element('div', 'shop-name', s.name), element('div', 'shop-meta', [s.category, s.price === null ? '预算随心' : '¥' + s.price + ' / 人', s.note].filter(Boolean).join(' · ')));
    row.append(copy);
    const edit = element('button', 'icon-btn', '✎');
    edit.setAttribute('aria-label', '编辑 ' + s.name);
    edit.disabled = spinning || saving || !cloudReady || syncing;
    edit.onclick = () => openEditor(s);
    row.append(edit);
    const label = element('label', 'toggle'),
      input = element('input');
    input.type = 'checkbox';
    input.checked = s.enabled;
    input.disabled = spinning || saving || !cloudReady || syncing;
    input.setAttribute('aria-label', '让 ' + s.name + ' 参与抽奖');
    input.onchange = async () => {
      const enabled = input.checked;
      input.checked = s.enabled;
      await saveShops(state.shops.map(x => x.id === s.id ? {
        ...x,
        enabled
      } : x))
    };
    label.append(input, element('span'));
    row.append(label);
    $('cards').append(row)
  });
  drawWheel(list);
  renderHistory()
}

function resetResult() {
  $('result-caption').textContent = '胃已经准备好了，运气呢？';
  $('result-title').textContent = '下一顿，会是谁？';
  $('result-detail').textContent = '每家入选店铺，都有同样的机会'
}

function drawWheel(list) {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 360 360');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', list.length ? '美食转盘，共 ' + list.length + ' 家店' : '奖池为空');
  const palette = ['#f3ce73', '#f6e8cb', '#bdcbae', '#edb099', '#dce1c8', '#eac591'];
  const n = list.length || 1,
    step = 2 * Math.PI / n;
  for (let i = 0; i < n; i++) {
    const a = i * step - Math.PI / 2,
      b = a + step;
    const path = document.createElementNS(ns, n === 1 ? 'circle' : 'path');
    if (n === 1) {
      path.setAttribute('cx', '180');
      path.setAttribute('cy', '180');
      path.setAttribute('r', '180')
    } else {
      path.setAttribute('d', `M180 180 L${180+180*Math.cos(a)} ${180+180*Math.sin(a)} A180 180 0 ${step>Math.PI?1:0} 1 ${180+180*Math.cos(b)} ${180+180*Math.sin(b)} Z`)
    }
    path.setAttribute('fill', palette[i % palette.length]);
    path.setAttribute('stroke', '#fff8e8');
    path.setAttribute('stroke-width', '1.5');
    svg.append(path);
    if (list.length) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('transform', `translate(180 180) rotate(${(i+.5)*360/n-90})`);
      t.setAttribute('x', '112');
      t.setAttribute('y', '4');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#3c4c37');
      t.setAttribute('font-size', n > 20 ? '9' : '13');
      t.setAttribute('font-weight', '650');
      t.textContent = n > 20 ? String(i + 1) : n > 12 ? list[i].emoji : list[i].emoji + ' ' + [...list[i].name].slice(0, 6).join('');
      svg.append(t)
    }
  }
  $('wheel').replaceChildren(svg)
}

function renderHistory() {
  $('history').replaceChildren();
  if (!state.history.length) {
    $('history').append(element('p', 'empty', '还没有抽奖记录，今天的第一份惊喜正在等你。'));
    return
  }
  state.history.slice(0, 8).forEach(h => {
    const n = element('div', 'history-item', h.emoji + ' ' + h.name);
    n.append(element('small', '', new Date(h.time).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })));
    $('history').append(n)
  })
}

function randomIndex(n) {
  const value = new Uint32Array(1),
    limit = Math.floor(4294967296 / n) * n;
  do {
    crypto.getRandomValues(value)
  } while (value[0] >= limit);
  return value[0] % n
}
$('spin').onclick = () => {
  const list = eligible();
  if (spinning || saving || syncing || !list.length) return;
  const index = randomIndex(list.length),
    winner = {
      ...list[index]
    };
  spinning = true;
  render();
  $('result-caption').textContent = '别急，美味正在赶来的路上';
  $('result-title').textContent = '今天的饭搭子是…';
  $('result-detail').textContent = '转一转，把纠结留在上一餐';
  const target = (360 - (index + .5) * 360 / list.length) % 360;
  angle += 360 * 5 + ((target - angle % 360 + 360) % 360);
  $('wheel').style.transform = `rotate(${angle}deg)`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    spinning = false;
    state.history.unshift({
      name: winner.name,
      emoji: winner.emoji,
      time: Date.now()
    });
    state.history = state.history.slice(0, 20);
    persist();
    render();
    $('result-caption').textContent = '叮！今天的美味签已送达';
    $('result-title').textContent = winner.emoji + ' ' + winner.name;
    $('result-detail').textContent = [winner.price === null ? '' : `人均 ¥${winner.price}`, winner.note || '就从这顿饭，开启好心情。'].filter(Boolean).join(' · ');
    $('spin-label').textContent = '再抽一次';
    if (!reduced) celebrate()
  }, reduced ? 80 : 4700)
};

function celebrate() {
  const box = $('confetti');
  box.replaceChildren();
  for (let i = 0; i < 45; i++) {
    const p = element('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = ['#d95135', '#f5cb64', '#91a986', '#e9ad95'][i % 4];
    p.style.animationDelay = Math.random() * .5 + 's';
    p.style.transform = `rotate(${Math.random()*180}deg)`;
    box.append(p)
  }
  setTimeout(() => box.replaceChildren(), 3300)
}

function openEditor(shop) {
  if (spinning || saving || syncing || !cloudReady) return;
  if (!shop && state.shops.length >= 100) {
    toast('奖池最多放 100 家店，先整理一下吧');
    return
  }
  editing = shop?.id || null;
  $('shop-form').reset();
  $('editor-title').textContent = shop ? '编辑这家小店' : '添一家心动小店';
  $('delete-shop').hidden = !shop;
  if (shop) {
    $('shop-name').value = shop.name;
    $('shop-category').value = shop.category;
    $('shop-price').value = shop.price ?? '';
    $('shop-note').value = shop.note;
    $('shop-emoji').value = shop.emoji
  }
  $('editor').showModal();
  $('shop-name').focus()
}
$('add').onclick = () => openEditor();
$('close-editor').onclick = $('cancel-editor').onclick = () => $('editor').close();
$('shop-form').onsubmit = async e => {
  e.preventDefault();
  const name = $('shop-name').value.trim();
  if (!name) {
    $('shop-name').setCustomValidity('请输入店铺名称');
    $('shop-name').reportValidity();
    return
  }
  const previous = state.shops.find(s => s.id === editing),
    shop = {
      id: editing || crypto.randomUUID(),
      name,
      category: $('shop-category').value,
      price: $('shop-price').value === '' ? null : Number($('shop-price').value),
      emoji: $('shop-emoji').value,
      note: $('shop-note').value.trim(),
      enabled: previous?.enabled ?? true
    };
  if (editing && !previous) {
    toast('这家店已被其他人删除，请重新添加');
    return
  }
  const proposed = previous ? state.shops.map(s => s.id === editing ? shop : s) : [...state.shops, shop];
  const saved = await saveShops(proposed);
  if (saved) {
    $('editor').close();
    if (filter !== '全部' && shop.category !== '随时' && shop.category !== filter) filter = '全部';
    render();
    toast('已共享，其他设备会自动更新！')
  }
};
$('shop-name').oninput = () => $('shop-name').setCustomValidity('');

function confirm(title, description, action) {
  $('confirm-title').textContent = title;
  $('confirm-description').textContent = description;
  confirmAction = action;
  $('confirm-dialog').showModal();
  $('confirm-cancel').focus()
}
$('confirm-cancel').onclick = () => $('confirm-dialog').close();
$('confirm-ok').onclick = () => {
  const action = confirmAction;
  confirmAction = null;
  $('confirm-dialog').close();
  action?.()
};
$('delete-shop').onclick = () => {
  const id = editing;
  $('editor').close();
  confirm('和这家店暂时告别？', '删除后，可以随时重新添加。', async () => {
    await saveShops(state.shops.filter(s => s.id !== id))
  })
};
$('clear-history').onclick = () => confirm('清空饭点记录？', '只清空抽奖记录，店铺奖池会保留。', () => {
  state.history = [];
  persist();
  renderHistory();
  $('clear-history').disabled = true
});
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json'
    }),
    url = URL.createObjectURL(blob),
    link = element('a');
  link.href = url;
  link.download = '饭点事务所-' + new Date().toLocaleDateString('sv-SE') + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已生成备份，可在另一台设备导入')
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 200000) {
    toast('备份文件过大，请选择本页面导出的 JSON');
    return
  }
  try {
    const incoming = validate(JSON.parse(await file.text()));
    confirm('导入这份美味清单？', `将用备份中的 ${incoming.shops.length} 家店替换所有人的共享奖池；抽奖记录仅更新本机。建议先导出备份。`, async () => {
      if (await saveShops(incoming.shops)) {
        state.history = incoming.history;
        filter = '全部';
        persist();
        render();
        toast('导入成功，共享菜单已更新')
      }
    })
  } catch (error) {
    toast('无法导入：请选择本页面导出的有效 JSON 备份')
  }
};
window.addEventListener('focus', () => syncPool());
window.addEventListener('online', () => syncPool());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncPool()
});
setInterval(() => {
  if (!document.hidden) syncPool()
}, 8000);
render();
syncPool();
