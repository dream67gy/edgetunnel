#!/usr/bin/env python3
"""Create a Pages _worker.js module directory without modifying tracked sources."""
import argparse
import hashlib
import json
import runpy
import shutil
from pathlib import Path

APP = Path(__file__).resolve().parent
ROOT = APP.parent


def build(mode='combined', output=None):
    target = Path(output).resolve() if output else ROOT / 'dist' / mode
    # Replace only owned build directories, never either application's source tree.
    modules = target / '_worker.js'
    if target == ROOT or any(target == source or source in target.parents for source in (APP, ROOT / 'draw', ROOT / 'music')):
        raise ValueError('Use an output directory outside the application source directories')
    inputs = ['worker.js', 'api.js', 'index.html', 'app.js', 'styles.css']
    if mode == 'combined':
        if not (ROOT / '_worker.js').is_file():
            raise FileNotFoundError('Combined build needs the upstream _worker.js; use --mode standalone')
        inputs.append('combined.js')
    for name in inputs:
        if not (APP / name).is_file():
            raise FileNotFoundError(APP / name)
    html = (APP / 'index.html').read_text(encoding='utf-8')
    # Source stays separate and readable; output embeds assets to avoid path collisions.
    style_tag = '<link rel="stylesheet" href="/eat/styles.css">'
    script_tag = '<script src="/eat/app.js"></script>'
    if html.count(style_tag) != 1 or html.count(script_tag) != 1:
        raise ValueError('Expected one Eat stylesheet and script reference in index.html')
    html = html.replace(style_tag, '<style>\n' + (APP / 'styles.css').read_text(encoding='utf-8') + '</style>')
    html = html.replace(script_tag, '<script>\n' + (APP / 'app.js').read_text(encoding='utf-8') + '</script>')
    draw = ROOT / 'draw'
    draw_html = (draw / 'index.html').read_text(encoding='utf-8')
    # Publish photos as cacheable static assets, outside the Worker bundle.
    photo_sources = sorted((draw / 'images').glob('*'))
    photo_names = {}
    for photo in photo_sources:
        if photo.suffix.lower() not in ('.jpg', '.png', '.webp'):
            continue
        digest = hashlib.sha256(photo.read_bytes()).hexdigest()[:12]
        photo_names[photo.name] = f'{photo.stem}.{digest}{photo.suffix}'
    for tag, name, wrapper in [
        ('<link rel="stylesheet" href="/draw/styles.css">', 'styles.css', 'style'),
        ('<script type="module" src="/draw/app.js"></script>', 'app.js', 'script'),
    ]:
        if draw_html.count(tag) != 1:
            raise ValueError('Expected one Draw asset reference: ' + name)
        content = (draw / name).read_text(encoding='utf-8')
        if name == 'app.js':
            content = (draw / 'model.js').read_text(encoding='utf-8').replace('export ', '') + '\n' + content.replace("import { validateDrawConfig } from './model.js';\n", '')
        draw_html = draw_html.replace(tag, '<' + wrapper + '>\n' + content + '</' + wrapper + '>')
    for original, versioned in photo_names.items():
        draw_html = draw_html.replace("file:'" + original + "'", "file:'" + versioned + "'")
        draw_html = draw_html.replace('/draw/images/' + original, '/draw/images/' + versioned)
    if modules.is_symlink():
        raise ValueError('Refusing to replace a symlinked Worker directory')
    if modules.is_dir():
        shutil.rmtree(modules)
    elif modules.exists():
        raise ValueError('Output contains an existing _worker.js file; use a fresh directory')
    modules.mkdir(parents=True)
    for name in ['worker.js', 'api.js']:
        shutil.copyfile(APP / name, modules / name)
    shutil.copyfile(draw / 'api.js', modules / 'draw-api.js')
    shutil.copyfile(draw / 'model.js', modules / 'model.js')
    etag = '"eat-page-' + hashlib.sha256(html.encode('utf-8')).hexdigest()[:24] + '"'
    (modules / 'page.js').write_text(
        'export const EAT_HTML = ' + json.dumps(html, ensure_ascii=False) + ';\n' +
        'export const EAT_ETAG = ' + json.dumps(etag) + ';\n', encoding='utf-8')
    draw_etag = '"draw-page-' + hashlib.sha256(draw_html.encode('utf-8')).hexdigest()[:24] + '"'
    (modules / 'draw-page.js').write_text(
        'export const DRAW_HTML = ' + json.dumps(draw_html, ensure_ascii=False) + ';\n' +
        'export const DRAW_ETAG = ' + json.dumps(draw_etag) + ';\n', encoding='utf-8')
    if mode == 'combined':
        shutil.copyfile(ROOT / '_worker.js', modules / 'upstream.js')
        shutil.copyfile(APP / 'combined.js', modules / 'index.js')
    else:
        (modules / 'index.js').write_text("export { default } from './worker.js';\n", encoding='utf-8')
    photo_output = target / 'draw' / 'images'
    if photo_output.is_symlink() or photo_output.parent.is_symlink():
        raise ValueError('Refusing to replace symlinked photo output')
    if photo_output.is_dir():
        shutil.rmtree(photo_output)
    photo_output.mkdir(parents=True, exist_ok=True)
    for original, versioned in photo_names.items():
        shutil.copyfile(draw / 'images' / original, photo_output / versioned)
    runpy.run_path(str(ROOT / 'music/build.py'))['build_music'](target)
    (target / '_routes.json').write_text(json.dumps({'version':1, 'include':['/*'], 'exclude':['/draw/images/*', '/music', '/music/*']}) + '\n')
    (target / '_headers').write_text('/draw/images/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n/music/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n')
    # A tiny static fallback; all live requests are handled by the Worker.
    (target / '404.html').write_text('<!doctype html><meta charset="utf-8"><title>Not found</title><h1>Not found</h1>\n')
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['combined', 'standalone'], default='combined')
    parser.add_argument('--out', type=Path, help='Output directory (default: dist/<mode>)')
    args = parser.parse_args()
    print(f'Built {args.mode}: {build(args.mode, args.out)}')
