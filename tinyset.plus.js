// tinyset.plus.js 
import { createStore as createBaseStore } from './tinyset.js'

export function createStore(options = {}) {
    const store = createBaseStore(options)
    
    // ==================== CONFIG ====================
    const config = {
        processId: options.processId || `proc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        batchDelay: options.batchDelay || 16,
        maxJournalSize: options.maxJournalSize || 10000,
        syncUrl: options.syncUrl || null
    }
    
    // ==================== VECTOR CLOCKS ====================
    const clocks = new Map() // processId -> counter
    clocks.set(config.processId, 0)
    
    const clockInc = () => {
        clocks.set(config.processId, (clocks.get(config.processId) || 0) + 1)
    }
    
    const clockGet = () => {
        const snap = {}
        for (const [pid, val] of clocks) snap[pid] = val
        return snap
    }
    
    const clockMerge = (other) => {
        for (const pid in other) {
            clocks.set(pid, Math.max(clocks.get(pid) || 0, other[pid]))
        }
    }
    
    // ==================== JOURNAL ====================
    const journal = new Map() // id -> operation
    const journalIdx = {
        byTime: new Map(),     // timestamp -> id
        byProc: new Map(),     // processId -> Set<id>
        byType: new Map()      // type -> Set<id>
    }
    const journalListeners = new Set()
    
    const record = (type, data) => {
        clockInc()
        
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
        const op = {
            id, type, data,
            pid: config.processId,
            clock: clockGet(),
            ts: Date.now()
        }
        
        // Index the operation
        journal.set(id, op)
        journalIdx.byTime.set(op.ts, id)
        
        let byProc = journalIdx.byProc.get(op.pid)
        if (!byProc) journalIdx.byProc.set(op.pid, byProc = new Set())
        byProc.add(id)
        
        let byType = journalIdx.byType.get(type)
        if (!byType) journalIdx.byType.set(type, byType = new Set())
        byType.add(id)
        
        // Trim if needed
        if (journal.size > config.maxJournalSize) {
            const oldest = [...journalIdx.byTime.keys()].sort()[0]
            const oldestId = journalIdx.byTime.get(oldest)
            if (oldestId) {
                const old = journal.get(oldestId)
                journal.delete(oldestId)
                journalIdx.byTime.delete(oldest)
                journalIdx.byProc.get(old?.pid)?.delete(oldestId)
                journalIdx.byType.get(old?.type)?.delete(oldestId)
            }
        }
        
        // Notify listeners (async batch)
        Promise.resolve().then(() => {
            journalListeners.forEach(cb => { try { cb(op) } catch {} })
        })
        
        return op
    }
    
    // ==================== AFFINE OPERATIONS ====================
    class AffineOp {
        constructor(scale = 1, shift = 0) {
            this.scale = scale
            this.shift = shift
            this._cache = new Map()
        }
        
        compose(other) {
            const key = `${other.scale},${other.shift}`
            if (!this._cache.has(key)) {
                this._cache.set(key, new AffineOp(
                    this.scale * other.scale,
                    this.scale * other.shift + this.shift
                ))
            }
            return this._cache.get(key)
        }
        
        apply(x) { return this.scale * x + this.shift }
        applyMany(arr) { return arr.map(x => this.scale * x + this.shift) }
        inverse() { return new AffineOp(1/this.scale, -this.shift/this.scale) }
    }
    
    // ==================== WRAPPED CORE METHODS ====================
    const base = {
        create: store.create,
        set: store.set,
        update: store.update,
        delete: store.delete,
        get: store.get
    }
    
    store.create = function(type, props = {}) {
        const result = base.create.call(this, type, props)
        if (result) record('create', { id: result.id, type, props })
        return result
    }
    
    store.set = function(id, key, val) {
        const old = base.get.call(this, id)
        const result = base.set.call(this, id, key, val)
        if (result && old) {
            const changes = typeof key === 'string' ? { [key]: val } : key
            record('update', { id, changes, old: { [key]: old[key] } })
        }
        return result
    }
    
    store.update = function(id, changes) {
        const old = base.get.call(this, id)
        const result = base.update.call(this, id, changes)
        if (result) record('update', { id, changes, old })
        return result
    }
    
    store.delete = function(id) {
        const old = base.get.call(this, id)
        const result = base.delete.call(this, id)
        if (result) record('delete', { id, old })
        return result
    }
    
    // ==================== SYNC ====================
    const sync = {
        export(since = 0, filter = {}) {
            const ops = []
            for (const [ts, id] of journalIdx.byTime) {
                if (ts <= since) continue
                const op = journal.get(id)
                if (filter.pid && op.pid !== filter.pid) continue
                if (filter.type && op.type !== filter.type) continue
                ops.push(op)
            }
            return {
                ops: ops.sort((a,b) => a.ts - b.ts),
                clock: clockGet(),
                pid: config.processId,
                ts: Date.now()
            }
        },
        
        import(payload, strategy = 'merge') {
            if (!payload?.ops?.length) return { applied: 0 }
            
            clockMerge(payload.clock)
            
            // Sort by causal order using vector clocks
            const sorted = [...payload.ops].sort((a, b) => {
                // Compare vector clocks
                for (const pid of new Set([...Object.keys(a.clock), ...Object.keys(b.clock)])) {
                    const av = a.clock[pid] || 0
                    const bv = b.clock[pid] || 0
                    if (av < bv) return -1
                    if (av > bv) return 1
                }
                return 0
            })
            
            let applied = 0
            for (const op of sorted) {
                const local = clocks.get(op.pid) || 0
                const opTime = op.clock[op.pid] || 0
                
                if (opTime <= local && strategy !== 'force') continue
                
                // Apply operation
                const item = store.get(op.data.id)
                switch (op.type) {
                    case 'create':
                        if (!item) store.create(op.data.type, op.data.props)
                        break
                    case 'update':
                        if (item) store.update(op.data.id, op.data.changes)
                        break
                    case 'delete':
                        if (item) store.delete(op.data.id)
                        break
                }
                
                applied++
                clockMerge(op.clock)
            }
            
            return { applied }
        },
        
        connect(url = config.syncUrl) {
            if (!url || typeof WebSocket === 'undefined') return null
            
            const ws = new WebSocket(url)
            const queue = []
            let timer = null
            
            const flush = () => {
                if (timer) clearTimeout(timer)
                if (queue.length && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'batch', ops: queue }))
                    queue.length = 0
                }
                timer = null
            }
            
            ws.onopen = () => {
                // Send handshake
                ws.send(JSON.stringify({ 
                    type: 'handshake', 
                    pid: config.processId,
                    clock: clockGet() 
                }))
            }
            
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data)
                    if (msg.type === 'batch') {
                        sync.import({ ops: msg.ops })
                    } else if (msg.type === 'sync') {
                        sync.import(msg)
                    }
                } catch (err) {
                    console.error('Sync error:', err)
                }
            }
            
            const unsubscribe = onJournal(op => {
                queue.push(op)
                if (!timer) timer = setTimeout(flush, config.batchDelay)
            })
            
            return () => {
                flush()
                unsubscribe()
                ws.close()
            }
        }
    }
    
    // ==================== JOURNAL HELPERS ====================
    const onJournal = (cb) => {
        journalListeners.add(cb)
        return () => journalListeners.delete(cb)
    }
    
    const queryJournal = (filter = {}) => {
        let ids = null
        
        if (filter.pid) {
            ids = journalIdx.byProc.get(filter.pid)
        }
        if (filter.type) {
            const typeIds = journalIdx.byType.get(filter.type)
            if (!ids) ids = typeIds
            else if (typeIds) ids = new Set([...ids].filter(x => typeIds.has(x)))
        }
        if (filter.since) {
            const timeIds = new Set()
            for (const [ts, id] of journalIdx.byTime) {
                if (ts > filter.since) timeIds.add(id)
            }
            if (!ids) ids = timeIds
            else ids = new Set([...ids].filter(x => timeIds.has(x)))
        }
        
        if (!ids) return []
        
        const result = []
        for (const id of ids) {
            const op = journal.get(id)
            if (op && (!filter.before || op.ts < filter.before)) {
                result.push(op)
            }
        }
        return result.sort((a,b) => a.ts - b.ts)
    }
    
    // ==================== CHECKPOINT (FIXED) ====================
    const checkpoint = () => {
        // Get snapshot from base store using correct internal structure
        const items = []
        
        // Access type indexes correctly - in tinyset.js v2.3s, indexes.type is a Map of type -> Set of ids
        if (store._debug && store._debug.indexes && store._debug.indexes.type) {
            for (const [type, ids] of store._debug.indexes.type) {
                for (const id of ids) {
                    const item = store.get(id)
                    if (item) items.push([id, { ...item }]) // Shallow copy
                }
            }
        } else {
            // Fallback: iterate through all items
            for (const [id, item] of store._debug?.items || []) {
                if (item) items.push([id, { ...item }])
            }
        }
        
        const cp = record('checkpoint', { 
            snapshot: items,
            size: items.length 
        })
        
        // Prune journal - keep only after checkpoint
        const toDelete = []
        for (const [ts, id] of journalIdx.byTime) {
            if (ts < cp.ts) toDelete.push([ts, id])
        }
        
        for (const [ts, id] of toDelete) {
            const op = journal.get(id)
            journal.delete(id)
            journalIdx.byTime.delete(ts)
            if (op) {
                journalIdx.byProc.get(op.pid)?.delete(id)
                journalIdx.byType.get(op.type)?.delete(id)
            }
        }
        
        return cp
    }
    
    // ==================== MERGE RESOLUTION (FIXED) ====================
    const merge = (remoteStore, strategy = 'ours') => {
        const remote = remoteStore._debug || remoteStore
        
        if (strategy === 'theirs') {
            // Clear and replace with remote
            store.clear()
            
            // Get items from remote correctly
            if (remote.indexes && remote.indexes.type) {
                for (const [type, ids] of remote.indexes.type) {
                    for (const id of ids) {
                        const item = remoteStore.get(id)
                        if (item) store.set(id, item)
                    }
                }
            }
            return { merged: store._debug?.items?.size || 0, conflicts: 0 }
        }
        
        // Merge items with conflict resolution
        let merged = 0, conflicts = 0
        
        // Get local items
        const localItems = new Map()
        if (store._debug && store._debug.items) {
            for (const [id, item] of store._debug.items) {
                localItems.set(id, item)
            }
        }
        
        // Get remote items
        const remoteItems = new Map()
        if (remote.items) {
            for (const [id, item] of remote.items) {
                remoteItems.set(id, item)
            }
        } else if (remote.indexes && remote.indexes.type) {
            for (const [type, ids] of remote.indexes.type) {
                for (const id of ids) {
                    const item = remoteStore.get(id)
                    if (item) remoteItems.set(id, item)
                }
            }
        }
        
        for (const [id, remoteItem] of remoteItems) {
            const localItem = localItems.get(id)
            
            if (!localItem) {
                // New item from remote
                store.set(id, remoteItem)
                merged++
            } else if (strategy === 'timestamp') {
                // Use newest by modified timestamp
                const localMod = localItem.modified || 0
                const remoteMod = remoteItem.modified || 0
                if (remoteMod > localMod) {
                    store.set(id, remoteItem)
                    merged++
                } else if (remoteMod < localMod) {
                    conflicts++
                }
            } else if (strategy === 'vector') {
                // Use vector clock to resolve
                const localClock = localItem._clock || {}
                const remoteClock = remoteItem._clock || {}
                
                // Compare clocks
                let localWins = false, remoteWins = false
                for (const pid in {...localClock, ...remoteClock}) {
                    const lv = localClock[pid] || 0
                    const rv = remoteClock[pid] || 0
                    if (lv > rv) localWins = true
                    if (rv > lv) remoteWins = true
                }
                
                if (remoteWins && !localWins) {
                    store.set(id, remoteItem)
                    merged++
                } else if (localWins && remoteWins) {
                    // Concurrent modification - merge fields
                    const mergedItem = {...localItem, ...remoteItem}
                    mergedItem._clock = {...localClock, ...remoteClock}
                    store.set(id, mergedItem)
                    conflicts++
                }
            }
        }
        
        return { merged, conflicts }
    }
    
    // ==================== API ====================
    return Object.assign(store, {
        // Core extensions
        create: store.create,
        set: store.set,
        update: store.update,
        delete: store.delete,
        
        // Distributed features
        sync,
        journal: {
            on: onJournal,
            query: queryJournal,
            list: () => [...journal.values()].sort((a,b) => b.ts - a.ts),
            size: () => journal.size,
            clear: () => {
                journal.clear()
                journalIdx.byTime.clear()
                journalIdx.byProc.clear()
                journalIdx.byType.clear()
            }
        },
        
        // Vector clock
        clock: {
            get: clockGet,
            merge: clockMerge,
            increment: clockInc,
            current: () => clocks.get(config.processId)
        },
        
        // Operations
        AffineOp,
        
        // Merge utilities
        merge,
        checkpoint,
        
        // Config
        config: () => ({...config}),
        
        // Debug (matching tinyset.js style)
        _debug: {
            ...store._debug,
            journal,
            clocks,
            indexes: journalIdx
        }
    })
}
