import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { broadcastBrowserMedia, openBrowserMediaStream } from '../../../dev/wallpaper/browserMediaStream';

// test/unit/wallpaper/browserMediaStream.test.ts — immediate delivery, bounded connections and disconnected-reader cleanup.
const readers: EventEmitter[] = [];
function reader() {
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableLength: 0, writeHead: vi.fn().mockReturnThis(),
    end: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), destroy: vi.fn() });
  res.destroy.mockImplementation(() => { res.destroyed = true; res.emit('close'); });
  readers.push(res);
  return res;
}
const open = (res: ReturnType<typeof reader>, snapshot: () => unknown) => openBrowserMediaStream({ method: 'GET' } as IncomingMessage, res as unknown as ServerResponse, snapshot);
afterEach(() => { readers.splice(0).forEach(res => res.emit('close')); vi.useRealTimers(); });
describe('timeline event stream', () => {
  it('pushes new progress immediately and sends expiry heartbeats without waiting for a new song', () => {
    vi.useFakeTimers(); const res = reader(); let position = 10;
    open(res, () => ({ position })); expect(res.write).toHaveBeenCalledWith('data: {"position":10}\n\n');
    res.write.mockClear(); position = 165; broadcastBrowserMedia();
    expect(res.write).toHaveBeenCalledOnce(); expect(res.write).toHaveBeenCalledWith('data: {"position":165}\n\n');
    vi.advanceTimersByTime(1000); expect(res.write).toHaveBeenCalledTimes(2);
    res.emit('close'); vi.advanceTimersByTime(5000); broadcastBrowserMedia(); expect(res.write).toHaveBeenCalledTimes(2);
  });
  it('limits clients and releases the slot after disconnect', () => {
    for (let i = 0; i < 8; i++) open(reader(), () => ({}));
    const denied = reader(); open(denied, () => ({})); expect(denied.writeHead).toHaveBeenCalledWith(429);
    readers[0].emit('close'); const next = reader(); open(next, () => ({})); expect(next.write).toHaveBeenCalledOnce();
  });
  it('drops a blocked reader rather than accumulating packets', () => {
    const res = reader(); open(res, () => ({})); res.writableLength = 65537;
    broadcastBrowserMedia(); expect(res.destroy).toHaveBeenCalledOnce();
    broadcastBrowserMedia(); expect(res.destroy).toHaveBeenCalledOnce();
  });
});
