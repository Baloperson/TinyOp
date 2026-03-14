// tinyset.plus.js - Distributed extension
import { createStore as createBaseStore } from './tinyset.js'

export function createStore(options = {}) {
    const store = createBaseStore(options)
    
    // ==================== VECTOR CLOCK ====================
    const vectorClock = new Map([[options.processId || 'process-1', 0]])
    const journal = []
    const journalListeners = new Set()
    
    function incrementClock() {
        vectorClock.set(config.processId, (vectorClock.get(config.processId) || 0) + 1)
    }
    
    function snapshotClock() {
        const clock = {}
        for (const [pid, time] of vectorClock.entries()) {
            clock[pid] = time
        }
        return clock
    }
    
    function mergeClock(clock) {
        for (const [pid, time] of Object.entries(clock || {})) {
            vectorClock.set(pid, Math.max(vectorClock.get(pid) || 0, time))
        }
    }
    
    // ==================== AFFINE OPERATIONS ====================
    
    class AffineOp {
        constructor(scale = 1, shift = 0) {
            this.scale = scale
            this.shift = shift
        }
        
        compose(other) {
            return new AffineOp(
                this.scale * other.scale,
                this.scale * other.shift + this.shift
            )
        }
        
        apply(x) {
            return this.scale * x + this.shift
        }
    }
    
    // ==================== JOURNAL ====================
    
    function recordOperation(type, data) {
        incrementClock()
        
        const operation = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            processId: options.processId,
            vectorClock: snapshotClock(),
            type,
            data: JSON.parse(JSON.stringify(data)),
            timestamp: Date.now()
        }
        
        journal.push(operation)
        
        journalListeners.forEach(cb => {
            try { cb(operation) } catch (e) { console.error(e) }
        })
        
        return operation
    }
    
    // Override core methods to record operations
    const originalCreate = store.create
    const originalSet = store.set
    const originalRemove = store.remove
    
    store.create = function(spec, props = {}) {
        const result = originalCreate.call(this, spec, props)
        if (!Array.isArray(spec)) {
            recordOperation('create', { id: result.id, item: { ...result } })
        }
        return result
    }
    
    store.set = function(target, propOrProps, value, options = {}) {
        const result = originalSet.call(this, target, propOrProps, value, options)
        if (typeof target === 'string' && !Array.isArray(target)) {
            const item = this.get(target)
            if (item) {
                recordOperation('update', { 
                    id: target, 
                    changes: typeof propOrProps === 'string' 
                        ? { [propOrProps]: value } 
                        : propOrProps 
                })
            }
        }
        return result
    }
    
    store.remove = function(target, options = {}) {
        const result = originalRemove.call(this, target, options)
        if (typeof target === 'string' && !Array.isArray(target)) {
            recordOperation('delete', { id: target })
        }
        return result
    }
    
    // ==================== SYNC API ====================
    
    function exportLog(since = 0, filter = {}) {
        const operations = journal.filter(op => 
            op.timestamp > since && 
            (!filter.processId || op.processId === filter.processId)
        )
        
        return {
            operations,
            vectorClock: snapshotClock(),
            lastTimestamp: Date.now(),
            processId: options.processId
        }
    }
    
    function importLog(log, options = {}) {
        const strategy = options.strategy || 'merge'
        
        mergeClock(log.vectorClock)
        
        const sortedOps = [...(log.operations || [])].sort((a, b) => {
            // Sort by causal order
            for (const pid of new Set([...Object.keys(a.vectorClock || {}), ...Object.keys(b.vectorClock || {})])) {
                const aVal = a.vectorClock?.[pid] || 0
                const bVal = b.vectorClock?.[pid] || 0
                if (aVal < bVal) return -1
                if (aVal > bVal) return 1
            }
            return 0
        })
        
        let applied = 0
        for (const op of sortedOps) {
            const localTime = vectorClock.get(op.processId) || 0
            const opTime = op.vectorClock?.[op.processId] || 0
            
            if (opTime <= localTime && strategy !== 'force') {
                continue
            }
            
            // Apply operation
            switch (op.type) {
                case 'create':
                    if (!store._debug.items.has(op.data.id)) {
                        store._debug.items.set(op.data.id, op.data.item)
                    }
                    break
                case 'update':
                    const item = store._debug.items.get(op.data.id)
                    if (item) {
                        Object.assign(item, op.data.changes)
                    }
                    break
                case 'delete':
                    store._debug.items.delete(op.data.id)
                    break
            }
            
            applied++
            mergeClock(op.vectorClock)
        }
        
        return { applied }
    }
    
    function connect(url) {
        if (typeof WebSocket === 'undefined') {
            console.warn('WebSocket not available')
            return null
        }
        
        try {
            const ws = new WebSocket(url)
            
            ws.onopen = () => {
                const log = exportLog(0)
                ws.send(JSON.stringify({ type: 'sync', data: log }))
            }
            
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data)
                if (msg.type === 'sync') {
                    importLog(msg.data)
                }
            }
            
            const unsubscribe = onJournal((operation) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'operation', data: operation }))
                }
            })
            
            return () => {
                unsubscribe()
                ws.close()
            }
        } catch (e) {
            console.error('Connection failed:', e)
            return null
        }
    }
    
    function onJournal(callback) {
        journalListeners.add(callback)
        return () => journalListeners.delete(callback)
    }
    
    function checkpoint() {
        const snapshot = {}
        for (const [id, item] of store._debug.items.entries()) {
            snapshot[id] = JSON.parse(JSON.stringify(item))
        }
        
        const checkpointOp = {
            type: 'checkpoint',
            id: `checkpoint-${Date.now()}`,
            processId: options.processId,
            vectorClock: snapshotClock(),
            data: { snapshot },
            timestamp: Date.now()
        }
        
        journal.push(checkpointOp)
        
        // Prune journal (keep only after checkpoint)
        const checkpointIndex = journal.findIndex(op => op.id === checkpointOp.id)
        if (checkpointIndex !== -1) {
            journal.splice(0, checkpointIndex)
        }
        
        return checkpointOp
    }
    
    // ==================== EXTENDED API ====================
    
    return {
        ...store,
        AffineOp,
        exportLog,
        importLog,
        connect,
        onJournal,
        checkpoint,
        _debug: {
            ...store._debug,
            journal,
            vectorClock
        }
    }
}
