package kr.plusevapp.twa;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClient.BillingResponseCode;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingResult;

// 구글 플레이 한국 대체결제(alternative billing only):
// 웹이 plusev://altpay?o=주문번호 로 부르면 → 구글 안내창 → 신고용 토큰을 받아 웹(?altpay=주문&tok=토큰)으로 돌려줌.
// 토큰은 서버(pay-confirm)가 결제 승인 뒤 구글에 신고할 때 써요.
public class AltPayActivity extends Activity {
    private BillingClient bc;
    private String order;
    private boolean done;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Uri u = getIntent().getData();
        order = u == null ? null : u.getQueryParameter("o");
        if (order == null || !order.matches("[A-Za-z0-9_-]{6,64}")) { finish(); return; }
        bc = BillingClient.newBuilder(this).enableAlternativeBillingOnly().build();
        bc.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() != BillingResponseCode.OK) { back("err", "setup" + r.getResponseCode()); return; }
                bc.isAlternativeBillingOnlyAvailableAsync(a -> {
                    if (a.getResponseCode() != BillingResponseCode.OK) { back("err", "avail" + a.getResponseCode()); return; }
                    runOnUiThread(() -> bc.showAlternativeBillingOnlyInformationDialog(AltPayActivity.this, d -> {
                        if (d.getResponseCode() != BillingResponseCode.OK) { back("err", "dialog" + d.getResponseCode()); return; }
                        bc.createAlternativeBillingOnlyReportingDetailsAsync((t, det) -> {
                            if (t.getResponseCode() != BillingResponseCode.OK || det == null) { back("err", "token" + t.getResponseCode()); return; }
                            back("tok", det.getExternalTransactionToken());
                        });
                    }));
                });
            }

            @Override
            public void onBillingServiceDisconnected() { back("err", "disconnected"); }
        });
    }

    private synchronized void back(String k, String v) {
        if (done) return;
        done = true;
        Uri u = Uri.parse("https://plusevapp.kr/").buildUpon().appendQueryParameter("altpay", order).appendQueryParameter(k, v).build();
        Intent i = new Intent(Intent.ACTION_VIEW, u, this, LauncherActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
        if (bc != null) bc.endConnection();
        finish();
    }
}
