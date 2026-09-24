# Pocket Split — Spec Kiến Thức Dự Án

> **Lưu ý vị trí:** tài liệu này nói về dự án **Pocket Split** (`D:\Flutter\pocket_split`, repo Git riêng), không phải LexiCore. Được chuyển vào đây theo yêu cầu người dùng để gom chung chỗ lưu tài liệu cá nhân — không phải một spec SDD của LexiCore (khác hẳn các file trong `docs/superpowers/specs/`).

**Mục đích tài liệu này:** bạn là người đưa ý tưởng và định hướng, AI viết phần lớn code — nhưng khi nhà tuyển dụng hỏi "bạn đã làm gì trong dự án này", câu trả lời đúng không phải "AI viết hết" mà là **bạn hiểu vì sao code được viết như vậy, và có thể tự tay sửa/mở rộng nó**. Tài liệu này tách làm 2 phần rõ ràng:

- **Phần 1 — Kiến thức nền tảng:** khái niệm chung, trả lời được kể cả khi không mở code (đây là thứ interviewer thực sự kiểm tra — bạn hiểu bản chất, không phải học thuộc code path).
- **Phần 2 — Áp dụng trong Pocket Split:** đúng dòng code, đúng file, đúng luồng thật trong dự án này — để khi bị hỏi "cho ví dụ cụ thể" hoặc "chỉ tôi xem trong code", bạn chỉ thẳng vào được.

Cách ôn: đọc Phần 1 để chắc khái niệm → đọc Phần 2 tương ứng để thấy nó nằm ở đâu trong code thật → tự mở file lên đối chiếu ít nhất 1 lần trước khi phỏng vấn. Đừng học thuộc lòng — hãy hiểu đến mức tự diễn đạt lại được bằng lời của mình.

> ⚠️ **Khác biệt với `docs/mobile-developer-interview-pocket-split.md`** (trong repo Pocket Split): file đó có vài câu trả lời mẫu **không khớp code thật** (ví dụ: mô tả dùng `flutter_secure_storage` để lưu token/role — nhưng code hiện tại không hề gọi package này, session chỉ đến từ `FirebaseAuth.instance` trực tiếp). Xem mục "Khoảng trống thật cần biết" ở cuối Phần 2 — nếu bị hỏi xoáy đúng chỗ đó, hãy trả lời đúng thực tế, đừng lặp lại câu trả lời mẫu sai.

---

# PHẦN 1 — KIẾN THỨC NỀN TẢNG CẦN NẮM

## 1.1 Quản lý state: Riverpod

**Vấn đề nó giải quyết:** Flutter cần một cách để tách "dữ liệu + logic nghiệp vụ" ra khỏi widget, để widget chỉ lo render, và để nhiều widget khác nhau có thể đọc cùng một nguồn state mà không cần truyền qua constructor (prop drilling) hay dùng `InheritedWidget` thủ công.

**Các khối chính:**
- `Provider<T>` — cung cấp một giá trị/instance không đổi hoặc tính toán từ provider khác (ví dụ một service).
- `Notifier<T>` — state đồng bộ, có method để thay đổi state (`state = ...`). Dùng khi không cần chờ I/O lúc khởi tạo.
- `AsyncNotifier<T>` — giống `Notifier` nhưng `build()` là `Future<T>`, dùng khi state cần được nạp bất đồng bộ (gọi API, đọc storage) lúc khởi tạo. State bên ngoài là `AsyncValue<T>` — tự động có 3 trạng thái `loading` / `data` / `error`.
- `StreamProvider` / `StreamProvider.family` — bọc một `Stream` (ví dụ Firestore `snapshots()`) thành `AsyncValue<T>` tự cập nhật mỗi khi stream bắn dữ liệu mới.
- `ref.watch(provider)` — subscribe, widget/provider gọi nó sẽ rebuild mỗi khi provider đổi giá trị.
- `ref.read(provider)` — đọc một lần, không subscribe. Dùng trong event handler (`onPressed`, v.v.) để tránh rebuild thừa.

**Khi nào chọn cái nào:**
- Domain state cần async lúc khởi tạo (auth session, load từ cache/API) → `AsyncNotifier`.
- State thuần UI/form, không cần I/O ngay khi tạo → `Notifier`.
- Cần lắng nghe dữ liệu real-time từ nguồn ngoài (Firestore, WebSocket) → `StreamProvider`.
- Loading/error của một request nên nằm ở `AsyncValue`, **không** nhét vào domain model — tách "dữ liệu nghiệp vụ" khỏi "trạng thái vận hành tạm thời" giúp model không phình to và không có 2 nơi cùng giữ lỗi.

## 1.2 Điều hướng: GoRouter, route guard, StatefulShellRoute

**Vấn đề nó giải quyết:** app có nhiều role (admin/manager/user), mỗi role có khu vực riêng; cần một nơi tập trung quyết định "user này được vào route nào", và cần giữ được state của từng tab khi chuyển qua lại giữa các tab đáy (bottom nav) thay vì rebuild từ đầu mỗi lần.

**Khái niệm:**
- **Route guard / redirect** — hàm `redirect` chạy trước khi vào một route, trả về route khác nếu cần chặn (chưa đăng nhập, sai role...), trả `null` nếu cho qua.
- **`refreshListenable`** — GoRouter cần biết khi nào state auth đổi để tính lại redirect; nó lắng nghe một `Listenable` (thường bọc quanh 1 provider) và tự re-evaluate route khi có `notifyListeners()`.
- **`StatefulShellRoute.indexedStack`** — giữ 1 `Navigator` riêng cho mỗi tab (branch), dùng `IndexedStack` để ẩn/hiện thay vì destroy — chuyển tab không mất scroll position hay state form đang nhập dở.
- **Race condition khi bootstrap auth** — nếu router redirect trước khi biết chắc user đã đăng nhập hay chưa (ví dụ đang gọi API để lấy role), có thể redirect sai. Cách xử lý chuẩn: có một trạng thái "đang tải" rõ ràng (splash) trước khi cho router quyết định route cuối.

## 1.3 Firebase Authentication + JWT (ID Token)

**Vấn đề nó giải quyết:** xác thực "user này là ai" (identity) một cách an toàn, không tự viết hệ thống mật khẩu/băm/salt từ đầu.

**Khái niệm cốt lõi:**
- **ID Token là một JWT** — gồm 3 phần `header.payload.signature`, base64url-encode. Payload chứa các claim chuẩn: `iat` (issued-at), `exp` (expiry), `auth_time` (lúc xác thực gốc), và `firebase.sign_in_provider` (phương thức đăng nhập).
- **Access token vs refresh token** — access token (ID token) sống ngắn, dùng gọi API; refresh token sống lâu hơn, SDK tự dùng ngầm để xin access token mới, app hiếm khi động vào trực tiếp. `getIdToken(true)` ép lấy token mới ngay.
- **Nhiều Identity Provider cho cùng 1 user** — email/password và Google là hai "phương thức đăng nhập" khác nhau nhưng có thể trỏ về cùng 1 tài khoản Firebase nếu được **link** chủ động (`linkWithCredential`). Firebase **không tự động merge** — nếu cùng email đăng ký ở 2 phương thức khác nhau mà không link, sẽ gặp lỗi `account-exists-with-different-credential` hoặc `email-already-in-use`.
- **`fetchSignInMethodsForEmail()` đã lỗi thời** — khi bật email-enumeration protection, API này không còn trả danh sách phương thức theo email (tránh lộ thông tin "email này có tồn tại không"). Nên xử lý theo exception (`account-exists-with-different-credential`...) thay vì hỏi trước.
- **Identity vs Authorization là hai lớp khác nhau** — Firebase Auth chỉ trả lời "user này có tồn tại và token có hợp lệ không". Nó **không** biết và không nên quyết định "user này được làm gì" (role/quyền) — đó là trách nhiệm của domain/backend.

## 1.4 Kiến trúc backend: Express middleware chain + xác thực token phía server

**Vấn đề nó giải quyết:** client (Flutter) không thể tự khai "tôi là admin" — phải có một bên thứ ba (backend, có Service Account) verify chữ ký token rồi mới quyết định quyền.

**Khái niệm:**
- **Middleware chain** trong Express — mỗi middleware xử lý 1 việc, gọi `next()` để đi tiếp; đặt đúng thứ tự là một phần thiết kế (verify token → load/provision user → route xử lý nghiệp vụ).
- **Firebase Admin SDK `verifyIdToken()`** — verify chữ ký + hạn token bằng service-account credential, trả về payload đã giải mã (`uid`, `email`...). Khác với client SDK — Admin SDK có quyền cao hơn (tạo user, set custom claims, đọc/ghi bỏ qua Security Rules).
- **Fail closed, không fail open** — nếu bước xác thực/role bootstrap thất bại, hệ thống nên từ chối (401/403) hoặc coi là lỗi cần retry, **không** nên tự ý gán quyền mặc định thấp hơn một cách âm thầm hoặc — tệ hơn — cho qua.
- **Upsert pattern (`INSERT ... ON CONFLICT DO UPDATE`)** — cách chuẩn để "tạo nếu chưa có, cập nhật nếu đã có" trong 1 câu SQL atomic, tránh race condition giữa "check tồn tại" và "insert" (TOCTOU).
- **Role là domain data, không phải identity** — quyết định role nên nằm ở database mà backend kiểm soát, không nên tin field do client tự gửi lên, và không nên suy luận role từ loại provider đăng nhập (Google/email không nói lên ai là admin).

## 1.5 PostgreSQL qua backend riêng

**Vấn đề nó giải quyết:** dữ liệu có ràng buộc nghiệp vụ rõ ràng (role hợp lệ, số tiền không âm, quan hệ user↔transaction) — phù hợp với một relational DB có `CHECK constraint`, `FOREIGN KEY`, transaction, hơn là một NoSQL document store.

**Khái niệm:**
- **Parameterized query (`$1, $2...`)** — bắt buộc để tránh SQL injection; không bao giờ nội suy chuỗi trực tiếp vào câu SQL.
- **`CHECK` constraint** — ràng buộc ở tầng DB (ví dụ `amount >= 0`, `role IN (...)`) — an toàn hơn chỉ validate ở application layer vì DB không thể bị bypass.
- **Row-level authorization ở tầng ứng dụng** — khi DB không có khái niệm "user đang gọi request là ai" (khác Firestore Security Rules), backend phải tự so khớp: ai được sửa/xoá 1 dòng dựa trên cột như `created_by` hoặc việc uid có nằm trong mảng `member_ids` không.
- **Migration / schema versioning theo kiểu "chạy lại vẫn an toàn" (idempotent)** — `CREATE TABLE IF NOT EXISTS`, `ADD CONSTRAINT` sau khi `DROP CONSTRAINT IF EXISTS` — cho phép chạy migration nhiều lần mà không lỗi, phù hợp một service khởi động lại thường xuyên (thay vì một hệ thống migration tool riêng như Flyway/Prisma Migrate).

## 1.6 Cloud Firestore — khi nào dùng, khi nào không, Security Rules

**Vấn đề nó giải quyết:** cần dữ liệu **real-time, nhiều client cùng đọc**, có offline cache sẵn (built-in bởi SDK) mà không tự xây cơ chế sync.

**Khái niệm:**
- **Không phải local storage** — Firestore là cloud database thật; local cache của SDK chỉ là bản sao tạm để đọc nhanh/offline, nguồn sự thật vẫn ở cloud.
- **`snapshots()` / real-time listener** — mở kết nối, trả state hiện tại ngay, sau đó bắn lại mỗi khi có thay đổi — khác hẳn REST (chỉ trả 1 lần tại thời điểm gọi).
- **Security Rules là access-control layer bắt buộc**, không phải tùy chọn — client chỉ là nơi gửi request, Rules mới là nơi quyết định ai đọc/ghi được gì. Admin SDK (phía backend) **bypass Rules hoàn toàn**.
- **Khi nào KHÔNG nên dùng Firestore:** dữ liệu cần quan hệ phức tạp/aggregate nặng/reporting, hoặc tick data tần suất rất cao (như giá chứng khoán) — khi đó WebSocket hoặc time-series DB hợp lý hơn.
- **Khi nào hợp:** dashboard/nội dung cần đồng bộ nhẹ nhàng nhiều thiết bị, dữ liệu ít ràng buộc quan hệ.

## 1.7 Offline-first / local cache: Hive + cache-aside pattern

**Vấn đề nó giải quyết:** app cần **hiển thị dữ liệu ngay lập tức** khi mở màn hình (Instant UI) thay vì màn hình trắng chờ network, và vẫn dùng được (ở mức đọc) khi mất mạng.

**Khái niệm:**
- **Hive** — key-value NoSQL storage thuần Dart, nhanh, không cần native binding như SQLite; hợp cho object đơn giản không cần query quan hệ phức tạp.
- **`@HiveType` / `@HiveField` + `build_runner` codegen** — sinh `TypeAdapter` để Hive biết serialize/deserialize object Dart thành bytes.
- **Cache-aside pattern ("Instant UI")** — luồng chuẩn:
  1. Đọc cache trước, có dữ liệu thì trả ngay cho UI hiển thị.
  2. Song song (không block UI) gọi API lấy dữ liệu mới nhất.
  3. Nếu thành công: ghi đè cache + cập nhật state cho UI. Nếu lỗi: âm thầm giữ nguyên dữ liệu cache đang hiển thị (không làm gián đoạn trải nghiệm vì user đã thấy dữ liệu rồi).
- **Server luôn là nguồn sự thật (source of truth)** — cache chỉ là bản sao để hiển thị nhanh, không tự merge/giải quyết xung đột phức tạp trừ khi có nhu cầu thật (ví dụ so `updatedAt`).
- **Khi nào chọn Hive thay vì SQLite/Isar:** dữ liệu không cần JOIN/filter phức tạp, không cần transaction đa bảng. Khi cần quan hệ hoặc query nặng thì SQLite/Isar hợp hơn.

## 1.8 Animation: Implicit vs Explicit, CustomPainter

**Vấn đề nó giải quyết:** UI cần chuyển động mượt để phản ánh thay đổi dữ liệu — có loại cần rất ít code (implicit), có loại cần kiểm soát chính xác từng frame theo dữ liệu (explicit).

**Khái niệm:**
- **Implicit animation** (`AnimatedContainer`, `AnimatedOpacity`...) — chỉ đổi giá trị thuộc tính, Flutter tự nội suy (interpolate) giữa giá trị cũ/mới. Đơn giản nhưng khó kiểm soát tiến trình chi tiết hoặc đồng bộ nhiều phần.
- **Explicit animation** (`AnimationController` + `Tween`/`CurvedAnimation` + `AnimatedBuilder`) — tự điều khiển tiến trình 0→1 theo thời gian mình định nghĩa, bắt buộc `dispose()` controller để tránh leak. Dùng khi cần vẽ theo dữ liệu (chart, progress ring) hoặc đồng bộ nhiều hiệu ứng.
- **`CustomPainter`** — vẽ trực tiếp lên `Canvas` bằng các API hình học (`drawArc`, `Paint`...) thay vì ghép widget có sẵn; cần khi hình dạng không có widget chuẩn nào đáp ứng (biểu đồ, progress ring).
- **`shouldRepaint`** — quyết định painter có cần vẽ lại hay không; trả `true` sai/thừa gây lãng phí CPU, trả `false` sai gây UI không cập nhật.

---

# PHẦN 2 — KIẾN THỨC ĐÃ ÁP DỤNG TRONG POCKET SPLIT

> Mọi tham chiếu dưới đây là đường dẫn tương đối trong repo `pocket_split` (`D:\Flutter\pocket_split` — repo Git riêng biệt, không phải `lexi-core`).

## 2.1 Riverpod trong Pocket Split — bằng chứng cụ thể

| Provider | Loại | Vì sao chọn loại đó |
|---|---|---|
| `authProvider` (`lib/providers/auth/auth_provider.dart:325`) | `AsyncNotifierProvider<AuthRoleNotifier, AuthState>` | `build()` phải `await` gọi `GET /me` để biết role → cần async lúc khởi tạo |
| `accountProvider` (`lib/providers/account/account_provider.dart:87`) | `NotifierProvider<AccountEditNotifier, AccountEditState>` | Form edit profile — state khởi tạo lấy trực tiếp từ `FirebaseAuth.instance.currentUser` (đồng bộ, không cần `await`) |
| `userSplitsApiProvider` (`lib/providers/user/user_splits_provider.dart:186`) | `AsyncNotifierProvider<UserSplitsApiNotifier, List<SplitItem>>` | `build()` đọc cache Hive rồi có thể fetch async |
| `settingsContentProvider` (`lib/providers/settings/settings_content_provider.dart:8`) | `StreamProvider.family<SettingsContent?, AccountRole>` | Bọc `snapshots()` của Firestore — tự update khi Console đổi dữ liệu, không cần refresh tay |

**Domain state tách khỏi loading/error** — đúng nguyên tắc ở Phần 1.1: `AuthState` (`lib/models/auth/auth_state.dart`) chỉ có `isLoggedIn`, `role`, `uid`, `email`, `displayName` — **không** có `isLoading`/`error`. UI đọc loading/error qua `AsyncValue` bọc ngoài (`authState.isLoading`, `authState.error` — xem `lib/screens/login_screen.dart:115-117`).

**`clearTransientError()`** (`auth_provider.dart:47-50`):
```dart
void clearTransientError() {
  final current = state.valueOrNull;
  state = AsyncData(current ?? const AuthState(isLoggedIn: false));
}
```
Lý do cần hàm riêng thay vì set `null`: lỗi có thể đang nằm trong `AsyncValue.error` của Riverpod (không phải biến local), nên phải ép `state` về lại `AsyncData` để đá lỗi cũ ra khỏi provider. Được gọi từ `login_screen.dart:44` mỗi khi user gõ lại vào ô input (`_clearErrors`, gắn qua `TextEditingController.addListener`).

## 2.2 GoRouter — route guard + role area thực tế trong `app_router.dart`

- **`refreshListenable: _AuthListenable(ref)`** (dòng 19, class định nghĩa dòng 69-73) — bọc `ref.listen(authProvider, ...)` thành `ChangeNotifier`, để GoRouter tự tính lại `redirect` mỗi khi `authProvider` đổi giá trị (đăng nhập/đăng xuất/role thay đổi).
- **`redirect` toàn cục** (dòng 20-24) gọi `_redirectForLocation` (dòng 75-92):
  - Chưa đăng nhập → chỉ cho vào `/login`, mọi route khác bị đá về `/login`.
  - Đã đăng nhập, đang ở `/` hoặc `/login` → đẩy về `role.homePath` (`/admin/dashboard`, `/manager/overview`, hoặc `/user/home` — định nghĩa ở `lib/models/account/account_role.dart:16-20`).
  - Đã đăng nhập nhưng path không nằm trong `role.rootPath` của chính mình (ví dụ user thường gõ URL `/admin/...`) → đá về `homePath` của role đó. Đây chính là chỗ chặn **truy cập trái phép ở tầng điều hướng**, không phải ở tầng UI.
  - `authState == null` (chưa bootstrap xong) → `return null`, **không redirect gì cả** — đây là cách né race-condition mô tả ở Phần 1.2: nếu chưa biết auth state thật sự là gì, không được đoán.
- **`StatefulShellRoute.indexedStack`** — 3 khu vực `_adminShell`/`_managerShell`/`_userShell` (dòng 94-286), mỗi khu vực là 1 `StatefulShellRoute` riêng với nhiều `StatefulShellBranch` (mỗi tab đáy = 1 branch = 1 Navigator riêng) — chuyển tab (`Dashboard`/`Users`/`Account`/`Settings`) không mất state của tab kia. `RoleShellScaffold` (`lib/widgets/role_shell_scaffold.dart`) là UI dùng chung cho cả 3 khu vực, nhận `navigationShell.currentIndex`/`goBranch` để build `BottomNavigationBar`.
- **Route alias cũ → mới**: nhiều `GoRoute` chỉ làm nhiệm vụ `redirect` sang path mới (`/member/splits` → `/user/splits`, dòng 46-48) — dấu vết còn lại từ thời app dùng thuật ngữ "member" trước khi đổi sang "user" (khớp với `_normalizeRoleName` ở §2.3 và cột `role` DB có `CASE WHEN role = 'member' THEN 'user'` ở nhiều route backend).

## 2.3 Firebase Auth — luồng thật, kể cả các nhánh lỗi

**Luồng đăng nhập cơ bản** (`auth_provider.dart:97-109`, `signInWithEmail`): validate ở UI trước (`login_screen.dart:54-67` — email/password rỗng chặn trước khi chạm Firebase) → `state = AsyncLoading()` → `AsyncValue.guard(...)` tự bắt exception và convert thành `AsyncError` → gọi `_stateFromUser` để lấy role từ backend.

**`_stateFromUser`** (dòng 70-88) là cầu nối Firebase → backend:
```dart
final idToken = await user.getIdToken();
final response = await http.get(Uri.parse('$_baseUrl/me'),
    headers: {'Authorization': 'Bearer $idToken'});
...
final roleStr = _normalizeRoleName(data['role'] as String?);
return AuthState(isLoggedIn: true, role: AccountRole.values.byName(roleStr), ...);
```
Đây chính là minh chứng cho nguyên tắc "Firebase lo identity, backend lo role" ở Phần 1.3/1.4 — role **không bao giờ** lấy trực tiếp từ Firebase user object.

**Account linking Google ↔ email/password** — đây là phần phức tạp nhất của app, xử lý đúng 2 chiều:
- **Đã có Google, giờ thêm password cùng email** — `signUpWithEmail` bắt `email-already-in-use` (dòng 131-141), lưu tạm `_pendingPasswordEmail`/`_pendingPassword`, ném lại lỗi `account-exists-with-different-credential` cho UI hiển thị đúng thông điệp. Sau khi user sign-in lại bằng Google thành công, `_linkPendingPasswordCredentialIfNeeded` (dòng 253-283) được gọi, gửi `POST /auth/link-email-password` lên backend — backend gọi thẳng REST API `identitytoolkit.googleapis.com/v1/accounts:signUp` với `idToken` hiện tại để gắn thêm password vào **cùng** Firebase UID (`backend/src/routes/auth.js:41-53`). Lý do phải qua REST API thấp cấp: Admin SDK không có hàm "link password vào user đang đăng nhập" — chỉ có thao tác quản trị (set password trực tiếp, không qua flow "link credential" đúng chuẩn OAuth).
- **Đã có password, giờ thêm Google cùng email** — `signInWithGoogle` bắt `account-exists-with-different-credential` (dòng 164-177), lưu `_pendingGoogleCredential`, để `_linkPendingGoogleCredentialIfNeeded` (dòng 231-251) gọi `user.linkWithCredential(pendingCredential)` **client-side** ngay sau khi user đăng nhập lại bằng password — trường hợp này link được thẳng bằng SDK vì đang cầm `AuthCredential` hợp lệ, không cần qua backend.
- Toàn bộ state "đang chờ link" (`_pendingGoogleCredential`, `_pendingPasswordEmail`...) được giữ **trong bộ nhớ của Notifier**, xoá bằng `_clearPendingLinkState()` sau khi link xong hoặc khi logout (dòng 181-186) — không persist, vì đây chỉ là state của một phiên thao tác đang diễn ra.

**JWT / token diagnostics — tính năng học thuật, không phải nghiệp vụ thật:** `inspectIdToken`, `compareTokenRefresh`, `_decodeJwtPayload` (dòng 200-322) tự giải mã payload JWT (base64url decode phần giữa của `header.payload.signature`) để đọc `iat`/`exp`/`auth_time`/`sign_in_provider`, hiển thị ở `SettingsScreen` (`_TokenDiagnosticsCard`, `lib/screens/settings_screen.dart:121-282`). Đây là tính năng **cố tình dựng lên để tự kiểm chứng lý thuyết** access-token/refresh-token (đúng tinh thần Phần 1.3) — không phục vụ nghiệp vụ chia tiền, nhưng là bằng chứng sống bạn hiểu vòng đời token thay vì chỉ học thuộc khái niệm.

## 2.4 Backend Express — middleware chain thật trong `index.js`

```js
app.use(verifyToken);   // backend/src/middleware/auth.js
app.use(loadUser);      // backend/src/middleware/load_user.js
app.use('/auth', authRouter);
app.use('/me', meRouter);
app.use('/users', usersRouter);
app.use('/splits', splitsRouter);
```
(`backend/src/index.js:24-31`) — đúng thứ tự bắt buộc: **verify token trước, provision/load user sau, route nghiệp vụ chạy cuối cùng**. Nếu đảo `loadUser` lên trước `verifyToken`, `req.user` sẽ chưa tồn tại và middleware crash — thứ tự này là một phần thiết kế, không phải tình cờ.

**`verifyToken`** (`backend/src/middleware/auth.js:9-24`) — đọc header `Authorization: Bearer <idToken>`, gọi `admin.auth().verifyIdToken(idToken, true)` (tham số `true` = check thêm token revocation), thất bại thì trả `401` ngay, không cho đi tiếp.

**`loadUser` = auto-provisioning bằng upsert** (`backend/src/middleware/load_user.js:18-40`):
```js
const result = await db.query(
  `INSERT INTO users (uid, email, display_name, role)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (uid) DO UPDATE
     SET email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         role = CASE WHEN users.role = 'member' THEN 'user' ELSE users.role END,
         updated_at = NOW()
   RETURNING role`,
  [uid, email, name || null, defaultRole],
);
```
- Đây chính là câu trả lời thật cho "user signup xong nhưng đóng app trước khi chạm backend thì sao": **không sao** — lần đầu tiên bất kỳ request nào của user đó chạm middleware này (không nhất thiết phải là `/me`), row DB tự được tạo. Không có "provisioning step" riêng nào khác.
- `defaultRole` chỉ dùng khi **INSERT lần đầu** (`ADMIN_UIDS.includes(uid) ? 'admin' : 'user'`, dòng 21) — khi `ON CONFLICT` (đã tồn tại), role **không** bị ghi đè bởi `defaultRole`, chỉ tự sửa `'member'` cũ thành `'user'`. Đây là chỗ dễ bị hỏi xoáy: *"nếu admin đổi role user khác qua `PATCH /users/:uid/role`, lần login sau của user đó role có bị ghi đè về default không?"* — Không, vì nhánh `ON CONFLICT` giữ nguyên `users.role` hiện có (trừ giá trị `'member'` cũ).

**`requireRole`** (`backend/src/middleware/require_role.js`) — middleware factory `requireRole(...roles)`, chỉ dùng ở `users.js` cho endpoint admin-only (list users, tạo manager, đổi role) — minh chứng phân quyền theo route chứ không theo global check.

**Row-level check thủ công trong `splits.js`** (vì PostgreSQL không có Security Rules như Firestore): `PATCH /splits/:id` và `DELETE /splits/:id` tự so khớp `existing.createdBy === req.user.uid || memberIds.includes(req.user.uid)` (dòng 115, 171) trước khi cho sửa/xoá — đây là cách thủ công thực hiện đúng nguyên tắc "row-level authorization ở tầng ứng dụng" của Phần 1.5.

## 2.5 PostgreSQL — schema thật (`db.js`)

- `users.role` có `CHECK (role IN ('admin', 'manager', 'user'))` — ràng buộc tầng DB, không tin tưởng application code validate đủ.
- `splits.amount` có `CHECK (amount >= 0)` — không cho số âm ở tầng DB dù application có bug bỏ sót check.
- `splits.created_by REFERENCES users(uid) ON DELETE CASCADE` — xoá user thì xoá luôn splits của họ tạo ra (quyết định nghiệp vụ, đáng để nêu ra và giải thích được lý do khi bị hỏi "tại sao CASCADE mà không SET NULL").
- `member_ids TEXT[]` + `GIN index` (`idx_splits_member_ids`) — mảng UID thành viên, index GIN để query `$1 = ANY(member_ids)` (dùng ở `GET /splits`, dòng 36) nhanh — đây là ví dụ thật về khi PostgreSQL cũng làm được việc "mảng thành viên" mà không cần bảng join riêng, đổi lại truy vấn phức tạp hơn (join thật) sẽ khó hơn.
- **Migration tự chạy khi khởi động** (`ensureSchema()`, gọi ở `index.js:34` trước khi `app.listen`) — không dùng tool migration riêng; toàn bộ là `CREATE TABLE IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS` rồi `ADD CONSTRAINT` lại (dòng 33-44) — đây chính là cách dự án xử lý việc đổi từ role `'member'` sang `'user'` giữa chừng dự án (pivot) mà không cần viết migration script riêng.

## 2.6 Firestore trong Pocket Split — cố tình bị giới hạn phạm vi

`firestore.rules` thật:
```
match /splits/{splitId} {
  allow read: if isSplitUser(resource.data);
  allow create, update, delete: if false;
}
match /users/{uid} {
  allow read: if signedIn() && request.auth.uid == uid;
  allow create, update, delete: if false;
}
match /settings_content/{roleDoc} {
  allow read: if signedIn();
  allow create, update, delete: if false;
}
```
Điểm quan trọng nhất khi bị hỏi: **client không được ghi bất cứ collection nào** (`allow create, update, delete: if false` ở cả 3 match block). Đây là quyết định kiến trúc rõ ràng: **Firestore trong app này chỉ đóng vai trò đọc/stream** (demo `settings_content` dùng `StreamProvider`, xem §2.1) — mọi ghi dữ liệu thật (`splits`) đi qua backend PostgreSQL, không qua Firestore client SDK. README (`README.md:29-33`) và `docs/firestore-user-setup.md` xác nhận lại: *"Personal finance transactions are managed by the backend, not by Firestore."*

Đây là ví dụ sống cho nguyên tắc "Firestore không thay thế backend" ở Phần 1.6 — dự án **có** Firestore, nhưng cố tình giới hạn nó vào đúng use case nó mạnh nhất (nội dung cần đồng bộ nhẹ, đọc real-time) và không dùng nó cho dữ liệu có ràng buộc nghiệp vụ (số tiền, quyền sửa/xoá) — việc đó giao hẳn cho PostgreSQL + backend.

## 2.7 Offline-first thật: `SplitsCacheService` + `UserSplitsApiNotifier`

`splits_cache_provider.dart` — Hive box `'splits_box'`, key = `split.id`, các thao tác cơ bản `getCachedSplits`/`saveSplits`/`saveSplit`/`deleteSplit`/`clearCache`. `SplitItem` là `HiveObject` với `@HiveType(typeId: 0)` (`lib/models/user/split_item.dart:6-33`), file `.g.dart` sinh bởi `build_runner` chứa `TypeAdapter`.

**Luồng "Instant UI" đúng như mô tả lý thuyết ở Phần 1.7, đọc thẳng từ `build()`** (`user_splits_provider.dart:27-41`):
```dart
Future<List<SplitItem>> build() async {
  _cache = ref.watch(splitsCacheServiceProvider);
  final cached = await _cache.getCachedSplits();
  if (cached.isNotEmpty) {
    _sortSplits(cached);
    _backgroundFetch();          // không await — chạy nền
    return cached;                // trả ngay cho UI, không đợi network
  }
  return _fetchAndCacheSplits();  // lần đầu chưa có cache → phải chờ network
}
```
`_backgroundFetch` (dòng 48-55) **nuốt lỗi có chủ đích** (`catch (_) {}`) — đúng nguyên tắc "server là nguồn sự thật nhưng không được làm gián đoạn trải nghiệm khi mạng lỗi": nếu fetch nền thất bại, app vẫn giữ nguyên dữ liệu cache đang hiển thị, không hiện lỗi, không rollback UI.

Mọi thao tác ghi (`createSplit`/`editSplit`/`deleteSplit`, dòng 71-151) đều gọi API trước rồi `await refresh()` — tức là **ghi luôn ưu tiên network**, cache chỉ đồng bộ lại sau khi server xác nhận thành công. Đây là điểm khác với "outbox pattern" đầy đủ (lưu thao tác offline rồi tự đồng bộ khi có mạng lại) — dự án **chưa** làm outbox, ghi khi mất mạng sẽ throw lỗi thẳng, không queue lại. Nếu bị hỏi "vậy offline có ghi được không" — câu trả lời thật là: **đọc offline được (cache), ghi thì chưa** — trung thực điểm này quan trọng hơn là nói quá.

## 2.8 `FinanceRingChart` — CustomPainter + Explicit animation thật

`lib/widgets/finance_ring_chart.dart`:
- `_FinanceRingChartState` dùng `SingleTickerProviderStateMixin` + `AnimationController(duration: 1100ms)` + `CurvedAnimation(curve: Curves.easeOutCubic)` (dòng 25-40) — **explicit animation**, không phải `AnimatedContainer`.
- `didUpdateWidget` (dòng 43-51): nếu `paidAmount`/`unpaidAmount` đổi (ví dụ user vừa đánh dấu 1 split "đã trả"), controller `reset()` rồi `forward()` lại — chart animate lại từ đầu mỗi lần dữ liệu thay đổi, không chỉ animate 1 lần lúc mount.
- `AnimatedBuilder` (dòng 69) rebuild lại `CustomPaint` mỗi frame theo `_animation.value` — `_RingChartPainter.paint()` (dòng 160-198) tính `paidSweep`/`unpaidSweep` = góc cung tỉ lệ theo `animationValue` × `paidFraction`, vẽ 2 `drawArc` nối tiếp nhau bắt đầu từ góc `-π/2` (12 giờ).
- `shouldRepaint` (dòng 200-207) so sánh từng field — chỉ vẽ lại khi `paidFraction`/`animationValue`/màu thực sự đổi, không phải mỗi lần `build()` widget cha chạy.
- `dispose()` (dòng 54-57) huỷ `_controller` — nếu quên dòng này, `AnimationController` tiếp tục chạy ticker sau khi widget đã unmount → leak.

## 2.9 Diễn tiến dự án thật (dùng cho câu "kể tiến trình bạn xây dự án này")

Lịch sử commit thật (17 commit), đọc theo thứ tự thời gian tăng dần:

1. `77dde82` — khởi tạo project, auth + role-based routing sơ khai.
2. `23e47d1` — tái cấu trúc theo layer MVVM (`providers/`/`screens/`/`models/`).
3. `604b39f` — tổ chức lại màn hình theo role (`screens/admin/`, `screens/manager/`, `screens/user/`).
4. `fa10b02` — thêm auth flow đầy đủ + account editing + kết nối backend + Firebase thật (đây là commit lớn nhất về hạ tầng).
5. `cc2d7cd` — fix: validate input trước khi gọi Firebase, xoá `AsyncError` cũ khi user gõ lại (chính là `clearTransientError`).
6. `f2d61aa` — thêm Google Sign-In + flow verify email khi đổi.
7. `56f1efb` — thêm account-linking flows (2 chiều Google↔password).
8. Vài commit docs xen giữa — cập nhật interview notes song song với từng bước code (thói quen ghi lại lý do quyết định ngay khi vừa làm).
9. `05a6a28` — **pivot**: chuyển từ group-expense-split sang personal finance tracker (quyết định sản phẩm, không phải kỹ thuật — feature nhóm/chia tiền bị lùi vào backlog, xem `docs/group-features-todo.md`).
10. `ea2843c` — tổ chức lại theo domain folder sau pivot.
11. `f2f28d1` — hoàn thành phần CustomPainter + implicit/explicit animation (`FinanceRingChart`).
12. `e375780` — thêm offline-first caching bằng Hive cho splits.
13. `b051192` — cập nhật interview notes với kinh nghiệm offline-first/Hive.

**Câu chuyện 60 giây rút ra từ lịch sử này** (dùng để trả lời "kể về dự án"): *"Mình bắt đầu từ một app chia tiền nhóm nhiều role, dựng auth + role-based routing trước. Sau khi auth ổn, mình nhận ra phần khó nhất không phải là chia tiền mà là quản lý danh tính đúng cách — nên đào sâu vào account linking Google/email, JWT lifecycle. Giữa chừng mình pivot sản phẩm sang personal finance tracker đơn giản hơn để tập trung làm sâu 2 mảng: offline-first (Hive, Instant UI) và animation có kiểm soát (CustomPainter cho biểu đồ), thay vì dàn trải nhiều tính năng nhóm chưa vững nền."*

## 2.10 Khoảng trống thật cần biết trung thực (để không bị hỏi xoáy trúng)

Đối chiếu code thật với các câu trả lời mẫu trong `docs/mobile-developer-interview-pocket-split.md` (repo Pocket Split), có vài chỗ **tài liệu cũ nói nhưng code chưa làm** — nếu bị hỏi đúng chỗ này, trả lời đúng thực tế sẽ đáng tin hơn nhiều so với lặp lại câu mẫu:

| Điều tài liệu cũ ngụ ý | Thực tế trong code | Nên trả lời sao |
|---|---|---|
| Dùng `flutter_secure_storage` để lưu token/role an toàn | Có trong `pubspec.yaml` nhưng **không được import/gọi ở đâu trong `lib/`** — session hoàn toàn đến từ `FirebaseAuth.instance` reactive stream, không có bước lưu thủ công nào | *"Đây là dependency mình thêm sẵn cho hướng đó nhưng thực tế Firebase SDK tự quản lý session persistence rồi nên chưa cần dùng đến — nếu cần lưu thêm dữ liệu nhạy cảm ngoài phạm vi SDK thì đây sẽ là lựa chọn."* |
| Có "outbox" để ghi offline rồi tự sync khi có mạng | Chưa có — `createSplit`/`editSplit`/`deleteSplit` gọi API thẳng, lỗi thì throw, không queue | *"Hiện tại mới làm được đọc offline (cache-aside), ghi offline có outbox là hướng mở rộng tiếp theo."* |
| Base URL linh hoạt theo môi trường | `const _baseUrl = 'http://10.0.2.2:3000'` hard-code trong cả `auth_provider.dart`, `account_provider.dart`, `user_splits_provider.dart` — chỉ chạy đúng trên Android emulator | *"Đây là giá trị dev-only, biết rõ giới hạn — sản phẩm thật cần chuyển qua build flavor/`--dart-define` theo môi trường."* |
| Custom claims / role trong token | Role không nằm trong Firebase custom claims, luôn phải gọi `GET /me` mỗi lần cần biết role | Đúng như tài liệu mô tả — đây là một trade-off **có chủ đích**, không phải thiếu sót (xem lý do ở Phần 1.4/2.3) |
| CI/CD | Không có workflow CI/CD nào trong repo (`.github/` chỉ có prompts/skills cho AI, không có Actions build/test) | *"Build/release hiện vẫn thủ công, đúng như checklist phỏng vấn đã note — CI/CD là điểm biết mình còn thiếu."* |

---

## Checklist ôn nhanh trước phỏng vấn

- [ ] Giải thích được vì sao `AuthState` không có `isLoading`/`error`, và domain state khác UI state ở chỗ nào.
- [ ] Vẽ được (bằng lời) luồng: Flutter lấy ID token → gửi backend → `verifyToken` → `loadUser` upsert → trả role → Flutter dựng `AuthState`.
- [ ] Giải thích được 2 chiều account-linking (Google→password và password→Google) khác nhau ở chỗ nào (1 chiều gọi backend REST API, 1 chiều gọi thẳng SDK) và vì sao.
- [ ] Giải thích được vì sao role không nằm trong Firebase custom claims mà phải gọi `/me`.
- [ ] Kể được luồng cache-aside "Instant UI" bằng đúng 3 bước, chỉ ra dòng code cụ thể trong `build()`.
- [ ] Giải thích được vì sao Firestore Rules chặn ghi hoàn toàn (`allow create, update, delete: if false`) — Firestore chỉ đọc/stream, ghi thật đi qua backend.
- [ ] Phân biệt được implicit vs explicit animation bằng ví dụ thật (`FinanceRingChart` là explicit, vì sao).
- [ ] Kể được câu chuyện pivot sản phẩm (group-split → personal finance) bằng 2-3 câu, không né tránh.
- [ ] Thành thật được về các khoảng trống ở mục 2.10 khi bị hỏi trúng, không bịa câu trả lời khớp tài liệu cũ.
