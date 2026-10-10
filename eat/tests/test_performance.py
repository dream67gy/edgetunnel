"""Browser regressions for idle sync, in-flight edits, rich menus and animation."""
import json
import os
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[2]
subprocess.run(['python3', str(root / 'eat/build.py'), '--mode', 'standalone'], check=True)
module = (root / 'dist/standalone/_worker.js/page.js').read_text()
html = json.loads(module.removeprefix('export const EAT_HTML = ').removesuffix(';\n'))
url = 'https://eat.test/eat/'
icons = ['🥣', '🥩', '🍝', '🍛', '🍚', '🍢', '🌮', '🦞', '🥐', '🥗']
shared = {
    'revision': 1,
    'shops': [dict(id=str(i), name=f'美食 {i}', emoji=icons[i % len(icons)],
                   category='随时', price=None, note='测试菜单', enabled=True)
              for i in range(100)]
}
responses = []
pending = []
hold = False


def cloud(route):
    request = route.request
    if request.method == 'PUT':
        data = json.loads(request.post_data)
        assert data['revision'] == shared['revision']
        shared.update(revision=shared['revision'] + 1, shops=data['shops'])
        route.fulfill(json=shared)
    elif hold:
        pending.append(route)
    elif request.headers.get('if-none-match') == f'"eat-pool-{shared["revision"]}"':
        responses.append(304)
        route.fulfill(status=304, body='')
    else:
        responses.append(200)
        route.fulfill(json=shared)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROME_BIN'), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/eat/', lambda route: route.fulfill(content_type='text/html', body=html))
    page.route('**/eat/api/pool', cloud)
    page.goto(url)
    page.wait_for_function('cloudReady && !syncing')
    expect(page.locator('.shop')).to_have_count(100)

    # Unchanged polling must retain nodes, keyboard focus and list scroll position.
    page.locator('.shop input').nth(30).focus()
    page.evaluate("""() => {
      window.snap = {
        wheel: $('wheel').firstChild, card: $('cards').firstChild,
        history: $('history').firstChild, chip: $('filters').firstChild,
        focus: document.activeElement, scroll: $('cards').scrollTop
      };
      window.childChanges = 0;
      window.observer = new MutationObserver(records => childChanges += records.length);
      ['wheel', 'cards', 'filters', 'history'].forEach(id =>
        observer.observe($(id), {childList: true, subtree: true}));
    }""")
    for _ in range(5):
        page.evaluate('syncPool()')
    assert responses.count(304) == 5
    assert page.evaluate("""() => childChanges === 0 && snap.wheel === $('wheel').firstChild &&
      snap.card === $('cards').firstChild && snap.history === $('history').firstChild &&
      snap.chip === $('filters').firstChild && snap.focus === document.activeElement &&
      snap.scroll === $('cards').scrollTop""")
    page.evaluate('observer.disconnect()')

    # A slow background GET must not disable editing or replace a newly opened draft.
    hold = True
    page.evaluate('void syncPool()')
    page.wait_for_function('syncing')
    expect(page.locator('#add')).to_be_enabled()
    expect(page.locator('#spin')).to_be_enabled()
    assert pending
    page.locator('.shop .icon-btn').first.click()
    page.locator('#shop-name').fill('保留这份草稿')
    original_name = shared['shops'][0]['name']
    stale = {**shared, 'revision': shared['revision'] + 1,
             'shops': [dict(shop, name='过期返回') for shop in shared['shops']]}
    pending.pop().fulfill(json=stale)
    page.wait_for_function('!syncing')
    assert page.locator('#shop-name').input_value() == '保留这份草稿'
    assert page.evaluate('state.shops[0].name') == original_name
    hold = False
    page.locator('#shop-form button[type=submit]').click()
    expect(page.locator('#editor')).not_to_be_visible()
    assert shared['shops'][0]['name'] == '保留这份草稿'

    # A save can cancel an already running background GET without a false error.
    hold = True
    page.evaluate('void syncPool()')
    page.wait_for_function('syncing')
    page.locator('.shop .icon-btn').first.click()
    page.locator('#shop-name').fill('保存优先')
    page.locator('#shop-form button[type=submit]').click()
    expect(page.locator('#editor')).not_to_be_visible()
    assert shared['shops'][0]['name'] == '保存优先'
    for route in pending:
        route.abort()  # Finish the intercepted request after client cancellation.
    pending.clear()
    hold = False

    # Cuisine filtering applies to both visible rows and fair lottery candidates.
    page.locator('#flavor-filter').select_option(label='西餐')
    expect(page.locator('.shop')).to_have_count(20)
    assert page.evaluate("eligible().every(s => ['🥩', '🍝'].includes(s.emoji))")
    page.locator('#flavor-filter').select_option(label='粥 / 早餐')
    expect(page.locator('.shop')).to_have_count(20)
    page.locator('#filters button').filter(has_text='夜宵').click()
    expect(page.locator('.shop')).to_have_count(20)  # 随时 entries still match.

    # Consecutive reduced-motion spins must complete quickly, with no confetti.
    page.emulate_media(reduced_motion='reduce')
    for _ in range(2):
        count = page.evaluate('state.history.length')
        page.locator('#spin').click()
        page.wait_for_function(f'!spinning && state.history.length === {count + 1}', timeout=1500)
        assert page.locator('#confetti i').count() == 0
        assert page.locator('.shop.winner').count() == 1
        assert page.evaluate("""() => {
          const list = eligible(), i = list.findIndex(s => s.name === state.history[0].name);
          return i >= 0 && Math.abs((angle + (i + .5) * 360 / list.length) % 360) < .01;
        }""")

    # Start a spin with a GET in flight: the response cannot change the wheel.
    page.emulate_media(reduced_motion='no-preference')
    hold = True
    page.evaluate('void syncPool()')
    page.wait_for_function('syncing')
    page.locator('#spin').click()
    assert pending
    pending.pop().fulfill(json=stale)
    page.wait_for_function('!syncing')
    assert page.evaluate('state.shops[0].name') == '保存优先'
    hold = False
    page.wait_for_function('!spinning', timeout=5500)
    assert page.locator('#confetti i').count() == 28
    assert page.locator('.result.revealed').count() == 1
    assert page.evaluate("$('wheel').style.willChange === ''")

    # New templates open an editable draft and respect the 100-shop limit.
    page.locator('.inspiration').filter(has_text='暖胃稀饭').click()
    expect(page.locator('#toast')).to_contain_text('最多放 100 家店')
    shared['shops'] = shared['shops'][:6]
    shared['revision'] += 1
    page.evaluate('syncPool()')
    page.locator('.inspiration').filter(has_text='西餐牛排').click()
    assert page.locator('#shop-name').input_value() == '西餐牛排'
    assert page.locator('#shop-emoji').input_value() == '🥩'
    page.locator('#shop-form button[type=submit]').click()
    expect(page.locator('#editor')).not_to_be_visible()
    assert shared['shops'][-1]['emoji'] == '🥩'
    assert page.locator('#flavor-filter').input_value() == ''
    page.locator('.inspiration').filter(has_text='暖胃稀饭').click()
    assert page.locator('#shop-category').input_value() == '早餐'
    page.locator('#shop-form button[type=submit]').click()
    expect(page.locator('#editor')).not_to_be_visible()
    assert shared['shops'][-1]['emoji'] == '🥣'
    page.reload()
    page.wait_for_function('cloudReady && !syncing')
    assert page.locator('.shop').count() == 8
    assert page.evaluate('state.history.length') == 3
    assert not errors, errors
    print('PASS: 100-shop idle sync has zero DOM replacements; 304; focus/scroll retained; '
          'slow-sync edit/save/spin races; cuisine filters; consecutive spins; reduced motion; '
          'new food templates save and reload')
    browser.close()
