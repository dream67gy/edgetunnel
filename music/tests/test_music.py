"""Real MP3 playback, lazy loading, retry and responsive layout on built pages."""
import os, subprocess, tempfile
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[2]
subprocess.run(['python3',str(root/'eat/build.py'),'--mode','standalone'],check=True)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root/'dist/standalone')))
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROME_BIN'),headless=True)
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];audio_requests=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:audio_requests.append(request.url) if '.mp3' in request.url else None)
    for letter in 'ABCD':
        before=len(audio_requests)
        page.goto(f'{base}/music/Test-{letter}/')
        expect(page.locator('.question-number')).to_have_text('题目 '+letter)
        assert page.locator('audio').get_attribute('preload')=='none'
        assert len(audio_requests)==before
        assert page.locator('audio').evaluate('el=>el.paused')
        page.locator('#replay').click()
        page.wait_for_function('document.querySelector("audio").currentTime > .15')
        assert page.locator('audio').evaluate('el=>Number.isFinite(el.duration) && el.duration>0')
        expect(page.locator('body')).to_have_class('playing')
        page.locator('audio').evaluate('el=>el.pause()')
        expect(page.locator('body')).not_to_have_class('playing')
        page.locator('audio').evaluate('el=>el.currentTime=3')
        page.locator('#replay').click()
        assert page.locator('audio').evaluate('el=>el.currentTime<2')
        page.locator('audio').evaluate('el=>el.pause()')
        for width in (320,390,768,1440):
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(letter,width)
        page.set_viewport_size({'width':390,'height':844})
    page.goto(f'{base}/music/Test-A/')
    page.route('**/*.mp3',lambda route:route.abort())
    page.locator('#replay').click()
    expect(page.locator('#error')).to_be_visible()
    page.unroute('**/*.mp3')
    page.locator('#retry').click()
    page.wait_for_function('document.querySelector("audio").currentTime > .15')
    expect(page.locator('#error')).not_to_be_visible()
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('.record').evaluate('el=>getComputedStyle(el).animationName')=='none'
    page.locator('audio').evaluate('el=>{el.currentTime=el.duration-.05;el.play()}')
    expect(page.locator('#status')).to_contain_text('听完了')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'music-mobile.png'),full_page=True)
    assert not errors,errors
    browser.close()
server.shutdown()
print('PASS: four real MP3s decode/play/pause/replay/end; no preload; error recovery; 320/390/768/1440 widths; reduced motion')
