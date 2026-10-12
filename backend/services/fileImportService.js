const path = require('path');
const pdfParseModule = require('pdf-parse');
const mammoth = require('mammoth');
const yauzl = require('yauzl');
const axios = require('axios');
const cheerio = require('cheerio');
const xlsx = require('xlsx');
const ocrService = require('./ocrService');

async function parseUploadedFile(file) {
  if (!file) {
    const error = new Error('file is required');
    error.status = 400;
    throw error;
  }

  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';
  const title = cleanTitle(path.basename(file.originalname || '未命名文件', ext));

  if (isPlainText(ext, mime)) {
    const content = file.buffer.toString('utf8');
    return normalizeResult({
      title,
      type: ext.replace('.', '') || 'text',
      origin: file.originalname,
      content,
      sections: textSections(content, '段落')
    });
  }

  if (ext === '.pdf' || mime.includes('pdf')) {
    const parsed = await parsePdfBuffer(file.buffer);
    return normalizeResult({
      title,
      type: 'pdf',
      origin: file.originalname,
      content: parsed.text || '',
      sections: pdfSections(parsed.text || ''),
      meta: { pages: parsed.numpages || 0 }
    });
  }

  if (ext === '.docx') {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return normalizeResult({
      title,
      type: 'docx',
      origin: file.originalname,
      content: parsed.value || '',
      sections: textSections(parsed.value || '', '段落')
    });
  }

  if (ext === '.pptx') {
    const slides = await extractPptxText(file.buffer);
    const content = slides.map(slide => `Slide ${slide.index}\n${slide.text}`).join('\n\n');
    return normalizeResult({
      title,
      type: 'pptx',
      origin: file.originalname,
      content,
      sections: slides.map(slide => ({ label: `Slide ${slide.index}`, text: slide.text }))
    });
  }

  if (ext === '.epub' || mime.includes('epub')) {
    const parsed = await extractEpubText(file.buffer);
    return normalizeResult({
      title,
      type: 'epub',
      origin: file.originalname,
      content: parsed.content,
      sections: parsed.sections,
      meta: { documents: parsed.sections.length }
    });
  }

  if (ext === '.xlsx' || ext === '.xls' || mime.includes('spreadsheet')) {
    const parsed = parseWorkbook(file.buffer);
    return normalizeResult({
      title,
      type: 'xlsx',
      origin: file.originalname,
      content: parsed.content,
      sections: parsed.sections,
      meta: { sheets: parsed.sheetNames }
    });
  }

  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext)) {
    const dataUrl = `data:${mime || 'image/png'};base64,${file.buffer.toString('base64')}`;
    let result;
    try {
      result = await ocrService.recognizeText(dataUrl);
    } catch (ocrError) {
      const error = new Error(`图片 OCR 识别失败：${ocrError.message || '请换一张更清晰的图片，或先粘贴识别后的文字。'}`);
      error.status = 502;
      throw error;
    }
    return normalizeResult({
      title,
      type: 'image',
      origin: file.originalname,
      content: result.fullText || '',
      sections: textSections(result.fullText || '', 'OCR 片段'),
      meta: { service: result.service, confidence: result.confidence }
    });
  }

  if (['.doc', '.ppt'].includes(ext)) {
    const error = new Error(`暂不支持旧版 ${ext} 文件，请在 Office/WPS 中另存为 ${ext}x 后再上传。`);
    error.status = 415;
    throw error;
  }

  if (isAudio(ext, mime)) {
    const error = new Error('音频文件需要接入 ASR 转写服务后才能作为 Source 读取。你可以先上传音频转写文本。');
    error.status = 422;
    throw error;
  }

  const error = new Error(`暂不支持这种文件类型：${ext || mime || '未知类型'}。建议上传 PDF、DOCX、PPTX、XLSX、TXT、Markdown、图片或网页链接。`);
  error.status = 400;
  throw error;
}

async function parsePdfBuffer(buffer) {
  if (typeof pdfParseModule === 'function') {
    return pdfParseModule(buffer);
  }

  if (typeof pdfParseModule.PDFParse === 'function') {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      let pageCount = 0;
      try {
        const info = typeof parser.getInfo === 'function' ? await parser.getInfo() : null;
        pageCount = info?.total || info?.pages || info?.info?.Pages || 0;
      } catch {}
      return {
        text: textResult?.text || '',
        numpages: pageCount
      };
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  }

  const error = new Error('PDF 解析器不可用：当前 pdf-parse 版本没有暴露可用的解析 API。');
  error.status = 500;
  throw error;
}

async function importWebPage(url) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    const error = new Error('valid http(s) url is required');
    error.status = 400;
    throw error;
  }

  if (isYouTubeUrl(target)) {
    return importYouTubeVideo(target);
  }

  const response = await axios.get(target, {
    timeout: 15000,
    maxContentLength: 5 * 1024 * 1024,
    headers: { 'User-Agent': 'XuebanAI-Notebook/1.0' }
  });
  const $ = cheerio.load(response.data || '');
  $('script, style, nav, footer, header, noscript, svg').remove();
  const title = cleanTitle(($('title').first().text() || target).trim());
  const sections = structuredWebSections($);
  const content = sections.map(section => `${section.label}\n${section.text}`).join('\n\n') ||
    $('article').text().trim() ||
    $('main').text().trim() ||
    $('body').text().trim();

  return normalizeResult({
    title,
    type: 'web',
    origin: target,
    content,
    sections: sections.length ? sections : textSections(content, '段落')
  });
}

async function importYouTubeVideo(url) {
  const videoId = getYouTubeId(url);
  let title = `YouTube ${videoId || '视频'}`;
  let author = '';
  let transcript = '';
  let transcriptMeta = null;

  try {
    const meta = await axios.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { timeout: 8000 });
    title = cleanTitle(meta.data?.title || title);
    author = meta.data?.author_name || '';
  } catch {}

  try {
    const transcriptResult = await fetchYouTubeTranscript(url);
    transcript = transcriptResult.text;
    transcriptMeta = transcriptResult.meta;
  } catch {}

  const fallback = [
    `标题：${title}`,
    author ? `频道：${author}` : '',
    `链接：${url}`,
    '',
    '未找到公开视频字幕。请粘贴字幕、课程讲稿或音频转写文本后再进行资料级问答。'
  ].filter(Boolean).join('\n');

  return normalizeResult({
    title,
    type: 'youtube',
    origin: url,
    content: transcript || fallback,
    sections: transcript
      ? textSections(transcript, '字幕片段')
      : [{ label: '视频信息', text: fallback }],
    meta: {
      videoId,
      author,
      transcriptLanguage: transcriptMeta?.languageCode || '',
      needsTranscript: !transcript
    }
  });
}

async function fetchYouTubeTranscript(url) {
  const page = await axios.get(url, {
    timeout: 12000,
    headers: { 'User-Agent': 'Mozilla/5.0 XuebanAI-Notebook/1.0' }
  });
  const tracks = extractCaptionTracks(page.data || '');
  if (!tracks.length) throw new Error('caption tracks not found');
  const preferred = tracks.find(track => /^zh/i.test(track.languageCode)) ||
    tracks.find(track => /^en/i.test(track.languageCode)) ||
    tracks[0];
  const transcriptUrl = preferred.baseUrl.includes('fmt=')
    ? preferred.baseUrl
    : `${preferred.baseUrl}&fmt=json3`;
  const response = await axios.get(transcriptUrl, { timeout: 12000 });
  const text = parseTranscript(response.data);
  if (!text) throw new Error('empty transcript');
  return { text, meta: preferred };
}

function extractCaptionTracks(html) {
  const marker = '"captionTracks":';
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const arrayStart = html.indexOf('[', start);
  if (arrayStart === -1) return [];
  const arrayText = readJsonArray(html, arrayStart);
  if (!arrayText) return [];
  try {
    return JSON.parse(arrayText);
  } catch {
    return [];
  }
}

function readJsonArray(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return '';
}

function parseTranscript(data) {
  if (typeof data === 'object' && data.events) {
    return data.events
      .flatMap(event => event.segs || [])
      .map(seg => seg.utf8 || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const xml = String(data || '');
  const $ = cheerio.load(xml, { xmlMode: true });
  const lines = [];
  $('text').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
  });
  return lines.join('\n').trim();
}

function parseWorkbook(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sections = [];
  workbook.SheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    const text = rows
      .slice(0, 300)
      .map(row => row.map(value => String(value).trim()).filter(Boolean).join(' | '))
      .filter(Boolean)
      .join('\n');
    if (text) sections.push({ label: `工作表：${name}`, text });
  });
  return {
    sheetNames: workbook.SheetNames,
    sections,
    content: sections.map(section => `${section.label}\n${section.text}`).join('\n\n')
  };
}

function structuredWebSections($) {
  const root = $('article').length ? $('article').first() : $('main').length ? $('main').first() : $('body').first();
  const sections = [];
  let current = { label: '网页正文', text: '' };
  root.find('h1,h2,h3,p,li,table').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (/h[1-3]/.test(tag)) {
      if (current.text.trim()) sections.push(current);
      current = { label: text.slice(0, 60), text: '' };
      return;
    }
    current.text += `${text}\n`;
  });
  if (current.text.trim()) sections.push(current);
  return sections.slice(0, 120).map((section, index) => ({
    label: section.label || `网页段落 ${index + 1}`,
    text: section.text.trim()
  }));
}

function isPlainText(ext, mime) {
  return ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.srt', '.vtt'].includes(ext) || mime.startsWith('text/');
}

function isAudio(ext, mime) {
  return ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].includes(ext) || mime.startsWith('audio/');
}

function isYouTubeUrl(url) {
  return /(^https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

function getYouTubeId(url) {
  const text = String(url || '');
  const short = text.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (short) return short[1];
  const watch = text.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watch) return watch[1];
  const embed = text.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
  return embed ? embed[1] : '';
}

function extractPptxText(buffer) {
  return new Promise((resolve, reject) => {
    const slides = [];
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error) return reject(error);
      zipfile.readEntry();
      zipfile.on('entry', entry => {
        if (/ppt\/slides\/slide\d+\.xml$/.test(entry.fileName)) {
          zipfile.openReadStream(entry, (streamError, stream) => {
            if (streamError) return reject(streamError);
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => {
              slides.push({ name: entry.fileName, text: xmlToText(Buffer.concat(chunks).toString('utf8')) });
              zipfile.readEntry();
            });
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on('end', () => {
        slides.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        resolve(slides.map((slide, index) => ({ index: index + 1, text: slide.text })));
      });
      zipfile.on('error', reject);
    });
  });
}

function extractEpubText(buffer) {
  return new Promise((resolve, reject) => {
    const sections = [];
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error) return reject(error);
      zipfile.readEntry();
      zipfile.on('entry', entry => {
        const isDocument = /\.(xhtml|html|htm)$/i.test(entry.fileName) && !/META-INF/i.test(entry.fileName);
        if (!isDocument || sections.length >= 120) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', () => {
            const html = Buffer.concat(chunks).toString('utf8');
            const $ = cheerio.load(html);
            $('script, style, nav, footer, header, svg').remove();
            const text = $('body').text().replace(/\s+/g, ' ').trim();
            if (text) {
              sections.push({
                label: $('h1,h2,title').first().text().replace(/\s+/g, ' ').trim().slice(0, 80) || entry.fileName.split('/').pop(),
                text
              });
            }
            zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => {
        resolve({
          sections,
          content: sections.map(section => `${section.label}\n${section.text}`).join('\n\n')
        });
      });
      zipfile.on('error', reject);
    });
  });
}

function xmlToText(xml) {
  return xml
    .replace(/<a:t[^>]*>/g, ' ')
    .replace(/<\/a:t>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeResult(result) {
  const rawContent = String(result.content || '').replace(/\u0000/g, '');
  const content = cleanPdfText(rawContent).trim();
  if (!content) {
    const error = new Error('没有读取到可用文本。如果这是扫描版 PDF，请先做 OCR；如果是图片题目，建议使用“拍照答疑”；也可以手动粘贴文字。');
    error.status = 422;
    throw error;
  }
  const sections = Array.isArray(result.sections) && result.sections.length
    ? result.sections.map(s => ({ ...s, text: cleanPdfText(s.text || '') })).filter(s => s.text.trim())
    : textSections(content, '段落');
  return {
    title: result.title || '未命名资料',
    type: result.type || 'text',
    origin: result.origin || '',
    content,
    sections,
    meta: result.meta || {}
  };
}

// 清理 PDF 提取的乱码文本
function cleanPdfText(text) {
  if (!text) return '';
  return String(text)
    // 移除 PDF 提取产生的私用区字符和特殊控制符
    .replace(/[\uE000-\uF8FF\uFFF0-\uFFFF\uFEFF]/g, '')
    // 移除其他不可见控制字符（保留换行 \n、回车 \r）
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    // 移除替换字符
    .replace(/\uFFFD/g, '')
    // 移除 PPT 转换 PDF 的幻灯片标记：-- 1 of 30 --
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, '\n')
    // 合并多余的制表符（PDF 公式部分常有大量 tab）
    .replace(/\t{2,}/g, ' ')
    // 合并连续空格
    .replace(/ {3,}/g, ' ')
    // 清理每行首尾空白
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // 合并 3 个以上的换行为 2 个
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textSections(content, labelPrefix) {
  return String(content || '')
    .split(/\n{2,}|(?<=[。！？.!?])\s+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 220)
    .map((text, index) => ({ label: `${labelPrefix} ${index + 1}`, text }));
}

function pdfSections(content) {
  const pages = String(content || '').split(/\f/g).map(item => item.trim()).filter(Boolean);
  if (pages.length > 1) {
    // 有分页信息：按页分割，每页内再按段落细分
    const sections = [];
    pages.forEach((pageText, pageIndex) => {
      const paragraphs = pageText.split(/\n{2,}|(?<=[。！？.!?])\s+/)
        .map(item => item.trim())
        .filter(Boolean);
      if (paragraphs.length <= 1) {
        sections.push({ label: `第 ${pageIndex + 1} 页`, text: pageText });
      } else {
        paragraphs.forEach((para, paraIndex) => {
          sections.push({ label: `第 ${pageIndex + 1} 页 · 段落 ${paraIndex + 1}`, text: para });
        });
      }
    });
    return sections.slice(0, 220);
  }
  return textSections(content, '段落');
}

function cleanTitle(title) {
  return String(title || '未命名资料').replace(/\s+/g, ' ').trim().slice(0, 120);
}

module.exports = {
  parseUploadedFile,
  importWebPage
};
