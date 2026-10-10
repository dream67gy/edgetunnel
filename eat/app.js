'use strict';
const $ = id => document.getElementById(id),
  KEY = 'lunch-club:v1',
  categories = ['全部', '早餐', '午餐', '晚餐', '夜宵'],
  emojis = ['🍜', '🍚', '🥟', '🍲', '🍔', '🍕', '🥗', '🍢', '🥪', '🍣', '🍰', '🧋', '🥣', '🥩', '🍝', '🍳', '🍛', '🥘', '🌮', '🥐', '🥯', '🦞'],
  flavors = [
    { name: '西餐', icons: ['🥩', '🍝', '🍔', '🍕'] },
    { name: '粥 / 早餐', icons: ['🥣', '🍳', '🥪', '🥐', '🥯'] },
    { name: '中式家常', icons: ['🍜', '🍚', '🥟'] },
    { name: '火锅 / 烧烤', icons: ['🍲', '🍢'] },
    { name: '亚洲风味', icons: ['🍣', '🍛', '🥘'] },
    { name: '轻食', icons: ['🥗'] },
    { name: '墨西哥菜', icons: ['🌮'] },
    { name: '海鲜', icons: ['🦞'] },
    { name: '甜点 / 饮品', icons: ['🍰', '🧋'] }
  ],
  inspirations = [
    { name: '暖胃稀饭', emoji: '🥣', category: '早餐', note: '白粥、小米粥或皮蛋瘦肉粥，配点小菜' },
    { name: '西餐牛排', emoji: '🥩', category: '晚餐', note: '牛排配土豆泥，今天吃得有仪式感' },
    { name: '意式面馆', emoji: '🍝', category: '随时', note: '番茄肉酱面或奶油蘑菇面' },
    { name: '早茶点心', emoji: '🥟', category: '早餐', note: '虾饺、烧卖、肠粉，慢慢吃一顿' },
    { name: '日式咖喱饭', emoji: '🍛', category: '午餐', note: '热乎乎的咖喱，记得加个蛋' },
    { name: '韩式拌饭', emoji: '🥘', category: '随时', note: '石锅拌饭、泡菜汤，也可以来份部队锅' },
    { name: '墨西哥塔可', emoji: '🌮', category: '随时', note: '玉米饼裹上肉和蔬菜，来点新鲜口味' },
    { name: '法式可颂', emoji: '🥐', category: '早餐', note: '酥酥的可颂搭一杯咖啡' },
    { name: '海鲜小馆', emoji: '🦞', category: '晚餐', note: '清蒸鱼、鲜虾或海鲜煲' },
    { name: '蔬菜轻食碗', emoji: '🥗', category: '午餐', note: '蔬菜、谷物和蛋白质，都来一点' },
    { name: '深夜烤串', emoji: '🍢', category: '夜宵', note: '和饭搭子一起吃点热乎的' },
    { name: '热汤面馆', emoji: '🍜', category: '随时', note: '牛肉面、乌冬面或一碗馄饨面' }
  ];
let state = {
    version: 1,
    shops: [],
    history: []
  },
  filter = '全部',
  flavor = '',
  spinning = false,
  angle = 0,
  editing = null,
  toastTimer, confirmAction = null,
  storageBlocked = false,
  syncController = null,
  cardsKey = null, wheelKey = null, historyKey = null,
  celebrationTimer;

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
async function cloudRequest(method = 'GET', body, controller) {
  controller ||= new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('共享连接超时，请稍后重试', 'TimeoutError')), 12000);
  try {
    const response = await fetch('/eat/api/pool', {
      method,
      cache: 'no-store',
      headers: body ? {
        'Content-Type': 'application/json'
      } : cloudReady ? { 'If-None-Match': `"eat-pool-${revision}"` } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    if (response.status === 304 && method === 'GET') return null;
    let data;
    try {
      data = await response.json()
    } catch {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw Error('共享服务尚未启用，请完成数据库部署')
    }
    if (!response.ok) {
      const error = Error(data.error || '同步失败，请稍后重试');
      error.data = data;
      error.status = response.status;
      throw error
    }
    return data
  } finally {
    clearTimeout(timeout)
  }
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
  const controller = new AbortController();
  syncController = controller;
  render();
  try {
    const data = await cloudRequest('GET', undefined, controller);
    // An edit or spin may start while a background request is still in flight.
    if (controller.signal.aborted || saving || spinning || $('editor').open || $('confirm-dialog').open) return;
    const changed = data && (!cloudReady || data.revision !== revision);
    if (changed) {
      applyCloud(data);
      resetResult();
      render()
    }
    cloudStatus('云端共用 · 已同步');
    if (manual) toast('共享奖池已更新')
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason?.name !== 'TimeoutError') return;
    cloudStatus(cloudReady ? '同步暂断 · 点击同步重试' : '共享未连接 · 点击同步重试');
    if (manual) toast(error.message)
  } finally {
    if (syncController === controller) {
      syncController = null;
      syncing = false;
      render()
    }
  }
}
async function saveShops(shops) {
  if (saving || !cloudReady) {
    toast('请先连接共享奖池');
    return false
  }
  syncController?.abort();
  syncController = null;
  syncing = false;
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
  return state.shops.filter(s => s.enabled && matchesFilters(s))
}

function matchesFilters(shop) {
  return (filter === '全部' || shop.category === '随时' || shop.category === filter) &&
    (!flavor || flavors.find(f => f.name === flavor)?.icons.includes(shop.emoji))
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node
}

function render() {
  const list = eligible();
  const locked = spinning || saving || !cloudReady;
  const spinLabel = spinning ? '命运正在下单…' : !list.length ? '换个筛选或添加美味' :
    document.querySelector('.result').classList.contains('revealed') ? '再抽一次' : '帮我决定！';
  $('total-count').textContent = state.shops.length + ' 家';
  $('eligible-count').textContent = list.length + ' 家待翻牌';
  $('spin').disabled = spinning || saving || !list.length;
  $('spin-label').textContent = spinLabel;
  $('add').disabled = locked;
  $('import').disabled = locked;
  $('migrate').disabled = locked;
  $('sync-now').disabled = spinning || saving || syncing;
  $('shop-form').querySelector('button[type=submit]').disabled = saving;
  $('delete-shop').disabled = saving;
  $('clear-history').disabled = spinning || !state.history.length;
  $('flavor-filter').disabled = spinning || saving;
  $('flavor-filter').value = flavor;
  $('inspirations').querySelectorAll('button').forEach(b => b.disabled = locked);
  if (!$('filters').childElementCount) categories.forEach(c => {
    const b = element('button', 'chip' + (filter === c ? ' active' : ''), c);
    b.setAttribute('aria-pressed', String(filter === c));
    b.onclick = () => {
      filter = c;
      resetResult();
      render()
    };
    $('filters').append(b)
  });
  $('filters').querySelectorAll('button').forEach(b => {
    b.disabled = spinning || saving;
    b.classList.toggle('active', b.textContent === filter);
    b.setAttribute('aria-pressed', String(b.textContent === filter))
  });
  const nextCardsKey = JSON.stringify([filter, flavor, state.shops]);
  if (nextCardsKey !== cardsKey) {
    cardsKey = nextCardsKey;
    const fragment = document.createDocumentFragment();
    const shown = state.shops.filter(matchesFilters);
    $('cards').classList.toggle('large-pool', shown.length > 30);
    if (!shown.length) fragment.append(element('div', 'empty', state.shops.length ? '这个口味还没有店铺，换个筛选或从下方灵感里加一道吧。' : '这里还没有店铺，从下方灵感菜单开始吧。'));
    shown.forEach(s => {
      const row = element('div', 'shop' + (s.enabled ? '' : ' off'));
      row.dataset.id = s.id;
      row.append(element('div', 'food-icon', s.emoji));
      const copy = element('div', 'shop-copy');
      copy.append(element('div', 'shop-name', s.name), element('div', 'shop-meta', [s.category, s.price === null ? '预算随心' : '¥' + s.price + ' / 人', s.note].filter(Boolean).join(' · ')));
      row.append(copy);
      const edit = element('button', 'icon-btn', '✎');
      edit.setAttribute('aria-label', '编辑 ' + s.name);
      edit.onclick = () => openEditor(s);
      row.append(edit);
      const label = element('label', 'toggle'),
        input = element('input');
      input.type = 'checkbox';
      input.checked = s.enabled;
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
      fragment.append(row)
    });
    $('cards').replaceChildren(fragment)
  }
  $('cards').querySelectorAll('button, input').forEach(control => control.disabled = locked);
  drawWheel(list);
  renderHistory()
}

function resetResult() {
  document.querySelector('.result').classList.remove('revealed');
  $('cards').querySelectorAll('.winner').forEach(row => row.classList.remove('winner'));
  $('result-caption').textContent = '胃已经准备好了，运气呢？';
  $('result-title').textContent = '下一顿，会是谁？';
  $('result-detail').textContent = '每家入选店铺，都有同样的机会'
}

function drawWheel(list) {
  const nextKey = JSON.stringify(list.map(s => [s.id, s.name, s.emoji]));
  if (nextKey === wheelKey) return;
  wheelKey = nextKey;
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
    if (list.length && (n <= 36 || i % Math.ceil(n / 36) === 0)) {
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
  const nextKey = JSON.stringify(state.history);
  if (nextKey === historyKey) return;
  historyKey = nextKey;
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
  if (spinning || saving || !list.length) return;
  const index = randomIndex(list.length),
    winner = {
      ...list[index]
    };
  spinning = true;
  resetResult();
  document.querySelector('.lottery').classList.add('is-spinning');
  $('wheel').style.willChange = 'transform';
  render();
  $('result-caption').textContent = '别急，美味正在赶来的路上';
  $('result-title').textContent = '今天的饭搭子是…';
  $('result-detail').textContent = '转一转，把纠结留在上一餐';
  const target = (360 - (index + .5) * 360 / list.length) % 360;
  angle += 360 * 5 + ((target - angle % 360 + 360) % 360);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;
  let fallback;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    $('wheel').removeEventListener('transitionend', onEnd);
    $('wheel').style.willChange = '';
    document.querySelector('.lottery').classList.remove('is-spinning');
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
    document.querySelector('.result').classList.add('revealed');
    const row = [...$('cards').children].find(row => row.dataset.id === winner.id);
    row?.classList.add('winner');
    if (!reduced) celebrate()
  };
  const onEnd = event => {
    if (event.target === $('wheel') && event.propertyName === 'transform') finish()
  };
  $('wheel').addEventListener('transitionend', onEnd);
  // Give the browser a frame to promote the wheel before starting the transition.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('wheel').style.transform = `rotate(${angle}deg)`;
    fallback = setTimeout(finish, reduced ? 80 : 4200)
  }))
};

function celebrate() {
  const box = $('confetti');
  clearTimeout(celebrationTimer);
  box.replaceChildren();
  const fragment = document.createDocumentFragment();
  const count = innerWidth < 760 ? 16 : 28;
  for (let i = 0; i < count; i++) {
    const p = element('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = ['#d95135', '#f5cb64', '#91a986', '#e9ad95'][i % 4];
    p.style.animationDelay = Math.random() * .5 + 's';
    p.style.setProperty('--drift', `${Math.random() * 160 - 80}px`);
    p.style.setProperty('--twist', `${Math.random() * 360 + 360}deg`);
    fragment.append(p)
  }
  box.append(fragment);
  celebrationTimer = setTimeout(() => box.replaceChildren(), 3300)
}

function openEditor(shop) {
  if (spinning || saving || !cloudReady) return;
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
flavors.forEach(f => {
  const option = element('option', '', f.name);
  option.value = f.name;
  $('flavor-filter').append(option)
});
$('flavor-filter').onchange = () => {
  flavor = $('flavor-filter').value;
  resetResult();
  render()
};
inspirations.forEach(s => {
  const button = element('button', 'inspiration');
  button.type = 'button';
  button.append(element('span', 'inspiration-icon', s.emoji), element('span', '', s.name), element('span', 'inspiration-plus', '＋'));
  button.onclick = () => {
    openEditor();
    if (!$('editor').open) return;
    $('shop-name').value = s.name;
    $('shop-emoji').value = s.emoji;
    $('shop-category').value = s.category;
    $('shop-note').value = s.note
  };
  $('inspirations').append(button)
});
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
    if (!matchesFilters(shop)) {
      filter = '全部';
      flavor = ''
    }
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
        flavor = '';
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
