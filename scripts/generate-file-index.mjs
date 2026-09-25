import fs from 'node:fs/promises';
import path from 'node:path';

const filesDir = path.resolve(process.cwd(), 'public/files');
const outputFile = path.join(filesDir, 'index.json');

async function findHtmlFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await findHtmlFiles(absolutePath, relativePath));
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      files.push({ relativePath, absolutePath });
    }
  }

  return files;
}

function decodeTitle(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

await fs.mkdir(filesDir, { recursive: true });
const htmlFiles = await findHtmlFiles(filesDir);
const index = await Promise.all(htmlFiles.map(async ({ relativePath, absolutePath }) => {
  const source = await fs.readFile(absolutePath, 'utf8');
  const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const fallbackTitle = path.basename(relativePath, path.extname(relativePath));

  return {
    path: relativePath,
    title: titleMatch ? decodeTitle(titleMatch[1]) || fallbackTitle : fallbackTitle,
  };
}));

index.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
await fs.writeFile(outputFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`Generated ${path.relative(process.cwd(), outputFile)} with ${index.length} HTML file(s).`);
