import ejs from 'ejs';
import pdf from 'puppeteer';
import path from 'path';
import sanitize from 'sanitize-html';

const generatePDFFromTemplate = (templateName, data, templateFormat = {}) => {
  return new Promise((resolve, reject) => {
    ejs.renderFile(
      path.join(path.resolve(), './src/views/pdf/', templateName + '.ejs'),
      data,
      {},
      async (err, html) => {
        if (err) {
          reject(err);
        } else {
          try {
            const browser = await pdf.launch({ headless: 'new' });
            const page = await browser.newPage();
            await page.setContent(
              sanitize(html, {
                allowedTags: [
                  'head',
                  'body',
                  'style',
                  'div',
                  'span',
                  'table',
                  'thead',
                  'tbody',
                  'tr',
                  'td',
                  'th',
                  'p',
                  'br',
                  'img',
                  'a',
                ],
                allowedAttributes: {
                  '*': ['class', 'style', 'id'],
                  style: ['type'],
                  img: ['width', 'height', 'src'],
                  a: ['href', 'target'],
                },
                allowedSchemes: ['https', 'http', 'data'], // Prevent links (no http, https, etc.)
                allowVulnerableTags: true,
              }),
              { waitUntil: 'load' }
            );
            const pdfByteArray = await page.pdf({
              format: templateFormat.paperSize || 'A4',
              printBackground: true,
              landscape: templateFormat.orientation === 'landscape',
              displayHeaderFooter: true, // Enable header/footer rendering
              headerTemplate: '<div></div>', // Empty header, but reserves space
              footerTemplate: '<div></div>', // Empty footer, but reserves space
              margin: {
                top: '40px', // reserve space for header
                bottom: '40px', // reserve space for footer
                left: '50px',
                right: '50px',
              },
            });
            const pdfBuffer = Buffer.from(pdfByteArray);
            await browser.close();
            resolve(pdfBuffer);
          } catch (error) {
            reject(error);
          }
        }
      }
    );
  });
};

export const generateNotePdf = () => {
  return generatePDFFromTemplate('note', {});
};

export const generateProviderReportPdf = (data) => {
  return generatePDFFromTemplate('provider-report', data);
};

export const generatePatientReportPdf = (data) => {
  return generatePDFFromTemplate('patient-report', data);
};

export const generateDMReplyNotePdf = (data) => {
  return generatePDFFromTemplate('direct-message', data);
};
