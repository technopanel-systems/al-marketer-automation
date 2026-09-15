// In-process events so the Control Center can show progress live: step states and activity lines.
import { EventEmitter } from 'node:events';
import { basename } from 'node:path';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

export const emitState = (p, stepId) => bus.emit('state', { slug: basename(p.dir), step: stepId, at: Date.now() });
export const emitLog = (p, line) => bus.emit('log', { slug: basename(p.dir), line, at: Date.now() });
