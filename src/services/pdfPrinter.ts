/**
 * Sends the current screen to Android's print framework as a PDF.
 *
 * Deliberately native: the system paginates and renders, so a report with ID
 * photos never has to be assembled in the WebView heap, no Unicode font has to
 * be embedded for non-Latin guest names, and the same dialog can reach a real
 * printer.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { AppError, logError } from '../utils/errors';

interface PdfPrinterPlugin {
  printCurrentView(options: { jobName: string }): Promise<void>;
}

const PdfPrinter = registerPlugin<PdfPrinterPlugin>('PdfPrinter');

export function canPrint(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Opens the Android print sheet for whatever is on screen. In the browser it
 * falls back to `window.print()`, which is enough for checking the layout.
 */
export async function printCurrentView(jobName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.print();
    return;
  }
  try {
    await PdfPrinter.printCurrentView({ jobName });
  } catch (e) {
    logError('pdfPrinter', e);
    throw new AppError(
      'UNKNOWN',
      'The print dialog could not be opened. Check that a print service is enabled in Android settings.',
    );
  }
}
