"""Test the deployed Draw HTML: prize selection, configuration, storage and stable layout."""
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[2]
previews = Path(tempfile.gettempdir())
subprocess.run(['python3', str(root / 'eat/build.py'), '--mode', 'standalone'], check=True)
html = json.loads((root / 'dist/standalone/_worker.js/draw-page.js').read_text()
                  .splitlines()[0].removeprefix('export const DRAW_HTML = ').removesuffix(';'))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROME_BIN'), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def serve(route):
        path = urlparse(route.request.url).path
        if path.startswith('/draw/images/'):
            image = root / 'dist/standalone/draw/images' / Path(path).name
            route.fulfill(path=str(image), content_type='image/png' if image.suffix == '.png' else 'image/jpeg')
        else:
            route.fulfill(content_type='text/html', body=html)
    page.route('https://draw.test/**', serve)
    page.goto('https://draw.test/draw')
    expect(page.locator('.prize-card')).to_have_count(6)
    expect(page.locator('.prize-card .product-photo')).to_have_count(6)
    page.evaluate('''() => Promise.all([...document.querySelectorAll('.product-photo image')].map(node => {
      const image = new Image(); image.src = node.getAttribute('href'); return image.decode();
    }))''')
    expect(page.locator('[data-id=tissue] .prize-quantity')).to_have_text('2 包 / 份')
    page.screenshot(path=str(previews / 'draw-desktop.png'), full_page=True)
    # The first frame can have a timestamp just before the draw event.
    page.evaluate('''() => {
      const original = window.requestAnimationFrame;
      window.requestAnimationFrame = callback => {
        window.requestAnimationFrame = original;
        return original.call(window, () => callback(performance.now() - 100));
      };
    }''')

    # Exercise every prize through real draw events. A repeated click cannot add a second result.
    for index in range(6):
        page.evaluate('''index => {
          window.crypto.getRandomValues = array => { array[0] = index; return array; };
          document.getElementById('draw-button').click();
          document.getElementById('draw-button').click();
        }''', index)
        page.wait_for_function(f'!drawing && history.length === {index + 1}')
        expected = page.evaluate(f'config.gifts[{index}].name')
        expect(page.locator('#result-title')).to_have_text(expected)
        expect(page.locator('.prize-card.winner h3')).to_have_text(expected)
        expect(page.locator('.history-item').first.locator('b')).to_have_text(expected)

    # Edits stay local, can be cancelled, and are only applied after a successful save.
    page.locator('#open-settings').click()
    page.locator('.gift-editor').first.locator('[name=name]').fill('未保存的名称')
    page.keyboard.press('Escape')
    page.locator('#open-settings').click()
    expect(page.locator('.gift-editor').first.locator('[name=name]')).to_have_value('A5 软皮计划本')
    for toggle in page.locator('[name=enabled]').all():
        toggle.uncheck()
    page.locator('.gift-editor[data-id=tissue] [name=enabled]').check()
    page.locator('.gift-editor[data-id=tissue] [name=quantity]').fill('3')
    page.locator('.save-button').click()
    expect(page.locator('.prize-card')).to_have_count(1)
    expect(page.locator('.prize-quantity')).to_have_text('3 包 / 份')
    page.reload()
    expect(page.locator('.prize-card')).to_have_count(1)
    expect(page.locator('.history-item')).to_have_count(6)
    page.locator('#draw-button').click()
    page.wait_for_function('!drawing && history.length === 7')
    expect(page.locator('#result-title')).to_have_text('维达联名抽纸')
    expect(page.locator('#result-detail')).to_contain_text('3 包 / 份')

    # Hide quantities, add a custom gift with markup as plain text, remove a draft row.
    page.locator('#open-settings').click()
    page.locator('#show-quantity').uncheck()
    page.locator('#add-gift').click()
    row = page.locator('.gift-editor').last
    row.locator('[name=name]').fill('<img src=x onerror=alert(1)>')
    row.locator('[name=note]').fill('自定义礼品')
    page.locator('#add-gift').click()
    page.locator('.gift-editor').last.locator('.remove-gift').click()
    page.locator('.save-button').click()
    expect(page.locator('.prize-card')).to_have_count(2)
    expect(page.locator('.prize-quantity')).to_have_count(0)
    expect(page.locator('.prize-card img')).to_have_count(0)
    expect(page.locator('.prize-card').last.locator('h3')).to_have_text('<img src=x onerror=alert(1)>')

    # All off is a safe empty state, with a useful path back to settings.
    page.locator('#open-settings').click()
    for toggle in page.locator('[name=enabled]').all():
        toggle.uncheck()
    page.locator('.save-button').click()
    expect(page.locator('#draw-button')).to_be_disabled()
    expect(page.locator('#pool-empty')).to_be_visible()
    page.locator('#empty-settings').click()
    row = page.locator('.gift-editor').first
    row.locator('[name=enabled]').check()
    row.locator('[name=name]').fill('保留这份修改')
    page.evaluate('''() => {
      window.originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function() { throw new DOMException('Full', 'QuotaExceededError'); };
    }''')
    page.locator('.save-button').click()
    expect(page.locator('#settings-error')).to_contain_text('未能保存')
    expect(row.locator('[name=name]')).to_have_value('保留这份修改')
    expect(page.locator('#settings')).to_be_visible()
    page.evaluate('() => { Storage.prototype.setItem = window.originalSet; }')
    page.locator('.save-button').click()
    expect(page.locator('.prize-card h3')).to_have_text('保留这份修改')

    # Fresh configurations at mobile/tablet/desktop widths, including maximum-length copy.
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({'width': width, 'height': 1000})
        page.evaluate('''() => {
          localStorage.removeItem(CONFIG_KEY); localStorage.removeItem(HISTORY_KEY);
        }''')
        page.reload()
        page.wait_for_function('document.querySelectorAll(".prize-card").length === 6')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        page.locator('#open-settings').click()
        assert page.evaluate('document.getElementById("settings").scrollWidth <= document.getElementById("settings").clientWidth'), width
        page.locator('.gift-editor').first.locator('[name=name]').fill('好礼' * 16)
        page.locator('.gift-editor').first.locator('[name=note]').fill('心意' * 32)
        page.locator('.save-button').click()
        page.evaluate('''() => {
          crypto.getRandomValues = array => { array[0] = 0; return array; };
          window.geometry = () => ['.stage', '.result', '#draw-button', '.prizes-panel'].flatMap(selector => {
            const box = document.querySelector(selector).getBoundingClientRect();
            return [box.width, box.height, box.top + scrollY];
          });
          window.baseline = geometry(); window.samples = []; window.watching = true;
          const sample = () => { samples.push(geometry()); if(watching) requestAnimationFrame(sample); };
          requestAnimationFrame(sample);
        }''')
        page.emulate_media(reduced_motion='no-preference' if width == 390 else 'reduce')
        page.evaluate('document.getElementById("draw-button").click()')
        expect(page.locator('#open-settings')).to_be_disabled()
        page.wait_for_function('!drawing && history.length === 1')
        page.evaluate('watching = false; samples.push(geometry())')
        assert page.evaluate('samples.every(s => s.every((v,i) => Math.abs(v-baseline[i]) < 1))'), width
        if width == 390:
            page.evaluate('localStorage.removeItem(CONFIG_KEY); localStorage.removeItem(HISTORY_KEY)')
            page.reload()
            page.screenshot(path=str(previews / 'draw-mobile.png'), full_page=True)
            page.emulate_media(reduced_motion='reduce')
            page.locator('#draw-button').click()
            page.wait_for_function('!drawing && history.length === 1')
            page.screenshot(path=str(previews / 'draw-result.png'), full_page=True)

    # Corrupt persisted data recovers without a blank page.
    page.evaluate("localStorage.setItem(CONFIG_KEY, '{broken')")
    page.reload()
    expect(page.locator('.prize-card')).to_have_count(6)
    expect(page.locator('#toast')).to_contain_text('默认礼品')
    assert not errors, errors
    # A failed photo falls back to its local illustration without affecting the prize.
    page.route('**/draw/images/*', lambda route: route.abort())
    page.reload()
    page.wait_for_function("document.querySelectorAll('.prize-card .product-photo').length === 0")
    expect(page.locator('.prize-card')).to_have_count(6)
    expect(page.locator('#draw-button')).to_be_enabled()
    browser.close()
    print('PASS: all prizes match result/history; no duplicate draws; eligibility and bundles; local persistence; '
          'cancel; add/remove; safe text; empty pool; failed-save drafts; malformed storage; '
          '320/390/768/1440 layouts; stable results; normal/reduced motion')
