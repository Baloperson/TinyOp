// tinyset.js test suite
// usage: node --test test.js

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, where } from './tinyset.js'

function makeStore(opts) {
  return createStore(opts)
}

// ─── core API ─────────────────────────────────────────────────────────────────

describe('create', () => {
  it('returns the created entity with id, type, created, modified', () => {
    const store = makeStore()
    const e = store.create('item', { val: 50 })
    assert.ok(e.id)
    assert.equal(e.type, 'item')
    assert.equal(e.val, 50)
    assert.ok(typeof e.created === 'number')
    assert.ok(typeof e.modified === 'number')
  })

  it('assigns sequential string ids by default', () => {
    const store = makeStore()
    const a = store.create('x', {})
    const b = store.create('x', {})
    assert.equal(typeof a.id, 'string')
    assert.notEqual(a.id, b.id)
  })

  it('respects a custom idGenerator', () => {
    let n = 0
    const store = makeStore({ idGenerator: () => `custom-${++n}` })
    const e = store.create('x', {})
    assert.equal(e.id, 'custom-1')
  })

  it('respects an explicit id in props', () => {
    const store = makeStore()
    const e = store.create('x', { id: 'my-id' })
    assert.equal(e.id, 'my-id')
  })

  it('applies type defaults', () => {
    const store = makeStore({ defaults: { item: { val: 30, active: true } } })
    const e = store.create('item', {})
    assert.equal(e.val, 30)
    assert.equal(e.active, true)
  })

  it('prop values override defaults', () => {
    const store = makeStore({ defaults: { item: { val: 30 } } })
    const e = store.create('item', { val: 99 })
    assert.equal(e.val, 99)
  })

  it('throws on invalid type when types set is provided', () => {
    const store = makeStore({ types: new Set(['record']) })
    assert.throws(() => store.create('item', {}), /Invalid type/)
  })

  it('does not throw for valid type', () => {
    const store = makeStore({ types: new Set(['record']) })
    assert.doesNotThrow(() => store.create('record', {}))
  })
})

describe('createMany', () => {
  it('creates multiple entities and returns them all', () => {
    const store = makeStore()
    const items = store.createMany('item', [{ val: 10 }, { val: 20 }, { val: 30 }])
    assert.equal(items.length, 3)
    assert.equal(items[0].val, 10)
    assert.equal(items[2].val, 30)
    assert.equal(store.count('item'), 3)
  })
})

describe('get / getRef / pick / exists', () => {
  it('get returns a shallow copy', () => {
    const store = makeStore()
    const e = store.create('x', { val: 1 })
    const got = store.get(e.id)
    assert.deepEqual(got, e)
    got.val = 999
    assert.equal(store.get(e.id).val, 1)
  })

  it('getRef returns the live object', () => {
    const store = makeStore()
    const e = store.create('x', { val: 1 })
    const ref = store.getRef(e.id)
    store.update(e.id, { val: 2 })
    assert.equal(ref.val, 2)
  })

  it('get returns null for unknown id', () => {
    const store = makeStore()
    assert.equal(store.get('nope'), null)
  })

  it('pick returns only the requested fields', () => {
    const store = makeStore()
    const e = store.create('x', { a: 1, b: 2, c: 3 })
    const p = store.pick(e.id, ['a', 'c'])
    assert.deepEqual(p, { a: 1, c: 3 })
  })

  it('pick returns null for unknown id', () => {
    const store = makeStore()
    assert.equal(store.pick('nope', ['a']), null)
  })

  it('exists returns true/false correctly', () => {
    const store = makeStore()
    const e = store.create('x', {})
    assert.equal(store.exists(e.id), true)
    assert.equal(store.exists('nope'), false)
  })
})

describe('update', () => {
  it('merges changes and updates modified timestamp', async () => {
    const store = makeStore()
    const e = store.create('x', { a: 1, b: 2 })
    const before = e.modified
    await new Promise(r => setTimeout(r, 2))
    store.update(e.id, { a: 99 })
    const updated = store.get(e.id)
    assert.equal(updated.a, 99)
    assert.equal(updated.b, 2)
    assert.ok(updated.modified > before)
  })

  it('supports a functional updater', () => {
    const store = makeStore()
    const e = store.create('x', { val: 100 })
    store.update(e.id, old => ({ val: old.val - 10 }))
    assert.equal(store.get(e.id).val, 90)
  })

  it('returns null for unknown id', () => {
    const store = makeStore()
    assert.equal(store.update('nope', { a: 1 }), null)
  })
})

describe('set', () => {
  it('sets a single field', () => {
    const store = makeStore()
    const e = store.create('x', { val: 10 })
    store.set(e.id, 'val', 50)
    assert.equal(store.get(e.id).val, 50)
  })

  it('returns null for unknown id', () => {
    const store = makeStore()
    assert.equal(store.set('nope', 'val', 1), null)
  })
})

describe('increment', () => {
  it('increments a field by default step of 1', () => {
    const store = makeStore()
    const e = store.create('x', { score: 10 })
    store.increment(e.id, 'score')
    assert.equal(store.get(e.id).score, 11)
  })

  it('increments by a custom step', () => {
    const store = makeStore()
    const e = store.create('x', { score: 10 })
    store.increment(e.id, 'score', 5)
    assert.equal(store.get(e.id).score, 15)
  })

  it('treats missing field as 0', () => {
    const store = makeStore()
    const e = store.create('x', {})
    store.increment(e.id, 'score')
    assert.equal(store.get(e.id).score, 1)
  })
})

describe('delete / deleteMany', () => {
  it('delete removes the entity and returns it', () => {
    const store = makeStore()
    const e = store.create('x', { val: 42 })
    const deleted = store.delete(e.id)
    assert.equal(deleted.val, 42)
    assert.equal(store.exists(e.id), false)
  })

  it('delete returns null for unknown id', () => {
    const store = makeStore()
    assert.equal(store.delete('nope'), null)
  })

  it('deleteMany removes all listed ids', () => {
    const store = makeStore()
    const a = store.create('x', {})
    const b = store.create('x', {})
    const c = store.create('x', {})
    store.deleteMany([a.id, b.id])
    assert.equal(store.exists(a.id), false)
    assert.equal(store.exists(b.id), false)
    assert.equal(store.exists(c.id), true)
  })
})

describe('clear', () => {
  it('removes everything and returns the count', () => {
    const store = makeStore()
    store.create('x', {}); store.create('y', {})
    const count = store.clear()
    assert.equal(count, 2)
    assert.equal(store.stats().items, 0)
  })
})

describe('dump / stats', () => {
  it('dump returns a plain object of shallow copies', () => {
    const store = makeStore()
    const e = store.create('x', { val: 1 })
    const d = store.dump()
    assert.equal(typeof d, 'object')
    assert.ok(!('get' in d))
    assert.equal(d[e.id].val, 1)
    d[e.id].val = 999
    assert.equal(store.get(e.id).val, 1)
  })

  it('stats returns correct item and type counts', () => {
    const store = makeStore()
    store.create('record', {}); store.create('item', {}); store.create('item', {})
    const s = store.stats()
    assert.equal(s.items, 3)
    assert.equal(s.types.record, 1)
    assert.equal(s.types.item, 2)
  })
})

describe('events', () => {
  it('fires create event', (t, done) => {
    const store = makeStore()
    store.on('create', ({ item }) => {
      assert.equal(item.type, 'x')
      done()
    })
    store.create('x', {})
  })

  it('fires update event with old and new', (t, done) => {
    const store = makeStore()
    const e = store.create('x', { val: 1 })
    store.on('update', ({ item, old }) => {
      assert.equal(item.val, 2)
      assert.equal(old.val, 1)
      done()
    })
    store.update(e.id, { val: 2 })
  })

  it('fires delete event', (t, done) => {
    const store = makeStore()
    const e = store.create('x', {})
    store.on('delete', ({ id }) => {
      assert.equal(id, e.id)
      done()
    })
    store.delete(e.id)
  })

  it('on returns an unsubscribe function that works', () => {
    const store = makeStore()
    let count = 0
    const off = store.on('create', () => count++)
    store.create('x', {})
    off()
    store.create('x', {})
    assert.equal(count, 1)
  })

  it('once fires exactly once', () => {
    const store = makeStore()
    let count = 0
    store.once('create', () => count++)
    store.create('x', {}); store.create('x', {})
    assert.equal(count, 1)
  })

  it('change event fires for all mutation types', () => {
    const store = makeStore()
    const types = []
    store.on('change', ({ type }) => types.push(type))
    const e = store.create('x', {})
    store.update(e.id, { val: 1 })
    store.delete(e.id)
    assert.deepEqual(types, ['create', 'update', 'delete'])
  })
})

describe('transaction', () => {
  it('commits all operations on success', () => {
    const store = makeStore()
    const a = store.create('x', { val: 1 })
    store.transaction(() => {
      store.update(a.id, { val: 2 })
      store.create('x', { val: 3 })
    })
    assert.equal(store.get(a.id).val, 2)
    assert.equal(store.count('x'), 2)
  })

  it('rolls back all operations on throw', () => {
    const store = makeStore()
    const a = store.create('x', { val: 1 })
    const originalCount = store.count('x')
    assert.throws(() => {
      store.transaction(() => {
        store.update(a.id, { val: 99 })
        store.create('x', { val: 3 })
        throw new Error('abort')
      })
    }, /abort/)
    assert.equal(store.get(a.id).val, 1)
    assert.equal(store.count('x'), originalCount)
  })
})

// ─── find / count / where ─────────────────────────────────────────────────────

describe('find', () => {
  let store
  beforeEach(() => {
    store = makeStore()
    store.create('item',   { val: 10, name: 'alpha', active: true  })
    store.create('item',   { val: 50, name: 'beta',  active: true  })
    store.create('item',   { val: 80, name: 'gamma', active: false })
    store.create('record', { val: 100 })
  })

  it('find with no predicate returns all of that type', () => {
    assert.equal(store.find('item').count(), 3)
    assert.equal(store.find('record').count(), 1)
  })

  it('find returns empty for unknown type', () => {
    assert.equal(store.find('unknown').count(), 0)
  })

  it('inline predicate filters correctly', () => {
    const result = store.find('item', e => e.val > 20).all()
    assert.equal(result.length, 2)
    assert.ok(result.every(e => e.val > 20))
  })

  it('count shorthand', () => {
    assert.equal(store.count('item'), 3)
    assert.equal(store.count('item', e => e.active), 2)
  })

  it('sort ascending by field', () => {
    const sorted = store.find('item').sort('val').all()
    assert.equal(sorted[0].val, 10)
    assert.equal(sorted[2].val, 80)
  })

  it('limit and offset', () => {
    const limited = store.find('item').sort('val').limit(2).all()
    assert.equal(limited.length, 2)
    const offset = store.find('item').sort('val').offset(1).all()
    assert.equal(offset.length, 2)
    assert.equal(offset[0].val, 50)
  })

  it('first and last', () => {
    const q = store.find('item').sort('val')
    assert.equal(q.first().val, 10)
    assert.equal(q.last().val, 80)
  })

  it('first returns null on empty result', () => {
    assert.equal(store.find('unknown').first(), null)
  })

  it('ids returns array of ids', () => {
    const ids = store.find('item').ids()
    assert.equal(ids.length, 3)
    ids.forEach(id => assert.equal(typeof id, 'string'))
  })
})

describe('where predicates', () => {
  let store
  beforeEach(() => {
    store = makeStore()
    store.create('item', { val: 5,  status: 'a',  name: 'foo'   })
    store.create('item', { val: 20, status: 'b',   name: 'bar' })
    store.create('item', { val: 50, status: 'c', name: 'baz'  })
  })

  it('where.eq', () => {
    assert.equal(store.find('item', where.eq('status', 'b')).count(), 1)
  })

  it('where.ne', () => {
    assert.equal(store.find('item', where.ne('status', 'b')).count(), 2)
  })

  it('where.gt', () => {
    assert.equal(store.find('item', where.gt('val', 10)).count(), 2)
  })

  it('where.gte', () => {
    assert.equal(store.find('item', where.gte('val', 20)).count(), 2)
  })

  it('where.lt', () => {
    assert.equal(store.find('item', where.lt('val', 20)).count(), 1)
  })

  it('where.lte', () => {
    assert.equal(store.find('item', where.lte('val', 20)).count(), 2)
  })

  it('where.in', () => {
    const r = store.find('item', where.in('status', ['a', 'c'])).all()
    assert.equal(r.length, 2)
  })

  it('where.contains', () => {
    assert.equal(store.find('item', where.contains('name', 'oo')).count(), 1)
  })

  it('where.startsWith', () => {
    assert.equal(store.find('item', where.startsWith('name', 'foo')).count(), 1)
  })

  it('where.endsWith', () => {
    assert.equal(store.find('item', where.endsWith('name', 'az')).count(), 1)
  })

  it('where.exists', () => {
    store.create('item', { val: 1 }) // no status field
    assert.equal(store.find('item', where.exists('status')).count(), 3)
  })

  it('where.and', () => {
    const r = store.find('item', where.and(where.gt('val', 10), where.eq('status', 'b'))).all()
    assert.equal(r.length, 1)
    assert.equal(r[0].status, 'b')
  })

  it('where.or', () => {
    const r = store.find('item', where.or(where.eq('status', 'a'), where.eq('status', 'c'))).all()
    assert.equal(r.length, 2)
  })

  it('nested where.and + where.or', () => {
    const r = store.find('item', where.and(
      where.or(where.eq('status', 'a'), where.eq('status', 'b')),
      where.lt('val', 25)
    )).all()
    assert.equal(r.length, 2)
    assert.ok(r.every(i => i.val < 25))
  })
})

// ─── query cache ──────────────────────────────────────────────────────────────

describe('query cache correctness', () => {
  it('cached result matches uncached result', () => {
    const store = makeStore()
    for (let i = 0; i < 100; i++)
      store.create('item', { val: i, status: i % 2 === 0 ? 'active' : 'pending' })

    const pred = where.and(where.eq('status', 'b'), where.gt('val', 40))

    const r1 = store.find('item', pred).all()   // cold miss
    store.find('item', pred).all()              // cold hit 1
    const r3 = store.find('item', pred).all()   // cold hit 2 — promotes to hot
    const r4 = store.find('item', pred).all()   // hot

    assert.deepEqual(r1.map(e => e.id).sort(), r3.map(e => e.id).sort())
    assert.deepEqual(r1.map(e => e.id).sort(), r4.map(e => e.id).sort())
  })

  it('cache is invalidated after a write to the same type', () => {
    const store = makeStore()
    for (let i = 0; i < 20; i++) store.create('item', { val: i })

    const pred = where.gt('val', 15)
    const before = store.find('item', pred).count()
    store.find('item', pred).count()
    store.find('item', pred).count()
    store.find('item', pred).count() // hot

    store.create('item', { val: 99 })

    assert.equal(store.find('item', pred).count(), before + 1)
  })

  it('write to type A does not invalidate cache for type B', () => {
    const store = makeStore()
    for (let i = 0; i < 10; i++) store.create('record', { score: i })
    for (let i = 0; i < 10; i++) store.create('item',   { val: i })

    const pred = where.gt('score', 5)
    store.find('record', pred).count()
    store.find('record', pred).count()
    store.find('record', pred).count()
    const countBefore = store.find('record', pred).count() // hot

    store.create('item', { val: 99 })
    store.update(store.find('item').first().id, { val: 0 })

    assert.equal(store.find('record', pred).count(), countBefore)
  })

  it('cache is invalidated after delete', () => {
    const store = makeStore()
    const items = []
    for (let i = 0; i < 10; i++) items.push(store.create('item', { val: i }))

    const pred = where.gt('val', 5)
    store.find('item', pred).count()
    store.find('item', pred).count()
    store.find('item', pred).count() // hot

    store.delete(items[9].id) // val:9 removed

    assert.equal(store.find('item', pred).count(), 3) // val 6, 7, 8 remain
  })

  it('cache is invalidated after update changes predicate match', () => {
    const store = makeStore()
    const e = store.create('item', { val: 10 })
    for (let i = 0; i < 5; i++) store.create('item', { val: 100 })

    const pred = where.gt('val', 50)
    store.find('item', pred).count()
    store.find('item', pred).count()
    store.find('item', pred).count() // hot

    store.update(e.id, { val: 200 }) // now matches

    assert.equal(store.find('item', pred).count(), 6)
  })

  it('inline predicates (no _key) still return correct results', () => {
    const store = makeStore()
    for (let i = 0; i < 20; i++) store.create('item', { val: i })

    const pred = i => i.val > 10 // no _key — ref-keyed cold cache only
    const r1 = store.find('item', pred).count()
    store.create('item', { val: 99 })

    assert.equal(store.find('item', pred).count(), r1 + 1)
  })

  it('compound with untagged predicate (ne) falls back to ref-keyed path', () => {
    // where.ne carries no _key so the compound _key is null —
    // correctness must still hold via the ref-keyed cold cache
    const store = makeStore()
    store.create('item', { status: 'b'   })
    store.create('item', { status: 'a'  })
    store.create('item', { status: 'c' })

    const pred = where.and(where.ne('status', 'a'), where.ne('status', 'b'))
    const r = store.find('item', pred).all()
    assert.equal(r.length, 1)
    assert.equal(r[0].status, 'c')
  })
})

// ─── spatial index ────────────────────────────────────────────────────────────

describe('spatial index', () => {
  // spatial queries are most common in simulations — fixture uses generic (x, y, label)
  let store

  beforeEach(() => {
    store = makeStore({ spatialGridSize: 100 })
    //  close:  (110, 210) — distance ~14 from origin (100, 200)
    //  medium: (150, 200) — distance  50
    //  far:    (400, 400) — distance ~300
    store.create('item',   { x: 110, y: 210, val: 50, label: 'close'  })
    store.create('item',   { x: 150, y: 200, val: 30, label: 'medium' })
    store.create('item',   { x: 400, y: 400, val: 80, label: 'far'    })
    store.create('record', { x: 100, y: 200 }) // different type — must not appear in item queries
  })

  it('near returns only entities within radius', () => {
    const labels = store.near('item', 100, 200, 60).all().map(e => e.label)
    assert.ok(labels.includes('close'))
    assert.ok(labels.includes('medium'))
    assert.ok(!labels.includes('far'))
  })

  it('near returns results sorted by distance ascending', () => {
    const result = store.near('item', 100, 200, 200).all()
    assert.equal(result[0].label, 'close')
    assert.equal(result[1].label, 'medium')
  })

  it('near does not return entities of a different type', () => {
    const result = store.near('item', 100, 200, 500).all()
    assert.ok(result.every(e => e.type === 'item'))
  })

  it('near with predicate filters results', () => {
    const result = store.near('item', 100, 200, 200, e => e.val > 40).all()
    assert.equal(result.length, 1)
    assert.equal(result[0].label, 'close')
  })

  it('near returns empty array when nothing is in range', () => {
    assert.equal(store.near('item', 0, 0, 5).count(), 0)
  })

  it('near returns empty for unknown type', () => {
    assert.equal(store.near('unknown', 100, 200, 500).count(), 0)
  })

  it('spatial index updates when entity moves', () => {
    const e = store.find('item', where.eq('label', 'far')).first()
    store.update(e.id, { x: 105, y: 205 })
    const result = store.near('item', 100, 200, 20).all()
    assert.ok(result.some(r => r.id === e.id))
  })

  it('spatial index removes entity on delete', () => {
    const e = store.find('item', where.eq('label', 'close')).first()
    store.delete(e.id)
    const result = store.near('item', 100, 200, 60).all()
    assert.ok(!result.some(r => r.id === e.id))
  })

  it('entities without x/y are not in spatial index but remain findable', () => {
    const noPos = store.create('item', { label: 'nopos', val: 10 })
    const result = store.near('item', 200, 300, 1000).all()
    assert.ok(!result.some(r => r.id === noPos.id))
    assert.ok(store.find('item', where.eq('label', 'nopos')).first())
  })

  it('works correctly across grid cell boundaries', () => {
    const s = makeStore({ spatialGridSize: 100 })
    s.create('unit', { x: 99,  y: 0, label: 'left'  })
    s.create('unit', { x: 101, y: 0, label: 'right' })
    assert.equal(s.near('unit', 100, 0, 10).count(), 2)
  })

  it('stats reflects spatial index correctly', () => {
    assert.ok(store.stats().spatial.coords >= 3)
  })
})
