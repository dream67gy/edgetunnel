'use strict';
const $ = id => document.getElementById(id);
const CONFIG_KEY = 'cib-draw-config-v1', HISTORY_KEY = 'cib-draw-history-v1';
// Cropping is presentation-only: original product photos are kept intact on disk.
const productPhotos = {
  book: {file:'purchased-reference.png', size:[636,928], frame:[5,90,235,210]},
  tissue: {file:'tissue.jpg', size:[800,800], frame:[130,185,535,455]},
  bag: {file:'bag.jpg', size:[800,800], frame:[365,395,425,265]},
  stand: {file:'stand.jpg', size:[800,800], frame:[20,195,255,340]},
  cup: {file:'cup.jpg', size:[491,491], frame:[75,20,320,460]},
  tote: {file:'purchased-reference.png', size:[636,928], frame:[331,662,255,255]}
};
const illustrations = {
  book: '<path d="M43 25 118 35 114 137 40 126Z" fill="#c8d3e8"/><path d="m40 20 76 11-4 101-76-11Z" fill="#7d99c8"/><path d="m43 24 9 1-4 96-9-1Z" fill="#5278b1"/><path d="m55 31 52 7-3 70-52-7Z" fill="#8da7d0"/><path d="m61 48 32 5m-33 6 32 5" stroke="#c8d8ef" stroke-width="2"/><path d="m56 88 37 5" stroke="#d9e4f4"/><path d="m92 127 0 14 7-4 5 6 1-14" fill="#d8b679"/><path d="m40 126 71 10" stroke="#f0f3fa" stroke-width="4"/>',
  tissue: '<path d="m30 65 66-14 39 25-68 15Z" fill="#f6e8d1"/><path d="m30 65 37 26v43l-37-25Z" fill="#cbb79a"/><path d="m67 91 68-15v42l-68 16Z" fill="#e7d5b8"/><path d="m64 69 27-6 14 7-29 6Z" fill="#ad9d88"/><path d="m73 69-8-30 15 4 8-17 13 16-4 25Z" fill="#fff"/><path d="m82 45 5 23m8-23-2 23" stroke="#e3e9f0" stroke-width="2"/><ellipse cx="99" cy="102" rx="17" ry="12" fill="#fffdf6"/><path d="m84 97-4-7m33 8 5-8" stroke="#8c7d67" stroke-width="4" stroke-linecap="round"/><circle cx="94" cy="101" r="1.5" fill="#746957"/><circle cx="104" cy="99" r="1.5" fill="#746957"/><path d="m98 105 4-1" stroke="#746957" stroke-width="2" stroke-linecap="round"/>',
  bag: '<path d="m48 38 63 0-8 13 13 81q-38 14-76 0l13-81Z" fill="#a4b8ab"/><path d="m50 50 57 0-3 9-52-1Z" fill="#6e9282"/><path d="m61 42 0-13q18-15 34 0v13" fill="none" stroke="#d9c492" stroke-width="4"/><path d="m67 64-8 58m39-59 8 59" stroke="#bbccbe" stroke-width="2"/><g fill="#e7e4ce"><circle cx="74" cy="86" r="7"/><circle cx="82" cy="79" r="7"/><circle cx="91" cy="85" r="7"/><circle cx="88" cy="96" r="7"/><circle cx="76" cy="97" r="7"/></g><circle cx="82" cy="89" r="5" fill="#d7bc79"/><path d="m82 105 0 13m-1-4-12-6" stroke="#718d77" stroke-width="2"/>',
  stand: '<ellipse cx="80" cy="131" rx="40" ry="10" fill="#bcc9da"/><path d="m43 123 69-4 11 12-80 6Z" fill="#8499b6"/><path d="m75 73 14 0 4 50-15 3Z" fill="#9cacc3"/><path d="m63 37 52 8-8 58-52-8Z" fill="#bbc8da"/><path d="m65 25 49 8-8 62-49-8Z" fill="#354d70"/><path d="m69 31 39 6-7 50-39-6Z" fill="#7594c4"/><path d="m64 70 40-29-6 42Z" fill="#9ab4dc"/><path d="m56 88 49 8" stroke="#d8e0ec" stroke-width="5" stroke-linecap="round"/><circle cx="78" cy="88" r="2" fill="#d4deed"/>',
  cup: '<path d="m56 49 57 0-7 86q-22 12-44 0Z" fill="#d5c3a0"/><path d="m61 55 9 75m7-74 3 78m12-78-1 78m12-78-5 76" stroke="#eee3cd" stroke-width="3"/><ellipse cx="84" cy="48" rx="30" ry="9" fill="#a18b65"/><ellipse cx="84" cy="44" rx="28" ry="8" fill="#e9dcc0"/><path d="m88 45 5-26 15-3" fill="none" stroke="#f7f1e4" stroke-width="5" stroke-linecap="round"/><path d="m63 81 43 0-2 25-39 0Z" fill="#f3ead6"/><path d="m72 90 23 0m-20 7 17 0" stroke="#ae956b" stroke-width="2"/>',
  tote: '<path d="m44 55 73 0 7 79q-40 11-80 0Z" fill="#e3d8bf"/><path d="m46 56-11 71 9 7 2-78Z" fill="#bfb293"/><path d="m61 61 0-26q0-19 19-19t19 19v26" fill="none" stroke="#bcaa83" stroke-width="7"/><path d="m65 64 0-28q0-16 15-16t15 16v28" fill="none" stroke="#eee4ce" stroke-width="3"/><path d="m47 68 67 0" stroke="#c9bca1" stroke-width="1.5" stroke-dasharray="3 3"/><path d="m77 109q-23-9-15-26 18 0 19 22 1-25 21-29 9 22-19 32Z" fill="#94ab91"/><path d="m81 106 0 14" stroke="#779274" stroke-width="2"/>',
  gift: '<path d="m29 72 55 22 51-26v63l-51 26-55-23Z" fill="#dcbd7f"/><path d="m84 94 51-26v63l-51 26Z" fill="#b98e4e"/><path d="m24 58 53-24 64 23-57 28Z" fill="#f5e4bb"/><path d="m24 58 60 27v20L24 79Z" fill="#e8cd99"/><path d="m84 85 57-28v21l-57 27Z" fill="#c9a56c"/><path d="m48 47 57 27v72l14-7V67L62 41Z" fill="#f9f0dc"/><path d="m111 47-57 26v71l14 6V79l57-26Z" fill="#fff5df"/><path d="M81 50C35 48 39 6 61 20c14 9 20 30 20 30Z" fill="#f8e7c3" stroke="#d0ab6d" stroke-width="2"/><path d="M82 50c4-42 35-49 36-28 1 19-36 28-36 28Z" fill="#ffefd0" stroke="#d0ab6d" stroke-width="2"/><ellipse cx="82" cy="49" rx="9" ry="7" fill="#e7c386"/>'
};
const iconNames = {book:'计划本', tissue:'抽纸', bag:'垃圾袋', stand:'手机支架', cup:'随行杯', tote:'环保袋', gift:'礼盒'};
const defaults = {showQuantity:true, gifts:[
  {id:'book',name:'A5 软皮计划本',note:'梦瑾 · 记录每一份灵感',icon:'book',quantity:1,unit:'本',enabled:true},
  {id:'tissue',name:'维达联名抽纸',note:'线条小狗 · 柔软好心情',icon:'tissue',quantity:2,unit:'包',enabled:true},
  {id:'bag',name:'山茶花抽绳垃圾袋',note:'加厚免撕 · 让家更整洁',icon:'bag',quantity:1,unit:'份',enabled:true},
  {id:'stand',name:'金属旋转手机支架',note:'360° 旋转 · 解放双手',icon:'stand',quantity:1,unit:'个',enabled:true},
  {id:'cup',name:'竹节吸管随行杯',note:'把温柔 · 装进日常',icon:'cup',quantity:1,unit:'个',enabled:true},
  {id:'tote',name:'便携折叠环保袋',note:'轻装出门 · 满载美好',icon:'tote',quantity:1,unit:'个',enabled:true}
]};
let config = structuredClone(defaults), history = [], drawing = false, toastTimer, photoSequence = 0;

function validateConfig(value) {
  if (!value || typeof value.showQuantity !== 'boolean' || !Array.isArray(value.gifts) || value.gifts.length > 12) throw Error('礼品设置格式有误');
  const ids = new Set();
  for (const gift of value.gifts) {
    if (!gift || typeof gift.id !== 'string' || !gift.id || ids.has(gift.id) ||
        typeof gift.name !== 'string' || !gift.name.trim() || gift.name.length > 32 ||
        typeof gift.note !== 'string' || gift.note.length > 64 || !Object.hasOwn(illustrations, gift.icon) ||
        !Number.isInteger(gift.quantity) || gift.quantity < 1 || gift.quantity > 99 ||
        typeof gift.unit !== 'string' || !gift.unit.trim() || gift.unit.length > 6 || typeof gift.enabled !== 'boolean') throw Error('请检查礼品名称、每份数量与单位');
    ids.add(gift.id);
  }
  return value;
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, 4500);
}
try {
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) config = validateConfig(JSON.parse(saved));
} catch (_) { toast('未能读取本机设置，暂时使用默认礼品。'); }
try {
  const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  if (!Array.isArray(saved)) throw Error();
  history = saved.filter(item => item && typeof item.name === 'string' && item.name.length <= 32 &&
    Object.hasOwn(illustrations, item.icon) && typeof item.portion === 'string' && item.portion.length <= 16 &&
    Number.isFinite(item.time) && !isNaN(new Date(item.time).getTime())).slice(0,12);
} catch (_) { toast('未能读取本机记录，本次仍可正常抽奖。'); }
function art(icon) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 160 160'); svg.setAttribute('aria-hidden','true');
  svg.innerHTML = illustrations[icon] || illustrations.gift;
  const photo = productPhotos[icon];
  if (photo) {
    svg.classList.add('product-photo');
    svg.setAttribute('viewBox',photo.frame.join(' '));
    const clip = document.createElementNS('http://www.w3.org/2000/svg','clipPath');
    clip.id = 'product-photo-' + ++photoSequence;
    const bounds = document.createElementNS('http://www.w3.org/2000/svg','rect');
    ['x','y','width','height'].forEach((key,index) => bounds.setAttribute(key,photo.frame[index]));
    clip.append(bounds);
    const image = document.createElementNS('http://www.w3.org/2000/svg','image');
    image.setAttribute('width',photo.size[0]); image.setAttribute('height',photo.size[1]);
    image.setAttribute('href','/draw/images/' + photo.file);
    image.setAttribute('clip-path',`url(#${clip.id})`);
    image.addEventListener('error', () => {
      svg.classList.remove('product-photo');
      svg.setAttribute('viewBox','0 0 160 160');
      svg.innerHTML = illustrations[icon] || illustrations.gift;
    }, {once:true});
    svg.replaceChildren(clip,image);
  }
  return svg;
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const portion = gift => `${gift.quantity} ${gift.unit} / 份`;
function renderPool() {
  const gifts = config.gifts.filter(gift => gift.enabled);
  $('prize-grid').replaceChildren(...gifts.map((gift,index) => {
    const card = el('article','prize-card'); card.dataset.id = gift.id;
    const picture = el('div','prize-art'); picture.append(art(gift.icon));
    card.append(el('span','card-number',String(index+1).padStart(2,'0')), picture,
      el('h3','',gift.name),el('p','',gift.note));
    if(config.showQuantity) card.append(el('span','prize-quantity',portion(gift)));
    return card;
  }));
  $('prize-count').textContent = `${gifts.length} 款心意`;
  document.querySelector('.collection-number').textContent = gifts.length ? '01—' + String(gifts.length).padStart(2,'0') : '—';
  $('pool-empty').hidden = !!gifts.length;
  $('prize-grid').hidden = !gifts.length;
  $('draw-button').disabled = !gifts.length;
  resetResult();
}
function resetResult() {
  document.querySelector('.stage').classList.remove('won');
  $('hero-art').replaceChildren(art('gift'));
  $('result-kicker').textContent = '一份幸运 · 一份心意';
  $('result-title').textContent = '下一份惊喜，属于你';
  $('result-detail').textContent = config.gifts.some(g => g.enabled) ? '点击下方按钮，开启你的专属好礼' : '先在活动设置中，开启你喜欢的礼品';
  $('draw-label').textContent = '开启幸运';
}
function renderHistory() {
  if (!history.length) { $('history-list').replaceChildren(el('p','history-empty','第一份幸运，等你来开启。')); return; }
  $('history-list').replaceChildren(...history.map(item => {
    const card = el('div','history-item'), copy = el('div');
    copy.append(el('b','',item.name),el('small','',[
      item.portion, new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(item.time)
    ].filter(Boolean).join(' · ')));
    card.append(art(item.icon),copy); return card;
  }));
}
function randomIndex(count) {
  const bytes = new Uint32Array(1), limit = Math.floor(4294967296/count)*count;
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return bytes[0] % count;
}
function celebrate() {
  const nodes = Array.from({length:matchMedia('(max-width:760px)').matches ? 16 : 26}, (_,i) => {
    const node = el('i'); node.style.background = ['#e6c585','#6e9be4','#adc9ed','#fff1cc'][i%4];
    node.style.setProperty('--x',`${(Math.random()-.5)*innerWidth*.85}px`);
    node.style.setProperty('--y',`${150+Math.random()*innerHeight*.65}px`);
    node.style.setProperty('--r',`${Math.random()*720-360}deg`); return node;
  });
  $('confetti').replaceChildren(...nodes);
  setTimeout(() => $('confetti').replaceChildren(),1400);
}
function draw() {
  if (drawing || $('settings').open) return;
  const gifts = config.gifts.filter(g => g.enabled).map(g => ({...g}));
  if (!gifts.length) return;
  const index = randomIndex(gifts.length), winner = gifts[index];
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const duration = reduced ? 80 : gifts.length === 1 ? 750 : 2900;
  const cards = [...$('prize-grid').children], stage = document.querySelector('.stage');
  resetResult(); drawing = true; stage.classList.add('drawing');
  cards.forEach(card => card.classList.remove('active','winner'));
  $('draw-button').disabled = true; $('open-settings').disabled = true;
  $('draw-label').textContent = '好运正在赶来…';
  $('result-kicker').textContent = '把期待，交给这一刻';
  $('result-title').textContent = '你的好礼，即将揭晓';
  $('result-detail').textContent = '每一份心意，都值得期待';
  const start = performance.now(), steps = gifts.length * 4 + index;
  let active = -1, frame, fallback, finished = false;
  const select = next => {
    if(next === active) return;
    cards[active]?.classList.remove('active'); cards[next].classList.add('active'); active = next;
  };
  const finish = () => {
    if(finished) return; finished = true;
    clearTimeout(fallback); cancelAnimationFrame(frame); select(index);
    stage.classList.remove('drawing'); stage.classList.add('won'); cards[index].classList.add('winner');
    $('hero-art').replaceChildren(art(winner.icon));
    $('result-kicker').textContent = '恭喜你，收获一份小美好';
    $('result-title').textContent = winner.name;
    const bundle = config.showQuantity ? portion(winner) : '';
    $('result-detail').textContent = [bundle,winner.note].filter(Boolean).join(' · ');
    $('draw-label').textContent = '再开启一份幸运';
    history.unshift({name:winner.name, icon:winner.icon, portion:bundle, time:Date.now()});
    history = history.slice(0,12);
    try { localStorage.setItem(HISTORY_KEY,JSON.stringify(history)); }
    catch (_) { toast('本次结果已揭晓，但记录未能保存到浏览器。'); }
    renderHistory(); drawing = false; $('draw-button').disabled = false; $('open-settings').disabled = false;
    if (!reduced) celebrate();
  };
  const tick = now => {
    // A frame's timestamp can slightly precede the click that schedules it.
    const progress = Math.max(0,Math.min(1,(now-start)/duration));
    select(Math.floor((1-Math.pow(1-progress,2.5))*steps) % gifts.length);
    if (progress >= 1) finish(); else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick); fallback = setTimeout(finish,duration+250);
}
function field(label, input) { const node = el('label','',label); node.append(input); return node; }
function input(name, value, maxLength) {
  const node = document.createElement('input'); node.name = name; node.value = value;
  node.maxLength = maxLength; node.required = name !== 'note'; return node;
}
function editor(gift) {
  const row = el('div','gift-editor'); row.dataset.id = gift.id;
  const top = el('div','editor-top');
  const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.name = 'enabled'; enabled.checked = gift.enabled;
  const label = el('label','enable-label'); label.append(enabled,document.createTextNode('参与抽奖'));
  const remove = el('button','remove-gift','移除此礼品'); remove.type = 'button';
  remove.onclick = () => { row.remove(); $('add-gift').disabled = false; };
  top.append(el('b','','礼品设置'),label,remove);
  const fields = el('div','editor-fields'), name = input('name',gift.name,32), quantity = input('quantity',gift.quantity,2);
  quantity.type = 'number'; quantity.min = '1'; quantity.max = '99'; quantity.step = '1';
  const icon = document.createElement('select'); icon.name = 'icon';
  Object.entries(iconNames).forEach(([value,text]) => { const option = el('option','',text); option.value = value; icon.append(option); }); icon.value = gift.icon;
  fields.append(field('礼品名称',name),field('展示图片',icon),field('每份数量',quantity),field('单位',input('unit',gift.unit,6)));
  const note = field('一句介绍（可选）',input('note',gift.note,64)); note.className = 'editor-note';
  row.append(top,fields,note); return row;
}
function openSettings() {
  if (drawing) return;
  $('settings-error').hidden = true;
  $('gift-editors').replaceChildren(...config.gifts.map(editor));
  $('show-quantity').checked = config.showQuantity;
  $('add-gift').disabled = config.gifts.length >= 12;
  $('settings').showModal();
}
$('settings-form').onsubmit = event => {
  event.preventDefault();
  try {
    const gifts = [...$('gift-editors').children].map(row => {
      const get = name => row.querySelector(`[name="${name}"]`);
      return {id:row.dataset.id,name:get('name').value.trim(),note:get('note').value.trim(),
        icon:get('icon').value,quantity:Number(get('quantity').value),unit:get('unit').value.trim(),enabled:get('enabled').checked};
    });
    const next = validateConfig({showQuantity:$('show-quantity').checked,gifts});
    try { localStorage.setItem(CONFIG_KEY,JSON.stringify(next)); }
    catch (_) { throw Error('浏览器未能保存设置，请检查存储空间或浏览器隐私设置。你的修改仍保留在这里。'); }
    config = next; renderPool(); $('settings').close(); toast('设置已保存，好礼已准备就绪');
  } catch(error) { $('settings-error').textContent = error.message; $('settings-error').hidden = false; $('settings-error').scrollIntoView({block:'nearest'}); }
};
$('add-gift').onclick = () => {
  if ($('gift-editors').children.length >= 12) return;
  const row = editor({id:crypto.randomUUID(),name:'',note:'',icon:'gift',quantity:1,unit:'份',enabled:true});
  $('gift-editors').append(row); row.querySelector('[name=name]').focus();
  $('add-gift').disabled = $('gift-editors').children.length >= 12;
};
$('open-settings').onclick = openSettings; $('empty-settings').onclick = openSettings;
$('close-settings').onclick = $('cancel-settings').onclick = () => $('settings').close();
$('draw-button').onclick = draw;
renderPool(); renderHistory();
