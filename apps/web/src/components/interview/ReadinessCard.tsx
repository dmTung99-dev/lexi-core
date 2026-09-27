import Link from "next/link";
import type { MicPermission } from "@/lib/micPermission";

export interface ReadinessCardProps {
  aiReady: boolean;
  mic: MicPermission;
  onRequestMic: () => void;
}

export function ReadinessCard({ aiReady, mic, onRequestMic }: ReadinessCardProps) {
  return (
    <section className="iv-card iv-readiness" aria-label="Sẵn sàng chưa?">
      <h3 className="iv-card-title">Sẵn sàng chưa?</h3>
      {aiReady ? (
        <p className="iv-check iv-check-ok">Đã có khóa AI</p>
      ) : (
        <p className="iv-check iv-check-warn">
          Chưa có khóa AI — <Link href="/settings">thêm trong Cài đặt</Link>
        </p>
      )}
      {mic === "granted" && <p className="iv-check iv-check-ok">Micro đã sẵn sàng</p>}
      {mic === "prompt" && (
        <div className="iv-check iv-check-warn iv-row">
          <span>Chưa cấp quyền micro</span>
          <button type="button" className="btn-secondary" onClick={onRequestMic}>Cho phép</button>
        </div>
      )}
      {mic === "denied" && (
        <p className="iv-check iv-check-bad">
          Micro bị chặn — bật lại bằng biểu tượng ổ khóa trên thanh địa chỉ rồi tải lại trang.
        </p>
      )}
      {mic === "unsupported" && (
        <p className="iv-check iv-check-bad">Trình duyệt không hỗ trợ ghi âm — dùng Chrome, Edge hoặc Firefox bản mới.</p>
      )}
      <p className="iv-muted">Nên dùng tai nghe có mic. Mỗi câu trả lời tối đa 3 phút.</p>
    </section>
  );
}
