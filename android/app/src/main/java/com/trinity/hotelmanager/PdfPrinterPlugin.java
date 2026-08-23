package com.trinity.hotelmanager;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Turns the currently displayed page into a PDF using Android's own print
 * framework.
 *
 * Why native rather than a JavaScript PDF library:
 *  - the system renders page by page, so a long report never has to sit in the
 *    WebView heap at once (this app targets budget phones)
 *  - no embedded font is needed, so guest names in any script render correctly
 *  - text stays selectable and searchable in the output
 *  - the same call can send the report to a real printer
 *
 * The web layer navigates to a print-styled report route first; `@media print`
 * rules hide the app's navigation so only the document is rendered.
 */
@CapacitorPlugin(name = "PdfPrinter")
public class PdfPrinterPlugin extends Plugin {

    @PluginMethod
    public void printCurrentView(PluginCall call) {
        final String jobName = call.getString("jobName", "Guest Report");
        final android.app.Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager printManager =
                        (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                    call.reject("Printing is not available on this device");
                    return;
                }

                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                PrintAttributes attributes = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();

                printManager.print(jobName, adapter, attributes);
                call.resolve();
            } catch (Exception e) {
                call.reject("The report could not be sent to the printer", e);
            }
        });
    }
}
