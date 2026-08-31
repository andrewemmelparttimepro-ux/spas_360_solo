import type { ClosingRateRow, OwnersReportDeal, OwnersReportOutcome } from '@/lib/ownersReport';

export interface OwnersReportPdfPeriod {
  title: string;
  range: string;
  deals: OwnersReportDeal[];
  totalCount: number;
  totalAmount: number;
}

export interface OwnersReportPdfInput {
  generatedAt: Date;
  outcome: OwnersReportOutcome;
  store: string;
  salesperson: string;
  dateSelection: string;
  current: OwnersReportPdfPeriod;
  comparedTo?: OwnersReportPdfPeriod;
  delta?: { count: number; amount: number };
  salespersonRates: ClosingRateRow[];
  storeRates: ClosingRateRow[];
  storeNames: Map<string, string>;
  salespersonNames: Map<string, string>;
  grossSalesRanking: SalespersonGrossRankingRow[];
  duckLogoDataUrl?: string;
}

export interface SalespersonGrossRankingRow {
  id: string;
  name: string;
  deals: OwnersReportDeal[];
  wonCount: number;
  totalAmount: number;
}

const COLORS = {
  ink: '#111a2a',
  muted: '#667085',
  blue: '#168eea',
  paleBlue: '#e8f3fc',
  paleAmber: '#fff6df',
  amber: '#a46100',
  rule: '#d6dde7',
  white: '#ffffff',
  background: '#f7f3eb',
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const reportDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function cleanPdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function closedDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : reportDate.format(date);
}

function signedMoney(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${money.format(Math.abs(value))}`;
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function salespersonGrossRanking(
  deals: OwnersReportDeal[],
  salespersonNames: Map<string, string>,
): SalespersonGrossRankingRow[] {
  const grouped = new Map<string, OwnersReportDeal[]>();
  for (const deal of deals) {
    if (!deal.stage?.is_won || !deal.assigned_to) continue;
    const rows = grouped.get(deal.assigned_to) ?? [];
    rows.push(deal);
    grouped.set(deal.assigned_to, rows);
  }
  return [...grouped.entries()].map(([id, rows]) => {
    const sortedDeals = [...rows].sort((a, b) =>
      (Number(b.amount) || 0) - (Number(a.amount) || 0)
      || String(b.closed_at ?? '').localeCompare(String(a.closed_at ?? ''))
      || a.title.localeCompare(b.title));
    return {
      id,
      name: salespersonNames.get(id) ?? 'Unknown salesperson',
      deals: sortedDeals,
      wonCount: sortedDeals.length,
      totalAmount: sortedDeals.reduce((total, deal) => total + (Number(deal.amount) || 0), 0),
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount || b.wonCount - a.wonCount || a.name.localeCompare(b.name));
}

export async function buildOwnersReportPdf(input: OwnersReportPdfInput): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: false });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const footerTop = pageHeight - 42;
  let y = 132;

  const drawPageFrame = (continued = false) => {
    doc.setFillColor(COLORS.background);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(COLORS.ink);
    doc.rect(0, 0, pageWidth, 92, 'F');
    if (input.duckLogoDataUrl) doc.addImage(input.duckLogoDataUrl, 'PNG', (pageWidth - 56) / 2, 8, 56, 70, undefined, 'FAST');
    doc.setTextColor('#becada');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(continued ? 'OWNERS CORNER REPORT - CONTINUED' : 'OWNERS CORNER REPORT', pageWidth - margin, 76, { align: 'right' });
    y = 118;
  };

  const addPage = () => {
    doc.addPage();
    drawPageFrame(true);
  };

  const ensureRoom = (height: number) => {
    if (y + height <= footerTop - 12) return;
    addPage();
  };

  const heading = (text: string, size = 14) => {
    ensureRoom(size + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(COLORS.ink);
    doc.text(cleanPdfText(text), margin, y);
    y += size + 10;
  };

  const summaryCard = (label: string, range: string, count: number, amount: number, x: number, width: number, tone: 'blue' | 'amber' = 'blue') => {
    const fill = tone === 'amber' ? COLORS.paleAmber : COLORS.paleBlue;
    const accent = tone === 'amber' ? COLORS.amber : COLORS.blue;
    doc.setFillColor(fill);
    doc.roundedRect(x, y, width, 68, 6, 6, 'F');
    doc.setTextColor(accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(cleanPdfText(label).toUpperCase(), x + 10, y + 15);
    doc.setTextColor(COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(cleanPdfText(range), x + 10, y + 29);
    doc.setTextColor(COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(tone === 'amber' ? signedNumber(count) : String(count), x + 10, y + 53);
    doc.text(cleanPdfText(tone === 'amber' ? signedMoney(amount) : money.format(amount)), x + width - 10, y + 53, { align: 'right' });
  };

  const drawDealTable = (period: OwnersReportPdfPeriod) => {
    heading(period.title, 12);
    const columns = [
      { label: 'Deal', x: margin, width: 190, align: 'left' as const },
      { label: 'Closed', x: margin + 190, width: 72, align: 'left' as const },
      { label: 'Store', x: margin + 262, width: 82, align: 'left' as const },
      { label: 'Salesperson', x: margin + 344, width: 100, align: 'left' as const },
      { label: 'Amount', x: margin + 444, width: contentWidth - 444, align: 'right' as const },
    ];
    const drawHeader = () => {
      ensureRoom(28);
      doc.setFillColor('#e7ebf0');
      doc.rect(margin, y, contentWidth, 22, 'F');
      doc.setTextColor(COLORS.muted);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      for (const column of columns) {
        const textX = column.align === 'right' ? column.x + column.width - 5 : column.x + 5;
        doc.text(column.label, textX, y + 14, { align: column.align });
      }
      y += 22;
    };
    drawHeader();
    if (!period.deals.length) {
      doc.setTextColor(COLORS.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('No matching deals for this period and filter selection.', margin + 6, y + 18);
      y += 30;
      return;
    }
    for (const deal of period.deals) {
      const dealLines = doc.splitTextToSize(cleanPdfText(deal.title) || 'Untitled deal', columns[0].width - 10) as string[];
      const storeLines = doc.splitTextToSize(cleanPdfText(input.storeNames.get(deal.location_id ?? '') ?? 'Unassigned'), columns[2].width - 10) as string[];
      const salespersonLines = doc.splitTextToSize(cleanPdfText(input.salespersonNames.get(deal.assigned_to ?? '') ?? 'Unassigned'), columns[3].width - 10) as string[];
      const rowHeight = Math.max(24, Math.max(dealLines.length, storeLines.length, salespersonLines.length) * 10 + 10);
      if (y + rowHeight > footerTop - 12) {
        addPage();
        heading(`${period.title} (continued)`, 11);
        drawHeader();
      }
      doc.setDrawColor(COLORS.rule);
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
      doc.setTextColor('#263548');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.25);
      doc.text(dealLines, columns[0].x + 5, y + 14);
      doc.text(closedDate(deal.closed_at), columns[1].x + 5, y + 14);
      doc.text(storeLines, columns[2].x + 5, y + 14);
      doc.text(salespersonLines, columns[3].x + 5, y + 14);
      doc.text(cleanPdfText(money.format(Number(deal.amount) || 0)), columns[4].x + columns[4].width - 5, y + 14, { align: 'right' });
      y += rowHeight;
    }
    y += 16;
  };

  const drawClosingTable = (title: string, firstColumn: string, rows: ClosingRateRow[]) => {
    heading(title, 12);
    const positions = [margin, margin + 270, margin + 360, margin + 446, pageWidth - margin];
    const drawHeader = () => {
      ensureRoom(25);
      doc.setFillColor('#e7ebf0');
      doc.rect(margin, y, contentWidth, 22, 'F');
      doc.setTextColor(COLORS.muted);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(firstColumn, positions[0] + 5, y + 14);
      doc.text('Assigned Leads', positions[2] - 5, y + 14, { align: 'right' });
      doc.text('Closed-Won', positions[3] - 5, y + 14, { align: 'right' });
      doc.text('Rate', positions[4] - 5, y + 14, { align: 'right' });
      y += 22;
    };
    drawHeader();
    if (!rows.length) {
      doc.setTextColor(COLORS.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('No assigned leads in this period.', margin + 5, y + 18);
      y += 30;
      return;
    }
    for (const row of rows) {
      if (y + 23 > footerTop - 12) {
        addPage();
        heading(`${title} (continued)`, 11);
        drawHeader();
      }
      doc.setDrawColor(COLORS.rule);
      doc.line(margin, y + 23, pageWidth - margin, y + 23);
      doc.setTextColor('#263548');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(cleanPdfText(row.name), positions[0] + 5, y + 15, { maxWidth: positions[1] - positions[0] - 10 });
      doc.text(String(row.assigned), positions[2] - 5, y + 15, { align: 'right' });
      doc.text(String(row.won), positions[3] - 5, y + 15, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(`${(row.rate * 100).toFixed(1)}%`, positions[4] - 5, y + 15, { align: 'right' });
      y += 23;
    }
    y += 16;
  };

  const drawGrossSalesRanking = () => {
    heading('Salesperson Gross Sales Ranking', 14);
    doc.setTextColor(COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Ranked highest to lowest by total Closed-Won sale dollars for the first/current period.', margin, y);
    y += 16;
    if (!input.grossSalesRanking.length) {
      doc.setTextColor(COLORS.muted);
      doc.text('No assigned Closed-Won deals match the applied store, salesperson, and date filters.', margin, y);
      y += 26;
      return;
    }

    input.grossSalesRanking.forEach((salesperson, rankIndex) => {
      const drawSalespersonHeader = (continued = false) => {
        ensureRoom(52);
        doc.setFillColor(COLORS.paleBlue);
        doc.roundedRect(margin, y, contentWidth, 34, 5, 5, 'F');
        doc.setTextColor(COLORS.ink);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`#${rankIndex + 1} ${cleanPdfText(salesperson.name)}${continued ? ' (continued)' : ''}`, margin + 9, y + 14);
        doc.setFontSize(8.5);
        doc.text(`${salesperson.wonCount} Closed-Won deals`, margin + 9, y + 27);
        doc.setFontSize(12);
        doc.text(cleanPdfText(money.format(salesperson.totalAmount)), pageWidth - margin - 9, y + 21, { align: 'right' });
        y += 40;
        doc.setFillColor('#e7ebf0');
        doc.rect(margin, y, contentWidth, 20, 'F');
        doc.setTextColor(COLORS.muted);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('Individual Closing Sale', margin + 6, y + 13);
        doc.text('Closed', margin + 354, y + 13);
        doc.text('Sale Price', pageWidth - margin - 6, y + 13, { align: 'right' });
        y += 20;
      };

      drawSalespersonHeader();
      for (const deal of salesperson.deals) {
        const titleLines = doc.splitTextToSize(cleanPdfText(deal.title) || 'Untitled deal', 336) as string[];
        const rowHeight = Math.max(23, titleLines.length * 10 + 9);
        if (y + rowHeight + 28 > footerTop - 12) {
          addPage();
          drawSalespersonHeader(true);
        }
        doc.setDrawColor(COLORS.rule);
        doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
        doc.setTextColor('#263548');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.25);
        doc.text(titleLines, margin + 6, y + 14);
        doc.text(closedDate(deal.closed_at), margin + 354, y + 14);
        doc.text(cleanPdfText(money.format(Number(deal.amount) || 0)), pageWidth - margin - 6, y + 14, { align: 'right' });
        y += rowHeight;
      }
      ensureRoom(30);
      doc.setFillColor('#ffffff');
      doc.rect(margin, y, contentWidth, 24, 'F');
      doc.setTextColor(COLORS.ink);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`${cleanPdfText(salesperson.name)} Salesperson Total`, margin + 6, y + 16);
      doc.text(`${salesperson.wonCount} Closed-Won deals`, margin + 354, y + 16);
      doc.text(cleanPdfText(money.format(salesperson.totalAmount)), pageWidth - margin - 6, y + 16, { align: 'right' });
      y += 36;
    });
  };

  drawPageFrame();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(COLORS.ink);
  doc.text('Sales Outcome', margin, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(COLORS.muted);
  doc.text(`Generated ${cleanPdfText(input.generatedAt.toLocaleString())}`, margin, y);
  y += 20;

  doc.setFillColor('#ffffff');
  doc.roundedRect(margin, y, contentWidth, 58, 6, 6, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(COLORS.muted);
  const filters = [
    ['Outcome', input.outcome === 'won' ? 'Closed-Won' : 'Closed-Lost'],
    ['Store', input.store],
    ['Salesperson', input.salesperson],
    ['Date range', input.dateSelection],
  ];
  filters.forEach(([label, value], index) => {
    const x = margin + 12 + index * (contentWidth / 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.muted);
    doc.text(label.toUpperCase(), x, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLORS.ink);
    const valueLines = doc.splitTextToSize(cleanPdfText(value), contentWidth / 4 - 18) as string[];
    doc.text(valueLines.slice(0, 2), x, y + 34);
  });
  y += 74;

  const summaryCount = input.comparedTo ? 3 : 1;
  const summaryGap = 8;
  const summaryWidth = (contentWidth - summaryGap * (summaryCount - 1)) / summaryCount;
  summaryCard(input.current.title, input.current.range, input.current.totalCount, input.current.totalAmount, margin, summaryWidth);
  if (input.comparedTo) {
    summaryCard(input.comparedTo.title, input.comparedTo.range, input.comparedTo.totalCount, input.comparedTo.totalAmount, margin + summaryWidth + summaryGap, summaryWidth);
    summaryCard('Comparison delta', 'First period minus Compared to', input.delta?.count ?? 0, input.delta?.amount ?? 0, margin + (summaryWidth + summaryGap) * 2, summaryWidth, 'amber');
  }
  y += 84;

  drawGrossSalesRanking();
  drawDealTable(input.current);
  if (input.comparedTo) drawDealTable(input.comparedTo);

  heading('Closing Rate', 14);
  doc.setTextColor(COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const rateExplanation = `Deals assigned during ${cleanPdfText(input.current.range)}; rate is Closed-Won divided by assigned leads. Closing-rate rows respect the selected store and salesperson filters.`;
  const explanationLines = doc.splitTextToSize(rateExplanation, contentWidth) as string[];
  doc.text(explanationLines, margin, y);
  y += explanationLines.length * 11 + 6;
  drawClosingTable('By Salesperson', 'Salesperson', input.salespersonRates);
  drawClosingTable('By Store', 'Store', input.storeRates);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(COLORS.rule);
    doc.line(margin, footerTop, pageWidth - margin, footerTop);
    doc.setTextColor(COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('SPAS 360 - Owners Corner', margin, pageHeight - 25);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 25, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

export async function viewOwnersReportPdf(input: OwnersReportPdfInput): Promise<void> {
  const preview = window.open('', '_blank');
  if (!preview) throw new Error('Allow pop-ups for SPAS 360 to view this printable PDF.');
  preview.opener = null;
  preview.document.title = 'Preparing Owners Corner report';
  preview.document.body.style.cssText = 'margin:0;display:grid;place-items:center;min-height:100vh;background:#111a2a;color:white;font:600 16px system-ui,sans-serif';
  preview.document.body.textContent = 'Preparing printable Owners Corner report...';
  try {
    const response = await fetch('/mchl-duck-dashboard.png', { cache: 'force-cache' });
    if (!response.ok) throw new Error('The approved Owners Corner duck logo could not be loaded.');
    const logoBlob = await response.blob();
    const duckLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The approved duck logo could not be read.'));
      reader.onerror = () => reject(new Error('The approved duck logo could not be read.'));
      reader.readAsDataURL(logoBlob);
    });
    const bytes = await buildOwnersReportPdf({ ...input, duckLogoDataUrl });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    preview.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
  } catch (error) {
    preview.close();
    throw error;
  }
}
