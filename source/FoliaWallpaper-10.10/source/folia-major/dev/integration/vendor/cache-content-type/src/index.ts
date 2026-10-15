import mimeTypes from 'mime-types';
import { LRU } from 'ylru';

let typeLRUCache: LRU;

export function getType(type: string): string | false {
  if (!typeLRUCache) {
    typeLRUCache = new LRU(100);
  }
  let mimeType = typeLRUCache.get<string | false>(type);
  if (mimeType === undefined) {
    mimeType = mimeTypes.contentType(type);
    typeLRUCache.set(type, mimeType);
  }
  return mimeType;
}

export default getType;
