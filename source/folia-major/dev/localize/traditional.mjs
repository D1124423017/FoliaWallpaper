import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import * as OpenCC from 'opencc-js';
import { accountStrings } from './account-strings.mjs';

// dev/localize/traditional.mjs — generates the static Taiwan locale without runtime text conversion.
const root = process.cwd();
const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
const terms = [['文件夾', '資料夾'], ['隊列', '佇列'], ['信息', '資訊'], ['默認', '預設'], ['日誌', '紀錄'], ['緩存', '快取'], ['加載', '載入'], ['窗口', '視窗'], ['組件', '元件'], ['視頻', '影片'], ['賬號', '帳號'], ['賬戶', '帳戶'], ['網絡', '網路'], ['服務器', '伺服器']];
const translate = value => terms.reduce((text, [from, to]) => text.replaceAll(from, to), converter(value));
const streaming = {
    en: {
        title: 'Spotify / YouTube', description: 'Paste a public Spotify or YouTube link to load the official player inside Folia.',
        linkLabel: 'Song, playlist or video link', placeholder: 'Paste a Spotify / YouTube sharing link', load: 'Load player', close: 'Close player',
        invalidLink: 'Use an HTTPS open.spotify.com, youtube.com, music.youtube.com or youtu.be link, or a Spotify URI.',
        frameTitle: '{{provider}} official player', spotifyNote: 'Spotify controls availability and playback length. This Electron runtime may only support preview clips; full playback requires a compatible browser and account.',
        youtubeNote: 'Only videos that permit embedding can play here. Private, restricted or unavailable videos may require opening YouTube.',
        openOfficial: 'Open on the official website', empty: 'Choose a song, playlist or video to get started.', examples: 'Spotify tracks, albums, playlists and podcasts; YouTube videos, Shorts and playlists are supported.',
        controlNote: 'Use the official player controls. Closing this page stops streaming playback. Folia lyrics and local queue controls do not control these embeds.',
    },
    'zh-CN': {
        title: 'Spotify / YouTube', description: '贴上 Spotify 或 YouTube 的公开分享链接，即可在 Folia 内载入官方播放器。',
        linkLabel: '歌曲、歌单或影片链接', placeholder: '贴上 Spotify / YouTube 分享链接', load: '载入播放器', close: '关闭播放器',
        invalidLink: '请使用 HTTPS 的 open.spotify.com、youtube.com、music.youtube.com、youtu.be 链接，或 Spotify URI。',
        frameTitle: '{{provider}} 官方播放器', spotifyNote: 'Spotify 决定播放权限及长度。此 Electron 环境可能只能播放试听片段；完整播放需要兼容的浏览器及账户。',
        youtubeNote: '仅能播放允许嵌入的影片。私人、受限制或无法播放的内容，可能需要前往 YouTube 开启。',
        openOfficial: '在官方网站开启', empty: '贴上歌曲、歌单或影片链接，开始播放。', examples: '支持 Spotify 歌曲、专辑、歌单和播客，以及 YouTube 影片、Shorts 和播放清单。',
        controlNote: '请使用官方播放器的播放控制。关闭此页面会停止串流播放；Folia 的歌词动画和本地队列控制不适用于内嵌播放器。',
    },
};
streaming.in = streaming.en;
for (const locale of ['en', 'zh-CN', 'in']) {
    const file = path.join(root, 'src/i18n/locales', `${locale}.ts`);
    let text = fs.readFileSync(file, 'utf8');
    if (!text.includes('"streamingAccounts":')) text = text.replace(/export default\s*\{/, `export default {\n  "streamingAccounts": ${JSON.stringify(accountStrings[locale], null, 2)},`);
    else {
        const source = parse(text, { sourceType: 'module', plugins: ['typescript'] });
        let dictionary = source.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
        while (dictionary.type === 'TSAsExpression' || dictionary.type === 'TSSatisfiesExpression') dictionary = dictionary.expression;
        const property = dictionary.properties.find(prop => (prop.key.name ?? prop.key.value) === 'streamingAccounts');
        text = text.slice(0, property.value.start) + JSON.stringify(accountStrings[locale], null, 2) + text.slice(property.value.end);
    }
    if (!text.includes('"streaming":')) text = text.replace(/export default\s*\{/, `export default {\n  "streaming": ${JSON.stringify(streaming[locale], null, 2)},`);
    if (!text.includes('"appLanguageZhTW":')) text = text.replace(/("appLanguageZhCN":\s*"[^"\n]*",)/, `$1\n    "appLanguageZhTW": "${locale === 'zh-CN' ? '繁体中文' : locale === 'in' ? 'Tionghoa Tradisional' : 'Traditional Chinese'}",`);
    if (!text.includes('"settings-language-zh-TW":')) text = text.replace(/("settings-language-zh-CN":\s*\{[^\n]*\},)/, `$1\n      "settings-language-zh-TW": { "title": "${locale === 'zh-CN' ? '切换为繁体中文' : 'Switch language to Traditional Chinese'}", "description": "${locale === 'zh-CN' ? '界面使用繁体中文' : 'Use Traditional Chinese in the interface'}" },`);
    if (!text.includes('"streaming-player":')) text = text.replace(/("settings-language-zh-TW":)/, `"streaming-player": { "title": "Spotify / YouTube", "description": "${locale === 'zh-CN' ? '在 Folia 内播放 Spotify 或 YouTube 链接' : 'Play a Spotify or YouTube link in Folia'}" },\n      $1`);
    fs.writeFileSync(file, text);
}

// Parse only literal dictionary data; no source evaluation or rewriting of keys/placeholders.
function literal(node) {
    if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') return literal(node.expression);
    if (node.type === 'StringLiteral') return node.value;
    if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(prop => {
        if (prop.type !== 'ObjectProperty' || prop.computed) throw new Error('Non-literal locale property');
        return [prop.key.name ?? prop.key.value, literal(prop.value)];
    }));
    if (node.type === 'ArrayExpression') return node.elements.map(literal);
    if (node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') return node.value;
    if (node.type === 'NullLiteral') return null;
    throw new Error(`Unsupported dictionary syntax: ${node.type}`);
}
const cnSource = parse(fs.readFileSync(path.join(root, 'src/i18n/locales/zh-CN.ts'), 'utf8'), { sourceType: 'module', plugins: ['typescript'] });
const cn = literal(cnSource.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration);
let count = 0;
const convertTree = value => {
    if (typeof value === 'string') { count++; return translate(value); }
    if (Array.isArray(value)) return value.map(convertTree);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convertTree(item)]));
    return value;
};
const tw = convertTree(cn);
tw.options.appLanguageZhTW = '繁體中文（台灣）';
fs.writeFileSync(path.join(root, 'src/i18n/locales/zh-TW.ts'), `// src/i18n/locales/zh-TW.ts — Traditional Chinese (Taiwan) interface dictionary.\nexport default ${JSON.stringify(tw, null, 2)};\n`);

// Duplicate native locale tables with translated literal text, retaining the original comments and functions.
for (const relative of ['electron/main.cjs', 'electron/modSystem/modSystem.cjs']) {
    const file = path.join(root, relative);
    let text = fs.readFileSync(file, 'utf8');
    const source = parse(text, { sourceType: 'unambiguous' });
    const children = node => Object.values(node).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => value && typeof value === 'object' && typeof value.type === 'string');
    let localeProperty;
    let localeParent;
    const find = node => {
        if (node.type === 'ObjectExpression') {
            const property = node.properties.find(prop => prop.type === 'ObjectProperty' && prop.key.value === 'zh-CN' && prop.value.type === 'ObjectExpression');
            if (property) { localeProperty = property; localeParent = node; }
        }
        children(node).forEach(find);
    };
    find(source);
    if (!localeProperty) throw new Error(`Native locale table not found: ${relative}`);
    if (localeParent.properties.some(prop => prop.key?.value === 'zh-TW')) continue;
    const object = localeProperty.value;
    let copy = text.slice(object.start, object.end);
    const edits = [];
    const collect = node => {
        if (node.type === 'StringLiteral' || node.type === 'TemplateElement') {
            const start = node.start;
            edits.push([start - object.start, node.end - object.start, translate(text.slice(start, node.end))]);
            return;
        }
        children(node).forEach(collect);
    };
    collect(object);
    for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) copy = copy.slice(0, start) + replacement + copy.slice(end);
    const insertion = localeProperty.start;
    text = text.slice(0, insertion) + `'zh-TW': ${copy},\n  ` + text.slice(insertion);
    fs.writeFileSync(file, text);
}
console.log(JSON.stringify({ translatedInterfaceStrings: count, language: 'zh-TW' }));
