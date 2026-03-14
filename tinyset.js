// tinyset.js - v2.3s
export function createStore(options = {}) {
    const items = new Map(), meta = new Map(), listeners = new Map()
    const indexes = { type: new Map(), spatial: new Map(), coords: new Map() }
    
    const config = {
        idGen: options.idGenerator || (() => 
            `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
        types: options.types || new Set(),
        defaults: options.defaults || {},
        grid: options.spatialGridSize || 100
    }
    meta.set('config', config)

    const ops = {
        $gt: (a,b)=>a>b, $lt: (a,b)=>a<b, $gte: (a,b)=>a>=b, $lte: (a,b)=>a<=b,
        $eq: (a,b)=>a===b, $ne: (a,b)=>a!==b, $in: (a,b)=>b?.includes?.(a),
        $nin: (a,b)=>!b?.includes?.(a), $contains: (a,b)=>String(a).includes(b),
        $startsWith: (a,b)=>String(a).startsWith(b), $endsWith: (a,b)=>String(a).endsWith(b),
        $exists: a=>a!==undefined
    }

    const m = (item, f) => {
        for (const k in f) {
            const c = f[k], v = item[k]
            if (c?.constructor === Object) {
                for (const o in c) 
                    if ((o=='$exists') ? (v!==undefined)!=c[o] : !ops[o]?.(v,c[o])) 
                        return 0
            } else if (v !== c) return 0
        }
        return 1
    }

    const ui = (action, item, old) => {
        let t = indexes.type.get(item.type)
        if (!t) indexes.type.set(item.type, t = new Set())
        if (action == 'add') t.add(item.id)
        else if (action == 'remove') t.delete(item.id)
        else if (action == 'update' && old?.type !== item.type) {
            indexes.type.get(old.type)?.delete(item.id)
            t.add(item.id)
        }
        
        if (item.x != null) {
            const g = config.grid, key = `${Math.floor(item.x/g)},${Math.floor(item.y/g)}`
            indexes.coords.set(item.id, { x: item.x, y: item.y })
            if (action == 'add') {
                if (!indexes.spatial.has(key)) indexes.spatial.set(key, new Set())
                indexes.spatial.get(key).add(item.id)
            } else if (action == 'remove') {
                indexes.spatial.get(key)?.delete(item.id)
                indexes.coords.delete(item.id)
            } else if (action == 'update' && old) {
                const oldKey = `${Math.floor(old.x/g)},${Math.floor(old.y/g)}`
                if (oldKey !== key) {
                    indexes.spatial.get(oldKey)?.delete(item.id)
                    if (!indexes.spatial.has(key)) indexes.spatial.set(key, new Set())
                    indexes.spatial.get(key).add(item.id)
                }
            }
        }
    }

    const e = (event, data) => listeners.get(event)?.forEach(cb => { try { cb(data) } catch {} })

    const sq = (type, x, y, maxDist, filter = {}) => {
        const ts = indexes.type.get(type)
        if (!ts) return []
        
        const grid = config.grid, maxSq = maxDist * maxDist
        const minX = Math.floor((x - maxDist) / grid), maxX = Math.floor((x + maxDist) / grid)
        const minY = Math.floor((y - maxDist) / grid), maxY = Math.floor((y + maxDist) / grid)
        
        const cand = new Set()
        for (let cx = minX; cx <= maxX; cx++) 
            for (let cy = minY; cy <= maxY; cy++) 
                indexes.spatial.get(`${cx},${cy}`)?.forEach(id => ts.has(id) && cand.add(id))
        
        if (!cand.size) return []
        
        const wd = []
        for (const id of cand) {
            const p = indexes.coords.get(id)
            if (!p) continue
            const dx = p.x - x, dy = p.y - y, ds = dx*dx + dy*dy
            if (ds <= maxSq) {
                const it = items.get(id)
                if (it && (!Object.keys(filter).length || m(it, filter)))
                    wd.push({ it, ds })
            }
        }
        
        return wd.sort((a,b)=>a.ds-b.ds).map(w=>w.it)
    }

    const w = (id, ch, o={}) => {
        const old = items.get(id), now = Date.now()
        const it = old ? {...old, ...ch, modified:now} : {id, created:now, modified:now, ...ch}
        if (config.types.size && o.validate!==false && !config.types.has(it.type))
            throw new Error(`Invalid type: ${it.type}`)
        items.set(id, it)
        ui(old ? 'update' : 'add', it, old)
        if (!o.silent) {
            e(old?'update':'create', { id, item:it, old })
            e('change', { type: old?'update':'create', id, item:it })
        }
        meta.get('tx')?.at(-1)?.push({ type: old?'update':'create', id, old, new:it })
        return it
    }

    const q = (type, filter = {}, opts = {}) => {
        const ts = indexes.type.get(type)
        if (!ts) return opts.count ? 0 : (opts.first ? null : [])
        
        const hn = filter?.$near
        const ho = filter && Object.values(filter).some(v => v?.constructor === Object)
        
        let r = []
        if (hn) {
            const [x, y, max = Infinity] = filter.$near, f = {...filter}
            delete f.$near
            r = sq(type, x, y, max, f)
        } else if (!filter || !Object.keys(filter).length) {
            r = Array(ts.size); let i = 0; for (const id of ts) r[i++] = items.get(id)
        } else if (!ho) {
            r = []; for (const id of ts) {
                const it = items.get(id); if (!it) continue
                let ok = 1; for (const k in filter) if (it[k] !== filter[k]) { ok = 0; break }
                ok && r.push(it)
            }
        } else {
            r = []; for (const id of ts) { const it = items.get(id); it && m(it, filter) && r.push(it) }
        }
        
        if (opts.sort) {
            const f = Array.isArray(opts.sort) ? opts.sort : [opts.sort]
            r.length > 1 && r.sort((a,b) => {
                for (const F of f) { const av = a[F]||0, bv = b[F]||0; if (av !== bv) return av < bv ? -1 : 1 }
                return 0
            })
        }
        
        if (opts.limit) { const off = opts.offset||0; r = r.slice(off, off + opts.limit) }
        
        return opts.count ? r.length : opts.ids ? r.map(x=>x.id) : opts.first ? r[0]||null : opts.last ? r.at(-1)||null : r
    }

    const rd = (id, o={}) => {
        let it = items.get(id)
        return !it ? o.exists ? false : null : o.exists ? true : 
            o.fields ? Object.fromEntries(o.fields.map(f=>[f, it[f]])) : 
            o.clone === false ? it : {...it}
    }

    const rm = (id, o={}) => {
        let it = items.get(id)
        if (!it) return 0
        items.delete(id); ui('remove', it)
        if (!o.silent) { e('delete', it); e('change', { type:'delete', id, item:it }) }
        meta.get('tx')?.at(-1)?.push({ type:'delete', id, item:it })
        return 1
    }

    const tx = (fn) => {
        const t = meta.get('tx')||[]; meta.set('tx', [...t, []])
        try { const r = fn(); meta.set('tx', t); return r }
        catch(e) {
            for (const op of meta.get('tx').pop().reverse()) 
                op.type == 'create' ? items.delete(op.id) :
                op.type == 'update' ? items.set(op.id, op.old) :
                op.type == 'delete' && items.set(op.id, op.item)
            meta.set('tx', t); throw e
        }
    }

    return {
        create: (t, p={}) => w(p.id||config.idGen(), {type:t, ...config.defaults[t], ...p}),
        set: (id, p) => items.has(id) ? w(id, typeof p == 'string' ? {[p]: arguments[2]} : p) : null,
        update: (id, c) => items.has(id) ? w(id, c) : null,
        increment: (id, f, b=1) => { let it = items.get(id); return it ? w(id, {[f]: (it[f]||0) + b}) : null },
        get: rd, exists: id => items.has(id),
        find: q, count: (t,f) => q(t,f,{count:1}), first: (t,f) => q(t,f,{first:1}),
        delete: rm, deleteMany: ids => ids.map(rm),
        clear: () => { let c = items.size; items.clear(); indexes.type.clear(); indexes.spatial.clear(); indexes.coords.clear(); return c },
        transaction: tx,
        on: (e, cb) => { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(cb); return () => listeners.get(e)?.delete(cb) },
        once: (e, cb) => { let w = (d) => { cb(d); listeners.get(e)?.delete(w) }; listeners.get(e)?.add(w); return () => listeners.get(e)?.delete(w) },
        off: (e, cb) => listeners.get(e)?.delete(cb),
        dump: () => new Map([...items].map(([k,v])=>[k,{...v}])),
        stats: () => ({
            items: items.size,
            types: Object.fromEntries([...indexes.type].map(([t,s])=>[t,s.size])),
            spatial: { cells: indexes.spatial.size, coords: indexes.coords.size },
            listeners: Object.fromEntries([...listeners].map(([e,s])=>[e,s.size]))
        }),
        meta: { get: k=>meta.get(k), set: (k,v)=>meta.set(k,v), config: ()=>({...config}) }
    }
}
