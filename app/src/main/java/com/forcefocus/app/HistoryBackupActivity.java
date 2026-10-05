package com.forcefocus.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

public final class HistoryBackupActivity extends Activity {
    private static final String TAG = "FF_HISTORY";
    private static final int REQUEST_TREE = 4107;
    private boolean pickerStarted;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pickerStarted = savedInstanceState != null && savedInstanceState.getBoolean("pickerStarted", false);
        if (!pickerStarted) openPicker();
    }

    private void openPicker() {
        pickerStarted = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(intent, REQUEST_TREE);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        outState.putBoolean("pickerStarted", pickerStarted);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_TREE && resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try {
                if (flags == (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION)) {
                    getContentResolver().takePersistableUriPermission(uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } else if (flags == Intent.FLAG_GRANT_READ_URI_PERMISSION) {
                    getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } else if (flags == Intent.FLAG_GRANT_WRITE_URI_PERMISSION) {
                    getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } else {
                    throw new SecurityException("No backup folder URI grant received");
                }
                FocusHistoryStore store = new FocusHistoryStore(this);
                store.rememberTree(uri);
                store.restoreFromTree(uri);
                setResult(RESULT_OK);
            } catch (Exception exception) {
                Log.e(TAG, "backup authorization failed", exception);
                setResult(RESULT_CANCELED);
            }
        }
        finish();
    }
}
