export type AriOutputFormat = 'note' | 'pdf' | 'jpg';

export interface AriExportInput {
  title: string;
  body: string;
  preparedFor?: string;
}

type TextBlock = {
  kind: 'heading' | 'paragraph' | 'bullet' | 'quote' | 'rule';
  text: string;
  level?: number;
};

const COLORS = {
  bone: '#f7f3eb',
  ink: '#111a2a',
  muted: '#667085',
  blue: '#168eea',
  paleBlue: '#e8f3fc',
  rule: '#d6dde7',
  white: '#ffffff',
};

function cleanInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[✅✔☑]/g, 'YES -')
    .replace(/[❌✖]/g, 'NO -')
    .replace(/⚠️?/g, 'NOTE -')
    .replace(/[—–−]/g, '-')
    .replace(/[→⇒]/g, 'to')
    .replace(/[←⇐]/g, 'from')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s*·\s*/g, ' | ')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMarkdown(body: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const rows = body.replace(/\r/g, '').split('\n');
  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index];
    const line = raw.trim();
    if (!line) continue;
    if (/^---+$/.test(line)) { blocks.push({ kind: 'rule', text: '' }); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { blocks.push({ kind: 'heading', level: heading[1].length, text: cleanInline(heading[2]) }); continue; }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) { blocks.push({ kind: 'bullet', text: cleanInline(bullet[1]) }); continue; }
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) { blocks.push({ kind: 'bullet', text: cleanInline(line) }); continue; }
    if (line.startsWith('>')) { blocks.push({ kind: 'quote', text: cleanInline(line.slice(1)) }); continue; }
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableRows: string[][] = [];
      while (index < rows.length) {
        const tableLine = rows[index].trim();
        if (!tableLine.startsWith('|') || !tableLine.endsWith('|')) break;
        const cells = tableLine.slice(1, -1).split('|').map(cleanInline);
        if (!cells.every(cell => /^:?-{2,}:?$/.test(cell))) tableRows.push(cells);
        index += 1;
      }
      index -= 1;
      const headers = tableRows.shift() ?? [];
      for (const cells of tableRows) {
        const label = cells[0] || headers[0] || 'Detail';
        if (headers.length <= 2) {
          blocks.push({ kind: 'paragraph', text: `${label}: ${cells[1] ?? ''}` });
        } else {
          blocks.push({ kind: 'heading', level: 4, text: label });
          cells.slice(1).forEach((cell, cellIndex) => {
            if (cell) blocks.push({ kind: 'bullet', text: `${headers[cellIndex + 1] || `Option ${cellIndex + 1}`}: ${cell}` });
          });
        }
      }
      continue;
    }
    blocks.push({ kind: 'paragraph', text: cleanInline(line) });
  }
  return blocks;
}

function safeFileName(value: string): string {
  return (value || 'ari-deliverable')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || 'ari-deliverable';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportPdf(input: AriExportInput) {
  const { jsPDF } = await import('jspdf');
  // Keep compression off: repeated header/footer vector instructions render
  // more consistently across Chrome, Preview, Acrobat, and Poppler this way.
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: false });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  const blocks = parseMarkdown(input.body);
  let page = 1;
  let y = 138;

  const drawHeader = (continued = false) => {
    doc.setFillColor(COLORS.bone);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(COLORS.ink);
    doc.rect(0, 0, pageWidth, 72, 'F');
    doc.setFillColor(COLORS.blue);
    doc.roundedRect(margin, 22, 28, 28, 7, 7, 'F');
    doc.setTextColor(COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('360', margin + 5, 40);
    doc.setFontSize(15);
    doc.text('SPAS', margin + 40, 40);
    doc.setTextColor(22, 142, 234);
    doc.text('360', margin + 82, 40);
    doc.setTextColor(190, 202, 218);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(continued ? 'ARI SALES DELIVERABLE · CONTINUED' : 'ARI SALES DELIVERABLE', pageWidth - margin, 39, { align: 'right' });

    if (!continued) {
      doc.setTextColor(COLORS.ink);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      const titleLines = doc.splitTextToSize(cleanInline(input.title), contentWidth);
      doc.text(titleLines, margin, 108);
      y = 108 + titleLines.length * 25 + 12;
      doc.setTextColor(COLORS.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const meta = [input.preparedFor ? `Prepared for ${input.preparedFor}` : null, new Date().toLocaleDateString()].filter(Boolean).join('  ·  ');
      doc.text(meta, margin, y);
      y += 24;
    } else {
      y = 98;
    }
  };

  const ensureRoom = (needed: number) => {
    if (y + needed <= pageHeight - 62) return;
    doc.addPage();
    page += 1;
    drawHeader(true);
  };

  drawHeader();
  for (const block of blocks) {
    if (block.kind === 'rule') {
      ensureRoom(20);
      doc.setDrawColor(COLORS.rule);
      doc.line(margin, y + 5, pageWidth - margin, y + 5);
      y += 18;
      continue;
    }

    const isHeading = block.kind === 'heading';
    const fontSize = isHeading ? (block.level === 1 ? 15 : 12) : 10.5;
    const lineHeight = isHeading ? fontSize * 1.35 : 15;
    const indent = block.kind === 'bullet' || block.kind === 'quote' ? 18 : 0;
    doc.setFont('helvetica', isHeading ? 'bold' : block.kind === 'quote' ? 'italic' : 'normal');
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(block.text, contentWidth - indent);
    const needed = lines.length * lineHeight + (isHeading ? 13 : 8);
    ensureRoom(needed);

    if (block.kind === 'quote') {
      doc.setFillColor(COLORS.paleBlue);
      doc.roundedRect(margin, y - 8, contentWidth, needed, 5, 5, 'F');
      doc.setFillColor(COLORS.blue);
      doc.rect(margin, y - 8, 3, needed, 'F');
    }
    if (block.kind === 'bullet') {
      doc.setFillColor(COLORS.blue);
      doc.circle(margin + 4, y - 3, 2.3, 'F');
    }

    doc.setTextColor(isHeading ? COLORS.ink : block.kind === 'quote' ? '#30445f' : '#263548');
    doc.text(lines, margin + indent, y);
    y += needed;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(COLORS.rule);
    doc.line(margin, pageHeight - 42, pageWidth - margin, pageHeight - 42);
    doc.setTextColor(COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Magic City Home Leisure · Minot (701) 839-5806 · Bismarck (701) 255-7722', margin, pageHeight - 25);
    doc.text(`Page ${i}`, pageWidth - margin, pageHeight - 25, { align: 'right' });
  }

  doc.save(`${safeFileName(input.title)}-ari.pdf`);
}

function wrappedCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

async function exportJpg(input: AriExportInput) {
  const width = 1440;
  const margin = 110;
  const contentWidth = width - margin * 2;
  const blocks = parseMarkdown(input.body);
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('This browser cannot render a JPG.');

  const layouts = blocks.map(block => {
    const heading = block.kind === 'heading';
    const size = heading ? (block.level === 1 ? 38 : 30) : 24;
    const weight = heading ? '700' : block.kind === 'quote' ? 'italic 500' : '400';
    measure.font = `${weight} ${size}px Arial, sans-serif`;
    const indent = block.kind === 'bullet' || block.kind === 'quote' ? 42 : 0;
    const lines = block.kind === 'rule' ? [] : wrappedCanvasLines(measure, block.text, contentWidth - indent);
    const lineHeight = heading ? Math.round(size * 1.28) : 36;
    const height = block.kind === 'rule' ? 34 : lines.length * lineHeight + (heading ? 26 : 18);
    return { block, size, weight, indent, lines, lineHeight, height };
  });

  measure.font = '700 48px Arial, sans-serif';
  const titleLines = wrappedCanvasLines(measure, cleanInline(input.title), contentWidth);
  const bodyHeight = layouts.reduce((sum, item) => sum + item.height, 0);
  const height = Math.min(30000, 250 + titleLines.length * 62 + bodyHeight + 150);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot render a JPG.');

  ctx.fillStyle = COLORS.bone;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, width, 150);
  ctx.fillStyle = COLORS.blue;
  ctx.beginPath();
  ctx.roundRect(margin, 48, 54, 54, 12);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = '700 19px Arial, sans-serif';
  ctx.fillText('360', margin + 9, 82);
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText('SPAS', margin + 76, 84);
  ctx.fillStyle = COLORS.blue;
  ctx.fillText('360', margin + 160, 84);
  ctx.fillStyle = '#becada';
  ctx.font = '400 16px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('ARI SALES DELIVERABLE', width - margin, 80);
  ctx.textAlign = 'left';

  let y = 220;
  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 48px Arial, sans-serif';
  for (const line of titleLines) { ctx.fillText(line, margin, y); y += 62; }
  ctx.fillStyle = COLORS.muted;
  ctx.font = '400 18px Arial, sans-serif';
  const meta = [input.preparedFor ? `Prepared for ${input.preparedFor}` : null, new Date().toLocaleDateString()].filter(Boolean).join('  ·  ');
  ctx.fillText(meta, margin, y + 4);
  y += 62;

  for (const item of layouts) {
    if (item.block.kind === 'rule') {
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(margin, y + 8); ctx.lineTo(width - margin, y + 8); ctx.stroke();
      y += item.height;
      continue;
    }
    if (item.block.kind === 'quote') {
      ctx.fillStyle = COLORS.paleBlue;
      ctx.beginPath(); ctx.roundRect(margin, y - 24, contentWidth, item.height, 12); ctx.fill();
      ctx.fillStyle = COLORS.blue;
      ctx.fillRect(margin, y - 24, 7, item.height);
    }
    if (item.block.kind === 'bullet') {
      ctx.fillStyle = COLORS.blue;
      ctx.beginPath(); ctx.arc(margin + 8, y - 7, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = `${item.weight} ${item.size}px Arial, sans-serif`;
    ctx.fillStyle = item.block.kind === 'heading' ? COLORS.ink : item.block.kind === 'quote' ? '#30445f' : '#263548';
    for (const line of item.lines) { ctx.fillText(line, margin + item.indent, y); y += item.lineHeight; }
    y += item.block.kind === 'heading' ? 26 : 18;
  }

  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(margin, height - 90); ctx.lineTo(width - margin, height - 90); ctx.stroke();
  ctx.fillStyle = COLORS.muted;
  ctx.font = '400 16px Arial, sans-serif';
  ctx.fillText('Magic City Home Leisure · Minot (701) 839-5806 · Bismarck (701) 255-7722', margin, height - 52);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('JPG rendering failed.');
  downloadBlob(blob, `${safeFileName(input.title)}-ari.jpg`);
}

export async function exportAriDeliverable(format: Exclude<AriOutputFormat, 'note'>, input: AriExportInput) {
  if (format === 'pdf') return exportPdf(input);
  return exportJpg(input);
}
