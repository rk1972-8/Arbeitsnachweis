import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 56.7;
const MARGIN_RIGHT = 56.7;
const BODY_TOP = 720;
const BODY_BOTTOM = 91;
const TEXT = rgb(0.07, 0.07, 0.07);
const RULE = rgb(0.28, 0.28, 0.28);
const WHITE = rgb(1, 1, 1);
const LOGO_URL = 'https://cdn03.plentyone.com/y4fubv2ae37s/frontend/Logo/sk1.jpg';

export type ReportAddition = {
  quantity: number;
  unit: string;
  title: string;
  itemId: string;
  variationId: string;
  reason: string;
  addedBy: string;
  createdAt: string;
};

export type ReportAdditionContext = {
  reportNumber: string;
  customerCompany: string;
  customerName: string;
  customerAddress: string;
  workAddress: string;
  workDate: string;
};

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

function createdAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value) || '-';
  return date.toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  });
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

function customerLines(context: ReportAdditionContext): string[] {
  return [
    context.customerCompany || context.customerName,
    context.customerCompany && context.customerName !== context.customerCompany ? context.customerName : '',
    ...context.customerAddress.split(',').map((part) => part.trim()),
  ].map(safeText).filter(Boolean);
}

export async function appendOfficeAddition(
  original: ArrayBuffer,
  context: ReportAdditionContext,
  additions: ReportAddition[],
) {
  const pdf = await PDFDocument.load(original);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);
  const originalPageCount = pdf.getPageCount();
  const additionPages: PDFPage[] = [];
  let page: PDFPage = pdf.getPage(0);
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
      target.drawText('mifrro', {
        x: PAGE_WIDTH - MARGIN_RIGHT - 72,
        y: PAGE_HEIGHT - 53,
        size: 24,
        font: bold,
        color: TEXT,
      });
    }
    target.drawText('mifrro Vertriebs GmbH | Von-Braun-Str. 25a | 52511 Geilenkirchen', {
      x: MARGIN_LEFT,
      y: PAGE_HEIGHT - 102,
      size: 7.5,
      font: regular,
      color: TEXT,
    });
    target.drawLine({
      start: { x: MARGIN_LEFT, y: 72 },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: 72 },
      thickness: 0.65,
      color: RULE,
    });

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

  const drawMetaColumn = (target: PDFPage, metaTop: number, x: number, width: number, rows: Array<[string, string]>) => {
    let cursor = metaTop;
    for (const [label, value] of rows) {
      target.drawText(label, { x, y: cursor, size: 8.5, font: bold, color: TEXT });
      cursor -= 10.5;
      for (const line of wrap(regular, value || '-', 8.5, width)) {
        target.drawText(line || '-', { x, y: cursor, size: 8.5, font: regular, color: TEXT });
        cursor -= 10.5;
      }
      cursor -= 8;
    }
  };

  const drawTableHeading = (target: PDFPage) => {
    target.drawText('Position', { x: MARGIN_LEFT, y, size: 8.3, font: bold, color: TEXT });
    target.drawText('Beschreibung', { x: MARGIN_LEFT + 45, y, size: 8.3, font: bold, color: TEXT });
    const quantityHeader = 'Menge';
    target.drawText(quantityHeader, {
      x: PAGE_WIDTH - MARGIN_RIGHT - bold.widthOfTextAtSize(quantityHeader, 8.3),
      y,
      size: 8.3,
      font: bold,
      color: TEXT,
    });
    y -= 10;
    target.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
      thickness: 0.65,
      color: RULE,
    });
    y -= 13;
  };

  const addPage = (first = false, withTable = true) => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    additionPages.push(page);
    drawHeaderAndFooter(page);
    y = BODY_TOP;

    if (first) {
      const metaTop = y;
      let customerY = metaTop;
      customerLines(context).forEach((line, index) => {
        const font = index === 0 ? bold : regular;
        for (const part of wrap(font, line, 9.5, 176)) {
          page.drawText(part || ' ', { x: MARGIN_LEFT, y: customerY, size: 9.5, font, color: TEXT });
          customerY -= 11.5;
        }
      });
      const addedBy = [...new Set(additions.map((addition) => safeText(addition.addedBy)).filter(Boolean))].join(', ') || '-';
      drawMetaColumn(page, metaTop, MARGIN_LEFT + 180, 108, [['Datum', dateLabel(context.workDate)], ['Bearbeitung', addedBy]]);
      drawMetaColumn(page, metaTop, MARGIN_LEFT + 295, 87, [['Dokument', 'Büro-Nachtrag']]);
      drawMetaColumn(page, metaTop, MARGIN_LEFT + 390, 92, [['Arbeitsnachweis', context.reportNumber]]);
      y = metaTop - 84;

      const addressLabel = 'Einsatzadresse:';
      page.drawText(addressLabel, { x: MARGIN_LEFT, y, size: 8.5, font: bold, color: TEXT });
      const labelWidth = bold.widthOfTextAtSize(addressLabel, 8.5) + 4;
      const addressLines = wrap(regular, context.workAddress || context.customerAddress, 8.5, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - labelWidth);
      addressLines.forEach((line, index) => page.drawText(line || '-', {
        x: MARGIN_LEFT + labelWidth,
        y: y - index * 10.5,
        size: 8.5,
        font: regular,
        color: TEXT,
      }));
      y -= Math.max(24, addressLines.length * 10.5 + 14);
    }

    page.drawText(first ? 'Nachtrag zum Arbeitsnachweis' : 'Nachtrag zum Arbeitsnachweis (Fortsetzung)', {
      x: MARGIN_LEFT,
      y,
      size: 11,
      font: bold,
      color: TEXT,
    });
    y -= 15;
    page.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
      thickness: 0.65,
      color: RULE,
    });
    y -= 15;
    if (withTable) drawTableHeading(page);
  };

  const rowLayout = (addition: ReportAddition) => {
    const descriptionLines = wrap(regular, addition.title, 8.3, 320);
    const plentyText = addition.itemId || addition.variationId
      ? `Plenty-Artikel: ${addition.itemId || '-'} | Variante: ${addition.variationId || '-'}`
      : '';
    const plentyLines = plentyText ? wrap(regular, plentyText, 7.2, 320) : [];
    const reasonLines = addition.reason ? wrap(regular, `Grund des Nachtrags: ${addition.reason}`, 7.5, 320) : [];
    const auditLines = wrap(regular, `Ergänzt durch ${addition.addedBy} am ${createdAtLabel(addition.createdAt)}`, 7.2, 320);
    const contentHeight = descriptionLines.length * 10
      + plentyLines.length * 8.5
      + reasonLines.length * 9
      + auditLines.length * 8.5
      + 7;
    return { descriptionLines, plentyLines, reasonLines, auditLines, rowHeight: Math.max(25, contentHeight) };
  };

  addPage(true);
  additions.forEach((addition, index) => {
    const layout = rowLayout(addition);
    if (y - layout.rowHeight < BODY_BOTTOM) addPage(false);

    page.drawText(String(index + 1), { x: MARGIN_LEFT, y, size: 8.3, font: regular, color: TEXT });
    let descriptionY = y;
    layout.descriptionLines.forEach((line) => {
      page.drawText(line || ' ', { x: MARGIN_LEFT + 45, y: descriptionY, size: 8.3, font: regular, color: TEXT });
      descriptionY -= 10;
    });
    layout.plentyLines.forEach((line) => {
      page.drawText(line || ' ', { x: MARGIN_LEFT + 45, y: descriptionY, size: 7.2, font: regular, color: TEXT });
      descriptionY -= 8.5;
    });
    layout.reasonLines.forEach((line) => {
      page.drawText(line || ' ', { x: MARGIN_LEFT + 45, y: descriptionY, size: 7.5, font: regular, color: TEXT });
      descriptionY -= 9;
    });
    layout.auditLines.forEach((line) => {
      page.drawText(line || ' ', { x: MARGIN_LEFT + 45, y: descriptionY, size: 7.2, font: regular, color: TEXT });
      descriptionY -= 8.5;
    });

    const quantity = `${decimalLabel(Number(addition.quantity) || 0)} ${safeText(addition.unit)}`.trim();
    page.drawText(quantity, {
      x: PAGE_WIDTH - MARGIN_RIGHT - regular.widthOfTextAtSize(quantity, 8.3),
      y,
      size: 8.3,
      font: regular,
      color: TEXT,
    });
    y -= layout.rowHeight - 4;
    page.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
      thickness: 0.45,
      color: RULE,
    });
    y -= 9;
  });

  if (y - 54 < BODY_BOTTOM) addPage(false, false);
  y -= 2;
  page.drawText('Dokumentation', { x: MARGIN_LEFT, y, size: 10, font: bold, color: TEXT });
  y -= 16;
  const note = 'Der vom Kunden unterschriebene Arbeitsnachweis bleibt unverändert. Diese Positionen wurden anschließend durch das Büro ergänzt und werden deshalb separat als Nachtrag ausgewiesen.';
  wrap(regular, note, 8.3, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT).forEach((line) => {
    page.drawText(line || ' ', { x: MARGIN_LEFT, y, size: 8.3, font: regular, color: TEXT });
    y -= 10;
  });

  const finalPageCount = pdf.getPageCount();
  pdf.getPages().forEach((target, index) => {
    target.drawRectangle({ x: PAGE_WIDTH - MARGIN_RIGHT - 58, y: 10, width: 58, height: 13, color: WHITE });
    const pageNumber = `Seite ${index + 1}/${finalPageCount}`;
    target.drawText(pageNumber, {
      x: PAGE_WIDTH - MARGIN_RIGHT - regular.widthOfTextAtSize(pageNumber, 6.4),
      y: 17,
      size: 6.4,
      font: regular,
      color: TEXT,
    });
  });

  if (!originalPageCount || !additionPages.length) throw new Error('Der Nachtrag konnte nicht an die PDF angefügt werden.');
  return pdf.save();
}
