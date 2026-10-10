// Public shared pool. This handler owns only /eat/api/pool; no admin/KV access.
const EAT_POOL_SELECT = 'SELECT revision, shops, updated_at FROM eat_pool WHERE id = 1';
const EAT_POOL_WRITE = `INSERT INTO eat_pool (id, revision, shops, updated_at)
 SELECT 1, 1, ?, ? WHERE ? = 0
 ON CONFLICT(id) DO UPDATE SET shops = excluded.shops,
 revision = eat_pool.revision + 1, updated_at = excluded.updated_at
 WHERE eat_pool.revision = ? RETURNING revision, shops, updated_at`;
const EAT_POOL_UPDATE = `UPDATE eat_pool SET shops = ?, revision = revision + 1, updated_at = ?
 WHERE id = 1 AND revision = ? RETURNING revision, shops, updated_at`;

function eatPoolData(row) {
  return row ? {
      revision: row.revision,
      shops: JSON.parse(row.shops),
      updatedAt: row.updated_at
    } :
    {
      revision: 0,
      shops: null,
      updatedAt: null
    };
}

function eatValidateShops(shops) {
  const icons = ['🍜', '🍚', '🥟', '🍲', '🍔', '🍕', '🥗', '🍢', '🥪', '🍣', '🍰', '🧋', '🥣', '🥩', '🍝', '🍳', '🍛', '🥘', '🌮', '🥐', '🥯', '🦞'];
  const ids = new Set();
  if (!Array.isArray(shops) || shops.length > 100) throw new Error('奖池最多 100 家店');
  return shops.map(s => {
    if (!s || typeof s.id !== 'string' || !s.id || s.id.length > 100 || ids.has(s.id) ||
      typeof s.name !== 'string' || !s.name.trim() || s.name.length > 32 ||
      !icons.includes(s.emoji) || !['随时', '早餐', '午餐', '晚餐', '夜宵'].includes(s.category) ||
      typeof s.note !== 'string' || s.note.length > 80 || typeof s.enabled !== 'boolean' ||
      !(s.price === null || (Number.isInteger(s.price) && s.price >= 0 && s.price <= 9999))) {
      throw new Error('店铺信息格式不正确');
    }
    ids.add(s.id);
    return {
      id: s.id,
      name: s.name.trim(),
      emoji: s.emoji,
      category: s.category,
      price: s.price,
      note: s.note,
      enabled: s.enabled
    };
  });
}
export async function eatPoolAPI(request, env) {
  const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra
    }
  });
  if (!['GET', 'PUT'].includes(request.method)) return json({
    error: '不支持的请求方法'
  }, 405, {
    'Allow': 'GET, PUT'
  });
  if (!env.EAT_DB) return json({
    error: '共享数据库尚未连接，请配置 EAT_DB 绑定',
    code: 'NOT_CONFIGURED'
  }, 503);
  let body;
  if (request.method === 'PUT') {
    const origin = request.headers.get('Origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({
      error: '请从本站修改奖池'
    }, 403);
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({
      error: '需要 JSON 数据'
    }, 415);
    if (Number(request.headers.get('Content-Length')) > 100000) return json({
      error: '数据过大'
    }, 413);
    try {
      // Enforce the bound even for requests without Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return json({
        error: '缺少请求数据'
      }, 400);
      const chunks = [];
      let length = 0;
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 100000) {
          await reader.cancel();
          return json({
            error: '数据过大'
          }, 413)
        }
        chunks.push(value)
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength
      }
      body = JSON.parse(new TextDecoder().decode(bytes));
      if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error('缺少有效的菜单版本');
      body.shops = eatValidateShops(body.shops);
    } catch (error) {
      return json({
        error: '请求数据不正确，请检查店铺信息'
      }, 400)
    }
  }
  try {
    const db = env.EAT_DB.withSession('first-primary');
    if (request.method === 'GET') {
      const data = eatPoolData(await db.prepare(EAT_POOL_SELECT).first());
      const etag = `"eat-pool-${data.revision}"`;
      // Always check D1 for freshness; only skip sending an unchanged menu body.
      if (request.headers.get('If-None-Match') === etag) return new Response(null, {
        status: 304,
        headers: { 'ETag': etag, 'Cache-Control': 'no-store' }
      });
      return json(data, 200, { 'ETag': etag })
    }
    const now = new Date().toISOString(),
      encoded = JSON.stringify(body.shops);
    const row = body.revision === 0 ?
      await db.prepare(EAT_POOL_WRITE).bind(encoded, now, 0, 0).first() :
      await db.prepare(EAT_POOL_UPDATE).bind(encoded, now, body.revision).first();
    if (!row) return json({
      error: '奖池刚被其他人修改，请查看最新内容后再保存',
      code: 'CONFLICT',
      ...eatPoolData(await db.prepare(EAT_POOL_SELECT).first())
    }, 409);
    return json(eatPoolData(row));
  } catch (error) {
    console.error('Eat database operation failed');
    return json({
      error: '共享数据库暂不可用，请检查绑定和数据表，稍后重试',
      code: 'DATABASE_UNAVAILABLE'
    }, 503);
  }
}
