
    document.getElementById('downloadPdf').addEventListener('click', () => {
      if (!lastScanResult) return;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const data = lastScanResult;
      let y = 20;

      doc.setFontSize(18);
      doc.text('Cookie Compliance Scan Report', 14, y);
      y += 10;

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('Scanned: ' + new Date(data.scannedAt).toLocaleString(), 14, y);
      y += 6;
      doc.text('URL: ' + data.url, 14, y);
      y += 12;

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Consent mechanism found: ' + (data.consentMechanism.found ? 'Yes' : 'No'), 14, y);
      y += 7;
      doc.text('Risk level: ' + data.summary.riskLevel.toUpperCase(), 14, y);
      y += 12;

      doc.setFontSize(14);
      doc.text('Findings', 14, y);
      y += 8;

      doc.setFontSize(10);
      if (data.findings.length === 0) {
        doc.text('No compliance-relevant trackers detected before consent.', 14, y);
        y += 6;
      } else {
        data.findings.forEach((f) => {
          doc.text(f.company + ' (' + f.category + ') - ' + f.domain + ' - fired ' + f.requestCount + 'x before consent', 14, y);
          y += 6;
        });
      }

      y += 8;
      doc.setFontSize(14);
      doc.text('Pre-consent Cookies', 14, y);
      y += 8;

      doc.setFontSize(10);
      const cookieText = data.preConsentCookies.length > 0
        ? data.preConsentCookies.join(', ')
        : 'None';
      const cookieLines = doc.splitTextToSize(cookieText, 180);
      doc.text(cookieLines, 14, y);

      doc.save('scan-report.pdf');
    });
