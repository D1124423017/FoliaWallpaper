import { parseLyricsByFormat } from '../../../src/utils/lyrics/parserCore';

// dev/wallpaper/lyrics/parse.ts — same parser, called in Node instead of a browser Worker.
export const parseLyricsAsync = async (...args: Parameters<typeof parseLyricsByFormat>) => parseLyricsByFormat(...args);
