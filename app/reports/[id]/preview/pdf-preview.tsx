'use client';

export function PdfPreview({ pdfUrl }: { pdfUrl: string }) {
  function returnToReport() {
    if (window.opener && !window.opener.closed) {
      window.opener.focus();
      window.close();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign('/');
  }

  return (
    <main className="pdf-preview-shell">
      <header className="pdf-preview-toolbar">
        <div><strong>Mifrro Arbeitsnachweis</strong><span>PDF-Vorschau</span></div>
        <button onClick={returnToReport} type="button">← Zurück zum Auftrag</button>
      </header>
      <iframe src={pdfUrl} title="Arbeitsnachweis als PDF" />
    </main>
  );
}
