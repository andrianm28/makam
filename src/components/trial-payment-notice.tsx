/**
 * Beside a Tagihan's Bayar button, while production pays through SumoPod's
 * sandbox (ticket 101). `trial` comes from the dynamic document page, which
 * reads the running process's environment per request.
 */
export function TrialPaymentNotice({ trial }: { trial: boolean }) {
  if (!trial) return null;
  return (
    <p role="note" className="text-sm font-medium text-foreground break-words">
      Pembayaran ini uji coba: tidak ada uang yang berpindah.
    </p>
  );
}
