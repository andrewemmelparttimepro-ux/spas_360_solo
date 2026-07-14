import { jsPDF } from 'jspdf';
import type { SupabaseClient } from '@supabase/supabase-js';

export type MissingField = {
  field: string;
  reason: string;
  record_id?: string;
};

export type ArtifactIntent = {
  format: 'pdf';
  kind: string;
  title: string;
};

type BusinessProfile = {
  business_name: string;
  tagline: string | null;
  facts: Record<string, unknown> | null;
  logo_storage_path: string | null;
};

type InventoryCandidate = {
  id: string;
  sku: string;
  product: string;
  brand: string | null;
  model: string | null;
  color_finish: string | null;
  msrp: number | null;
  sale_price: number | null;
  primary_image_storage_path: string | null;
  primary_image_mime_type: string | null;
};

export type ArtifactContext = {
  profile: BusinessProfile | null;
  inventory: InventoryCandidate | null;
  missing: MissingField[];
};

const ARTIFACT_RE = /\b(pdf|one[- ]?pager|sell sheet|sales sheet|handout|leave[- ]?behind|brochure|battle card|sales tool|proposal|quote sheet)\b/i;

function cleanTitle(value: string): string {
  const first = value
    .replace(/\[\[(?:ari|user|customer):[^\]]+\]\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (first.length > 92 ? `${first.slice(0, 89)}...` : first) || 'Ari sales tool';
}

function artifactTitle(request: string): string {
  const titled = request.match(/\btitled\s+["“]?(.+?)["”]?(?=[.!?]|$)/i)?.[1]?.trim();
  if (titled) return cleanTitle(titled);
  const subject = request.match(/\b(?:for|about)\s+(?:the\s+)?(.+?)(?=\s+(?:using|with|based on|including)\b|[.!?]|$)/i)?.[1]?.trim();
  if (subject && subject.length >= 4) return cleanTitle(subject);
  return cleanTitle(request);
}

export function detectArtifactIntent(request: string): ArtifactIntent | null {
  if (!ARTIFACT_RE.test(request)) return null;
  const lower = request.toLowerCase();
  const kind = /proposal/.test(lower)
    ? 'proposal'
    : /quote/.test(lower)
      ? 'document'
      : /battle card/.test(lower)
        ? 'sales_tool'
        : /one[- ]?pager|sell sheet|sales sheet|handout|leave[- ]?behind|brochure/.test(lower)
          ? 'one_pager'
          : 'sales_tool';
  return { format: 'pdf', kind, title: artifactTitle(request) };
}

export function artifactInstruction(): string {
  return `

ARTIFACT MODE — REQUIRED OUTPUT CONTRACT:
The user requested a finished sales artifact. Return only the polished customer-ready document copy in Markdown.
Do not say you built, exported, attached, downloaded, or sent a file. Do not tell the user to copy content into Canva, Google Docs, or another tool. Do not include design-stage directions such as "logo left" or "photo right". Never invent or estimate a price, SKU, location, business fact, image, or logo. If verified data is missing, use an explicit [CONFIRM: field] marker so the server can stop the file before it reaches a customer.`;
}

function requestTokens(value: string): string[] {
  const stop = new Set(['about', 'after', 'build', 'create', 'customer', 'document', 'handout', 'make', 'one', 'page', 'pager', 'photo', 'please', 'sales', 'sheet', 'that', 'this', 'tool', 'with']);
  return [...new Set(value.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? [])]
    .filter(token => !stop.has(token));
}

function inventoryScore(item: InventoryCandidate, tokens: string[]): number {
  const haystack = [item.sku, item.product, item.brand, item.model, item.color_finish]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? token.length : 0), 0);
}

export async function loadArtifactContext(
  client: SupabaseClient,
  orgId: string,
  request: string,
  content: string,
): Promise<ArtifactContext> {
  const [{ data: profile }, { data: inventoryRows }] = await Promise.all([
    client
      .from('business_profile')
      .select('business_name, tagline, facts, logo_storage_path')
      .eq('org_id', orgId)
      .maybeSingle(),
    client
      .from('inventory_items')
      .select('id, sku, product, brand, model, color_finish, msrp, sale_price, primary_image_storage_path, primary_image_mime_type')
      .eq('org_id', orgId)
      .limit(250),
  ]);

  const tokens = requestTokens(request);
  const ranked = ((inventoryRows ?? []) as InventoryCandidate[])
    .map(item => ({ item, score: inventoryScore(item, tokens) }))
    .sort((a, b) => b.score - a.score);
  const inventory = ranked[0]?.score >= 5 ? ranked[0].item : null;
  const missing: MissingField[] = [];
  const requestLower = request.toLowerCase();
  const negates = (terms: string) => requestLower
    .split(/[.!?;\n]+/)
    .some(clause => /\b(?:do not include|don't include|without|exclude|no)\b/i.test(clause)
      && new RegExp(`\\b(?:${terms})\\b`, 'i').test(clause));

  const addMissing = (field: string, reason: string, recordId?: string) => {
    if (!missing.some(item => item.field === field)) {
      missing.push({ field, reason, ...(recordId ? { record_id: recordId } : {}) });
    }
  };

  if (/\[(?:confirm|tbd|missing|insert|add)[^\]]*\]/i.test(content)) {
    addMissing('Unverified placeholders', 'The draft still contains fields that have not been verified.');
  }
  const priceRequested = /\b(?:msrp|sale price|your price|pricing|prices?)\b/.test(requestLower)
    && !negates('msrp|sale price|your price|pricing|prices?');
  if (priceRequested && inventory) {
    if (inventory.msrp == null) addMissing('MSRP', `MSRP is blank for ${inventory.product} (${inventory.sku}).`, inventory.id);
    if (inventory.sale_price == null) addMissing('Sale price', `Sale price is blank for ${inventory.product} (${inventory.sku}).`, inventory.id);
  }
  const photoRequested = /\b(photo|product image|product photo|picture)\b/.test(requestLower)
    && !negates('photo|product image|product photo|picture');
  if (photoRequested) {
    if (!inventory) addMissing('Product photo', 'No inventory record could be matched confidently to this request.');
    else if (!inventory.primary_image_storage_path) {
      addMissing('Product photo', `No approved product photo is attached to ${inventory.product} (${inventory.sku}).`, inventory.id);
    }
  }
  const logoRequested = /\blogo\b/.test(requestLower) && !negates('logo');
  if (logoRequested && !(profile as BusinessProfile | null)?.logo_storage_path) {
    addMissing('Business logo', 'No approved business logo is attached to the organization profile.');
  }

  return {
    profile: (profile as BusinessProfile | null) ?? null,
    inventory,
    missing,
  };
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function safeFileName(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'ari-sales-tool';
  return `${base}.pdf`;
}

async function addStoredImage(
  doc: jsPDF,
  service: SupabaseClient,
  path: string | null | undefined,
  mime: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): Promise<boolean> {
  if (!path || !mime || !['image/jpeg', 'image/png'].includes(mime)) return false;
  const { data, error } = await service.storage.from('ari-assets').download(path);
  if (error || !data) return false;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const format = mime === 'image/png' ? 'PNG' : 'JPEG';
  try {
    const dimensions = doc.getImageProperties(bytes);
    const scale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height);
    doc.addImage(bytes, format, x, y, dimensions.width * scale, dimensions.height * scale, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
}

export async function renderSalesPdf(
  service: SupabaseClient,
  intent: ArtifactIntent,
  content: string,
  context: ArtifactContext,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const navy: [number, number, number] = [12, 34, 65];
  const blue: [number, number, number] = [39, 111, 191];
  const ink: [number, number, number] = [26, 35, 48];
  const business = context.profile?.business_name || 'SPAS 360';
  let y = 0;
  let page = 1;

  const drawChrome = () => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 58, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(business.toUpperCase(), margin, 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(190, 210, 232);
    doc.text((context.profile?.tagline || 'Prepared with SPAS 360').slice(0, 90), margin, 43);
    doc.setDrawColor(219, 226, 235);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    doc.setFontSize(8);
    doc.setTextColor(104, 116, 132);
    doc.text(`${business}  •  Prepared ${new Date().toLocaleDateString('en-US')}`, margin, pageHeight - 18);
    doc.text(`Page ${page}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
    y = 86;
  };

  const ensure = (height: number) => {
    if (y + height <= pageHeight - 54) return;
    doc.addPage();
    page += 1;
    drawChrome();
  };

  drawChrome();
  const logoPath = context.profile?.logo_storage_path;
  const logoMime = logoPath?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const hasLogo = await addStoredImage(doc, service, logoPath, logoMime, pageWidth - 144, 12, 96, 36);
  void hasLogo;

  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  const titleLines = doc.splitTextToSize(stripMarkdown(intent.title), pageWidth - (margin * 2));
  doc.text(titleLines, margin, y);
  y += titleLines.length * 24 + 12;
  doc.setFillColor(...blue);
  doc.rect(margin, y, 62, 4, 'F');
  y += 20;

  if (context.inventory?.primary_image_storage_path) {
    const inserted = await addStoredImage(
      doc,
      service,
      context.inventory.primary_image_storage_path,
      context.inventory.primary_image_mime_type,
      pageWidth - margin - 180,
      y,
      180,
      128,
    );
    if (inserted) y += 144;
  }

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^---+$/.test(line)) { y += 7; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (heading) {
      ensure(32);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(heading[1].length === 1 ? 16 : 12.5);
      doc.setTextColor(...navy);
      const lines = doc.splitTextToSize(stripMarkdown(heading[2]), pageWidth - (margin * 2));
      doc.text(lines, margin, y);
      y += lines.length * (heading[1].length === 1 ? 19 : 15) + 7;
      continue;
    }
    const text = stripMarkdown(bullet?.[1] ?? line);
    if (!text) continue;
    doc.setFont('helvetica', /\*\*|^.+:$/.test(line) ? 'bold' : 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...ink);
    const x = bullet ? margin + 14 : margin;
    const lines = doc.splitTextToSize(text, pageWidth - margin - x);
    const height = lines.length * 14 + 5;
    ensure(height);
    if (bullet) {
      doc.setFillColor(...blue);
      doc.circle(margin + 3, y - 3, 2.2, 'F');
    }
    doc.text(lines, x, y);
    y += height;
  }

  const buffer = doc.output('arraybuffer');
  return { bytes: new Uint8Array(buffer), fileName: safeFileName(intent.title) };
}
