import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { WorkReportDraft } from './types';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 56.7;
const MARGIN_RIGHT = 56.7;
const BODY_TOP = 720;
const BODY_BOTTOM = 91;
const TEXT = rgb(0.07, 0.07, 0.07);
const RULE = rgb(0.28, 0.28, 0.28);
const LOGO_URL = 'https://cdn03.plentyone.com/y4fubv2ae37s/frontend/Logo/sk1.jpg';

function safeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^\u0009\u000a\u000d\u0020-\u007e\u00a0-\u00ff]/g, '')
    .trim();
}

function wrap(font: PDFFont, value: unknown, size: number, width: number): string[] {
  const text = safeText(value);
  if (!text) return [''];
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function dateLabel(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || '-';
}

function decimalLabel(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function workTimeLabel(minutes: number): string {
  return minutes > 0 ? `${decimalLabel(Math.round((minutes / 60) * 100) / 100)} Std.` : '-';
}

function driveTimeLabel(minutes: number): string {
  if (minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} Std.${rest ? ` ${rest} Min.` : ''}` : `${rest} Min.`;
}

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    return await pdf.embedJpg(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

export async function createReportPdf(draft: WorkReportDraft, reportNumber: string, signature?: Uint8Array) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);
  let signatureImage: PDFImage | null = null;
  if (signature) {
    try { signatureImage = await pdf.embedPng(signature); } catch { signatureImage = null; }
  }

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const pages: PDFPage[] = [page];
  let y = BODY_TOP;

  const drawHeaderAndFooter = (target: PDFPage) => {
    if (logo) {
      const scaled = logo.scaleToFit(205, 58);
      target.drawImage(logo, {
        x: PAGE_WIDTH - MARGIN_RIGHT - scaled.width,
        y: PAGE_HEIGHT - 27 - scaled.height,
        width: scaled.width,
        height: scaled.height,
      });
    } else {
      target.drawText('mifrro', { x: PAGE_WIDTH - MARGIN_RIGHT - 72, y: PAGE_HEIGHT - 53, size: 24, font: bold, color: TEXT });
    }
    target.drawText('mifrro Vertriebs GmbH | Von-Braun-Str. 25a | 52511 Geilenkirchen', {
      x: MARGIN_LEFT,
      y: PAGE_HEIGHT - 102,
      size: 7.5,
      font: regular,
      color: TEXT,
    });
    target.drawLine({ start: { x: MARGIN_LEFT, y: 72 }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: 72 }, thickness: 0.65, color: RULE });

    const footerRows = [
      ['Konto: 3300329011', 'Blz: 37069412', 'Bank: VR-Bank', 'Kto-Inhaber: mifrro Vertriebs GmbH'],
      ['IBAN: DE 96 3706 94 12 3300 3290 11', 'Swift/BIC: GENODED1HRB', 'UstID: DE261670620', 'HRB: 15037'],
      ['Tel.: 0049 2451 9116960', 'Fax: 0049 2451 9148789', 'E-Mail: info@mifrro.de', 'Web: www.smartklimatisieren.de'],
    ];
    const columnWidth = (PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT) / 3;
    footerRows.forEach((rows, index) => {
      const x = MARGIN_LEFT + columnWidth * index;
      rows.forEach((row, rowIndex) => {
        const width = regular.widthOfTextAtSize(row, 6.4);
        const alignedX = index === 1 ? x + (columnWidth - width) / 2 : index === 2 ? x + columnWidth - width : x;
        target.drawText(row, { x: alignedX, y: 61 - rowIndex * 8.2, size: 6.4, font: regular, color: TEXT });
      });
    });
  };

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawHeaderAndFooter(page);
    y = BODY_TOP;
  };
  drawHeaderAndFooter(page);

  const ensure = (height: number) => {
    if (y - height < BODY_BOTTOM) addPage();
  };

  const drawWrapped = (value: unknown, options: { x?: number; width?: number; size?: number; font?: PDFFont; lineHeight?: number } = {}) => {
    const x = options.x ?? MARGIN_LEFT;
    const width = options.width ?? PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    const size = options.size ?? 8.3;
    const font = options.font ?? regular;
    const lineHeight = options.lineHeight ?? size + 2;
    const lines = wrap(font, value, size, width);
    ensure(lines.length * lineHeight);
    for (const text of lines) {
      page.drawText(text || ' ', { x, y, size, font, color: TEXT });
      y -= lineHeight;
    }
  };

  const drawFixedLines = (target: PDFPage, lines: string[], x: number, startY: number, width: number, size: number, firstBold = false) => {
    let cursor = startY;
    lines.forEach((line, index) => {
      const font = firstBold && index === 0 ? bold : regular;
      for (const part of wrap(font, line, size, width)) {
        target.drawText(part || ' ', { x, y: cursor, size, font, color: TEXT });
        cursor -= size + 2;
      }
    });
  };

  const customerLines = [
    draft.customer.company || draft.customer.fullName,
    draft.customer.company && draft.customer.fullName !== draft.customer.company ? draft.customer.fullName : '',
    [draft.customer.street, draft.customer.houseNumber].filter(Boolean).join(' '),
    [draft.customer.zip, draft.customer.city].filter(Boolean).join(' '),
    'Deutschland',
  ].map(safeText).filter(Boolean);
  const employeeShort = draft.personnel
    .filter((row) => row.name || row.role)
    .map((row) => row.name && row.role ? `${row.name} (${row.role})` : row.name || row.role)
    .join(', ') || '-';
  const customerNumber = draft.customer.number || draft.customer.id || '-';
  const metaTop = y;
  drawFixedLines(page, customerLines, MARGIN_LEFT, metaTop, 176, 9.5, true);

  const drawMetaColumn = (x: number, width: number, rows: Array<[string, string]>) => {
    let cursor = metaTop;
    for (const [label, value] of rows) {
      page.drawText(label, { x, y: cursor, size: 8.5, font: bold, color: TEXT });
      cursor -= 10.5;
      for (const line of wrap(regular, value || '-', 8.5, width)) {
        page.drawText(line || '-', { x, y: cursor, size: 8.5, font: regular, color: TEXT });
        cursor -= 10.5;
      }
      cursor -= 8;
    }
  };
  drawMetaColumn(MARGIN_LEFT + 180, 108, [['Datum', dateLabel(draft.workDate)], ['Mitarbeiter', employeeShort]]);
  drawMetaColumn(MARGIN_LEFT + 295, 87, [['Arbeitszeit', workTimeLabel(draft.workMinutes + draft.driveMinutes)], ['Fahrzeit', driveTimeLabel(draft.driveMinutes)]]);
  drawMetaColumn(MARGIN_LEFT + 390, 92, [['Kundennummer', customerNumber], ['Arbeitsnachweis', reportNumber]]);
  y = metaTop - 84;

  const addressLabel = 'Einsatzadresse:';
  page.drawText(addressLabel, { x: MARGIN_LEFT, y, size: 8.5, font: bold, color: TEXT });
  const labelWidth = bold.widthOfTextAtSize(addressLabel, 8.5) + 4;
  const addressLines = wrap(regular, draft.workAddress, 8.5, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - labelWidth);
  addressLines.forEach((line, index) => page.drawText(line || '-', { x: MARGIN_LEFT + labelWidth, y: y - index * 10.5, size: 8.5, font: regular, color: TEXT }));
  y -= Math.max(24, addressLines.length * 10.5 + 14);

  ensure(38);
  page.drawText('Arbeitsnachweis', { x: MARGIN_LEFT, y, size: 11, font: bold, color: TEXT });
  y -= 15;
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y }, thickness: 0.65, color: RULE });
  y -= 15;
  page.drawText('Position', { x: MARGIN_LEFT, y, size: 8.3, font: bold, color: TEXT });
  page.drawText('Beschreibung', { x: MARGIN_LEFT + 45, y, size: 8.3, font: bold, color: TEXT });
  const quantityHeader = 'Menge';
  page.drawText(quantityHeader, { x: PAGE_WIDTH - MARGIN_RIGHT - bold.widthOfTextAtSize(quantityHeader, 8.3), y, size: 8.3, font: bold, color: TEXT });
  y -= 10;
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y }, thickness: 0.65, color: RULE });
  y -= 13;

  const positions = draft.positions.filter((row) => safeText(row.name) && !safeText(row.name).includes('Strecke noch berechnen'));
  if (!positions.length) {
    drawWrapped('Keine Positionen vorhanden.', { size: 8.5 });
    page.drawLine({ start: { x: MARGIN_LEFT, y: y - 1 }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: y - 1 }, thickness: 0.45, color: RULE });
    y -= 9;
  } else {
    positions.forEach((row, index) => {
      const descriptionLines = wrap(regular, row.name, 8.3, 350);
      const rowHeight = Math.max(18, descriptionLines.length * 10 + 7);
      ensure(rowHeight + 4);
      page.drawText(String(index + 1), { x: MARGIN_LEFT, y, size: 8.3, font: regular, color: TEXT });
      descriptionLines.forEach((line, lineIndex) => page.drawText(line || ' ', { x: MARGIN_LEFT + 45, y: y - lineIndex * 10, size: 8.3, font: regular, color: TEXT }));
      const quantity = `${decimalLabel(Number(row.quantity) || 0)} ${safeText(row.unit)}`.trim();
      page.drawText(quantity, { x: PAGE_WIDTH - MARGIN_RIGHT - regular.widthOfTextAtSize(quantity, 8.3), y, size: 8.3, font: regular, color: TEXT });
      y -= rowHeight - 4;
      page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y }, thickness: 0.45, color: RULE });
      y -= 9;
    });
  }

  ensure(36);
  y -= 2;
  page.drawText('Arbeitsbericht', { x: MARGIN_LEFT, y, size: 10, font: bold, color: TEXT });
  y -= 16;
  const reportRows: Array<[string, string]> = [
    ['Ausgeführte Arbeiten', draft.workDescription],
    ['Feststellungen', draft.findings],
    ['Beanstandungen', draft.complaints],
    ['Empfehlungen / weitere Arbeiten', draft.recommendations],
  ].filter((row) => safeText(row[1])) as Array<[string, string]>;
  if (!reportRows.length) reportRows.push(['Arbeitsbericht', 'Keine weiteren Angaben.']);
  for (const [label, value] of reportRows) {
    const valueLines = wrap(regular, value, 8.3, 330);
    const rowHeight = Math.max(17, valueLines.length * 10 + 5);
    ensure(rowHeight);
    page.drawText(label, { x: MARGIN_LEFT, y, size: 8.3, font: bold, color: TEXT });
    valueLines.forEach((line, index) => page.drawText(line || ' ', { x: MARGIN_LEFT + 145, y: y - index * 10, size: 8.3, font: regular, color: TEXT }));
    y -= rowHeight;
  }

  ensure(125);
  y -= 3;
  page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y }, thickness: 0.65, color: RULE });
  y -= 16;
  page.drawText('Kundenbestätigung / Unterschrift', { x: MARGIN_LEFT, y, size: 9, font: bold, color: TEXT });
  y -= 17;
  const signedAt = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const confirmationLines = [
    `Unterzeichner: ${draft.signerName || '-'}`,
    `Datum / Uhrzeit: ${signedAt}`,
    'Bestätigung: Die beschriebenen Arbeiten wurden ausgeführt und die Angaben wurden geprüft.',
  ];
  let leftY = y;
  for (const text of confirmationLines) {
    for (const line of wrap(regular, text, 8.3, 292)) {
      page.drawText(line || ' ', { x: MARGIN_LEFT, y: leftY, size: 8.3, font: regular, color: TEXT });
      leftY -= 10.5;
    }
  }
  if (signatureImage) {
    const scaled = signatureImage.scaleToFit(155, 66);
    const imageX = PAGE_WIDTH - MARGIN_RIGHT - 170 + (170 - scaled.width) / 2;
    page.drawImage(signatureImage, { x: imageX, y: y - scaled.height + 4, width: scaled.width, height: scaled.height });
    const caption = 'Kundenunterschrift';
    page.drawText(caption, { x: PAGE_WIDTH - MARGIN_RIGHT - 85 - regular.widthOfTextAtSize(caption, 7) / 2, y: y - scaled.height - 7, size: 7, font: regular, color: TEXT });
  }

  pages.forEach((target, index) => {
    if (pages.length > 1) {
      const pageNumber = `Seite ${index + 1}/${pages.length}`;
      target.drawText(pageNumber, { x: PAGE_WIDTH - MARGIN_RIGHT - regular.widthOfTextAtSize(pageNumber, 6.4), y: 17, size: 6.4, font: regular, color: TEXT });
    }
  });
  return pdf.save();
}
