"""Build static music pages and fingerprinted media for Cloudflare Pages."""
import hashlib
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parent

def build_music(target):
    output=Path(target)/'music'
    if output.is_symlink():
        raise ValueError('Refusing to replace symlinked music output')
    # Validate all inputs before replacing the previous build.
    assets={name:(ROOT/name).read_bytes() for name in ['styles.css','app.js']}
    for letter in 'ABCD':
        name=f'audio/track-{letter.lower()}.mp3'
        assets[name]=(ROOT/name).read_bytes()
        if not assets[name] or len(assets[name])>25*1024*1024:
            raise ValueError('Music assets must be nonempty and at most 25 MiB')
    template=(ROOT/'index.html').read_text()
    if output.exists():shutil.rmtree(output)
    (output/'assets').mkdir(parents=True)
    urls={}
    for name,content in assets.items():
        source=Path(name)
        filename=f'{source.stem}.{hashlib.sha256(content).hexdigest()[:12]}{source.suffix}'
        (output/'assets'/filename).write_bytes(content)
        urls[name]='/music/assets/'+filename
    for letter in 'ABCD':
        html=template.replace('{{LETTER}}',letter).replace('{{CSS}}',urls['styles.css']).replace('{{JS}}',urls['app.js']).replace('{{AUDIO}}',urls[f'audio/track-{letter.lower()}.mp3'])
        folder=output/f'Test-{letter}'
        folder.mkdir()
        (folder/'index.html').write_text(html)
    links=''.join(f'<a href="/music/Test-{letter}/">{letter}<small>题目 {letter}</small></a>' for letter in 'ABCD')
    (output/'index.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#102c63"><title>听歌识曲</title><link rel="stylesheet" href="'''+urls['styles.css']+'''"><main class="quiz"><header><span class="brand">听歌识曲 <span>LISTEN & GUESS</span></span></header><section class="player-card"><p class="eyebrow">FOUR MELODIES, FOUR MEMORIES</p><h1>听一段，猜一首。</h1><p class="intro">选择题目，开启你的音乐挑战。</p><nav class="question-links" aria-label="选择题目">'''+links+'''</nav></section><p class="tip">每道题都有一段旋律，等你来揭开谜底。</p></main></html>''')
