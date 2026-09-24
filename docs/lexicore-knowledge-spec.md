# LexiCore — Spec Kiến Thức Dự Án

**Mục đích tài liệu này:** giống hệt tinh thần bản Pocket Split ([`docs/pocket-split-knowledge-spec.md`](pocket-split-knowledge-spec.md)) — bạn là người đưa ý tưởng/định hướng, AI viết phần lớn code, nhưng khi bị hỏi "bạn đã làm gì" thì câu trả lời phải là **hiểu vì sao code viết vậy và tự sửa/mở rộng được**, không phải "AI viết hết". Hai phần:

- **Phần 1 — Kiến thức nền tảng:** khái niệm chung, trả lời được kể cả không mở code.
- **Phần 2 — Áp dụng trong LexiCore:** đúng file, đúng dòng, đúng luồng thật trong dự án — để chỉ thẳng vào code khi bị hỏi "cho ví dụ cụ thể".

LexiCore lớn hơn Pocket Split nhiều (Flutter mobile + React web + Cloud Functions + Cloud Run, hàng trăm commit qua nhiều "Plan"), nên tài liệu này **không** cố phủ hết mọi tính năng — nó chọn **13 mảng kiến thức** có giá trị nhất khi bị phỏng vấn kỹ thuật, đều đã đối chiếu trực tiếp với code hiện tại (không chỉ dựa vào README/CLAUDE.md).

**Cấu trúc:** Phần 1 và Phần 2 **đánh số tương ứng 1–1** (mục 1.7 ↔ 2.7...). Mỗi mục ở Phần 1 theo cùng một khuôn — *Vấn đề nó giải quyết → Khái niệm cốt lõi → Cách hoạt động → Khi nào dùng/không dùng → Bẫy thường gặp → Câu hỏi phỏng vấn hay gặp* — để đọc xong Phần 1 là nắm được bản chất **không cần mở code**, rồi sang Phần 2 xem nó nằm ở đâu trong code thật (kèm chỗ khác biệt với Pocket Split và các thoả hiệp/điểm yếu có thật).

> ⚠️ **Phát hiện quan trọng khi soạn tài liệu này:** `README.md` hiện vẫn mô tả *"Offline-first: Hive là nguồn dữ liệu chính"* — **không còn đúng với code hiện tại**. Xem mục 2.8 để hiểu chuyện gì đã xảy ra và trả lời đúng thực tế thay vì lặp lại README. Đây không phải lỗi của bạn hay của AI — README đơn giản là chưa được cập nhật sau khi kiến trúc đổi.

---
# PHẦN 1 — KIẾN THỨC NỀN TẢNG CẦN NẮM

> **Cách đọc mỗi mục** (cùng một khuôn để dễ ôn): **Vấn đề nó giải quyết** (vì sao công nghệ này tồn tại, không có nó thì đau ở đâu) → **Khái niệm cốt lõi** (định nghĩa từng thuật ngữ) → **Cách hoạt động** → **Khi nào dùng / không dùng** → **Bẫy thường gặp** → **Câu hỏi phỏng vấn hay gặp**. Mục nào có khác biệt so với Pocket Split thì có bảng so sánh riêng — chỉ nói về *khái niệm*, chưa nói code của LexiCore (phần đó ở Phần 2, cùng số mục: 1.x ↔ 2.x).

---

## 1.1 Quản lý state: Riverpod (cả nền tảng lẫn code generation)

### Vấn đề nó giải quyết

Flutter dựng UI bằng **cây widget**. Một mẩu dữ liệu (ví dụ "ngôn ngữ đang học", "danh sách từ vựng") thường cần cho nhiều widget nằm ở các nhánh xa nhau của cây. Các cách "thô" đều đau:

- **`setState`** — state bị nhốt trong đúng 1 widget. Muốn chia sẻ phải "nâng state lên" widget cha chung rồi truyền xuống qua constructor qua nhiều tầng (**prop drilling**) — code rối, mọi widget ở giữa phải biết về dữ liệu chúng không dùng.
- **`InheritedWidget` / package `provider`** — giải được việc chia sẻ, nhưng phụ thuộc `BuildContext` (không đọc được ngoài cây widget, ví dụ trong một service), lỗi thiếu provider chỉ nổ **lúc chạy** (`ProviderNotFoundException`), và khó thay implementation khi test.

Riverpod giải quyết 5 việc cùng lúc: (1) state sống **ngoài** cây widget; (2) khai báo **phụ thuộc** giữa các state, tự tính lại khi nguồn đổi; (3) thiếu provider bị bắt **lúc biên dịch**; (4) **thay được implementation khi test** (override); (5) **tự dọn** state không còn ai dùng.

### Khái niệm cốt lõi

| Thuật ngữ | Nghĩa |
|---|---|
| **Provider** | Một "công thức" khai báo *cách tạo ra* một giá trị. Bản thân nó **không giữ** giá trị. |
| **`ProviderScope` / `ProviderContainer`** | Nơi thật sự **lưu** giá trị do các provider tạo ra. `ProviderScope` bọc ở gốc app (`runApp(ProviderScope(child: ...))`). |
| **`Ref`** | "Tay cầm" mà provider/widget dùng để đọc provider khác. |
| **`AsyncValue<T>`** | Kiểu bọc kết quả bất đồng bộ với đúng **3 trạng thái**: `loading` / `data` / `error`. Buộc bạn xử lý cả 3, không có chuyện quên trường hợp lỗi. Đọc bằng `.when(data:, loading:, error:)`, hoặc `.valueOrNull`, `.isLoading`, `.hasError`. |
| **Notifier** | Class giữ state **và** có method để đổi state (`state = ...`). |
| **`family`** | Provider nhận **tham số** (ví dụ `settingsContentProvider(role)` — mỗi `role` một state riêng). |
| **`autoDispose`** | Tự huỷ state khi không còn ai lắng nghe. |

**Các loại provider** — kiểu trả về quyết định bạn dùng loại nào:

| Loại | Trả về | Dùng khi |
|---|---|---|
| `Provider<T>` | giá trị đồng bộ | Cung cấp/tính ra một giá trị hoặc một service (kiểu "dependency injection"), không có method đổi state. |
| `FutureProvider<T>` | `Future<T>` → `AsyncValue<T>` | Tải dữ liệu một lần, không cần method để sửa. |
| `StreamProvider<T>` | `Stream<T>` → `AsyncValue<T>` | Nguồn dữ liệu chảy liên tục (Firestore `snapshots()`, `authStateChanges()`). |
| `Notifier<T>` | state đồng bộ | State cần **method** để thay đổi (form, cài đặt, phiên luyện tập) và khởi tạo không cần chờ I/O. |
| `AsyncNotifier<T>` | `Future<T>` → `AsyncValue<T>` | Như trên nhưng `build()` phải chờ I/O (gọi API, đọc storage). |
| `StreamNotifier<T>` | `Stream<T>` → `AsyncValue<T>` | Như trên nhưng nguồn là stream. |

### Cách hoạt động

Bốn thao tác quan trọng nhất trên `ref`:

- **`ref.watch(p)`** — đọc giá trị **và đăng ký theo dõi**: `p` đổi → nơi gọi được tính lại (widget rebuild, hoặc provider khác tính lại). Dùng trong `build()`.
- **`ref.read(p)`** — đọc **một lần**, không theo dõi. Dùng trong event handler (`onPressed`) và trong method của Notifier.
- **`ref.listen(p, callback)`** — chạy **side-effect** (hiện SnackBar, điều hướng) khi `p` đổi, không rebuild.
- **`ref.invalidate(p)` / `ref.invalidateSelf()`** — vứt giá trị đã cache; lần đọc kế (hoặc ngay nếu đang có người watch) sẽ tính lại từ đầu. Cách chuẩn để "làm mới sau khi ghi dữ liệu".

Chuỗi phản ứng: provider A `watch` provider B → B đổi → A tự tính lại → widget đang `watch` A rebuild. Chỉ đúng phần bị ảnh hưởng chạy lại — đó là "đồ thị phụ thuộc" (dependency graph).

**Vòng đời (lifecycle):** provider được tạo khi có người đọc đầu tiên. Với **autoDispose**, khi người nghe cuối cùng rời đi thì state bị huỷ (lần sau đọc lại là tạo mới). Với **keepAlive**, state sống suốt vòng đời `ProviderScope`.

**Override:** `ProviderScope(overrides: [p.overrideWithValue(x)])` thay hẳn kết quả của provider `p` — dùng cho test (thay service thật bằng bản giả) và cho "khe cắm phụ thuộc" (một provider cố tình `throw UnimplementedError` cho đến khi `main()` cắm giá trị thật vào).

### Code generation (`riverpod_annotation` + `build_runner`)

**Vấn đề của viết tay:** phải tự chọn đúng loại (`NotifierProvider` hay `AsyncNotifierProvider`?), tự khai báo generic hai lần, tự nhớ thêm `.family` / `.autoDispose` — dễ sai, nhiều boilerplate.

**Cơ chế:** bạn viết một hàm hoặc class kèm annotation `@riverpod`; `build_runner` sinh file `.g.dart` chứa provider thật (khai báo `part 'x.g.dart';` ở đầu file). Quy tắc:

- **Hàm** `@riverpod T foo(Ref ref)` → provider chỉ-đọc; **kiểu trả về quyết định loại**: `T` → `Provider`, `Future<T>` → `FutureProvider`, `Stream<T>` → `StreamProvider`.
- **Class** `@riverpod class Foo extends _$Foo` với method `build()` → Notifier; **kiểu `build()` quyết định loại**: `T` → `Notifier`, `Future<T>` → `AsyncNotifier`, `Stream<T>` → `StreamNotifier`.
- Thêm **tham số** vào hàm/`build()` → tự thành `family`.
- **Mặc định là autoDispose**; muốn sống mãi phải viết `@Riverpod(keepAlive: true)`.
- Sinh code: `dart run build_runner build --delete-conflicting-outputs`.

### So sánh viết tay (Pocket Split) và code-gen (LexiCore)

| | Pocket Split (viết tay) | LexiCore (code-gen) |
|---|---|---|
| Khai báo notifier | `class X extends AsyncNotifier<T>` **+** `final xProvider = AsyncNotifierProvider<X, T>(X.new)` | `@riverpod class X extends _$X` — provider tự sinh |
| Chọn loại provider | Bạn tự chọn và tự viết generic | Suy ra từ kiểu trả về của `build()` |
| Vòng đời mặc định | **Sống mãi** (không autoDispose) | **autoDispose**; tắt bằng `keepAlive: true` |
| Family | Viết `.family` bằng tay | Thêm tham số vào hàm/`build()` |
| Gói phụ thuộc | chỉ `flutter_riverpod` | thêm `riverpod_annotation`, `riverpod_generator`, `build_runner` |
| Ưu | Không có bước sinh code, đọc dễ khi mới học | Ít boilerplate, khó chọn sai loại |
| Nhược | Dễ sai loại/generic, phải nhớ tự thêm autoDispose | Thêm bước `build_runner`, file `.g.dart`, lỗi biên dịch đôi khi khó đọc |

Hai cách **cùng dùng một "động cơ" Riverpod** — code-gen chỉ là cách khai báo tiện hơn, không phải một thư viện khác.

### Khi nào dùng loại nào

- State có **method đổi state** + khởi tạo đồng bộ → `Notifier`. Cần chờ I/O ở khởi tạo → `AsyncNotifier`. Nguồn là stream → `StreamNotifier`/`StreamProvider`.
- Chỉ **tính ra/cung cấp** một giá trị hoặc một service, không tự đổi → `Provider`/`FutureProvider` (hàm).
- Dữ liệu **theo màn hình** (tạm thời) → autoDispose. Tài nguyên **dùng chung toàn app** (HTTP client, service phát audio) → `keepAlive`.

### Bẫy thường gặp

1. **`ref.read` trong `build()`** → widget không cập nhật khi state đổi (đáng lẽ phải `watch`).
2. **`keepAlive` cho dữ liệu gắn với người dùng** → giữ nguyên giá trị cũ khi đổi tài khoản (ví dụ cache `uid` đầu tiên rồi dùng mãi cho người đăng nhập sau).
3. **Sửa state tại chỗ** (mutate list rồi gán lại cùng object) → Riverpod có thể không thấy thay đổi. State nên **immutable**: tạo object mới (`copyWith`, list mới).
4. **Auto-dispose làm mất state** khi rời màn hình (đôi khi là điều bạn muốn, đôi khi là bug).
5. **Dùng `ref` sau `await` khi provider đã bị huỷ** → lỗi runtime; phải kiểm tra còn "sống" (`ref.mounted`) trước khi dùng tiếp.
6. **Phụ thuộc vòng** (A watch B, B watch A) → lỗi runtime.

### Câu hỏi phỏng vấn hay gặp

- **`ref.watch` khác `ref.read`?** — `watch` theo dõi và kích hoạt tính lại/rebuild; `read` đọc một lần. Trong `build()` dùng `watch`; trong handler dùng `read`.
- **Vì sao cần `AsyncValue`?** — bọc `loading/data/error` vào một kiểu, buộc UI xử lý đủ ba trạng thái, thay vì để một biến `null` mang 3 nghĩa khác nhau.
- **`keepAlive` để làm gì, khi nào nguy hiểm?** — giữ provider không bị huỷ. Cần cho tài nguyên dùng chung; nguy hiểm với dữ liệu phụ thuộc người dùng vì nó sẽ không tự tính lại khi đổi tài khoản.
- **Vì sao chọn Riverpod thay vì Bloc/Provider?** — không phụ thuộc `BuildContext`, an toàn lúc biên dịch, override để test dễ, đồ thị phụ thuộc tự động. (Bloc mạnh ở quy trình sự kiện tường minh nhưng nhiều boilerplate hơn.)
- **Test một provider thế nào?** — tạo `ProviderContainer(overrides: [...])`, thay các phụ thuộc ngoài (HTTP, Firebase) bằng bản giả, rồi đọc/gọi provider như bình thường.

---

## 1.2 Clean Architecture + feature-first folder structure

### Vấn đề nó giải quyết

App có ~15 tính năng lớn (tra từ, ngân hàng từ, luyện tập, đọc, nghe, kiến thức...). Nếu code nghiệp vụ (tính SM-2, kiểm tra hợp lệ) nằm lẫn trong widget hoặc trong đoạn gọi Firestore thì: (a) muốn test phải dựng cả UI/Firebase; (b) đổi nguồn dữ liệu (đổi backend) = sửa khắp nơi; (c) một thay đổi UI có thể làm hỏng logic; (d) không ai biết "luật nghiệp vụ" nằm ở đâu.

### Khái niệm cốt lõi

- **Quy tắc phụ thuộc (dependency rule):** phụ thuộc chỉ trỏ **vào trong**. `presentation` và `data` đều biết `domain`; **`domain` không biết ai cả** (không import Flutter, không import Firebase).
- **`domain/`** gồm: **entity** (model nghiệp vụ thuần Dart), **repository interface** (hợp đồng "lấy/lưu dữ liệu" — chỉ khai báo, không cài đặt), **use case** (1 class = 1 hành động nghiệp vụ, ví dụ "tính lịch SM-2", "lưu từ").
- **`data/`** cài đặt các interface đó bằng nguồn dữ liệu thật (Firestore, HTTP, Cloud Function): `*_impl.dart`, `*_source.dart`.
- **`presentation/`**: provider (cầu nối UI ↔ domain), screen, widget.
- **Dependency Inversion:** `domain` khai báo interface, `data` cài đặt — tầng trên phụ thuộc **abstraction**, không phụ thuộc chi tiết. Đây là lý do thay Firestore bằng nguồn khác mà không đụng use case.
- **Feature-first:** thư mục chia theo **tính năng** trước (`features/dictionary/`, `features/vocabulary/`...), rồi mới chia 3 tầng bên trong — thêm/xoá cả một tính năng chỉ đụng một thư mục. Ngược lại là **layer-first** (`models/`, `screens/`, `providers/` ở gốc, như Pocket Split) — đơn giản khi app nhỏ, rải rác khi app lớn.

### Cách hoạt động (một lần bấm nút đi qua các tầng)

`Widget` → gọi method của provider (presentation) → provider gọi **use case** (domain) → use case gọi **repository interface** (domain) → **repository impl** (data) → Firestore. Dữ liệu quay ngược lại đúng đường đó; `domain` không hề biết Firestore tồn tại.

### Khi nào dùng / không dùng

- **Hợp:** app có logic nghiệp vụ thật (thuật toán, luật) và nhiều tính năng, nhiều người/lâu dài, cần test tốt.
- **Thừa:** CRUD mỏng — nhiều use case chỉ là "bọc" đúng 1 lệnh gọi repository. Đây là chi phí thật của mẫu này (nhiều file, nhiều tầng), phải chấp nhận có ý thức.

### Bẫy thường gặp

1. **Rò rỉ kiểu Firebase vào domain** (entity chứa `Timestamp`, `DocumentSnapshot`) → mất lợi ích cô lập.
2. **Use case "mỏng"** chỉ chuyển tiếp → thêm file mà không thêm giá trị.
3. **Tách entity và DTO quá cứng** khi chưa cần → gấp đôi số model. Nhiều dự án chọn thoả hiệp: entity tự có `fromJson/toJson` (LexiCore làm vậy — xem Phần 2).
4. Tầng **presentation gọi thẳng data**, bỏ qua domain → phá quy tắc phụ thuộc.

### Câu hỏi phỏng vấn hay gặp

- **Lợi ích thực tế?** — test domain không cần mock Firebase; đổi nguồn dữ liệu chỉ sửa tầng data; ranh giới trách nhiệm rõ.
- **Có over-engineering không?** — Có thể, với CRUD đơn giản. Câu trả lời trung thực: chấp nhận chi phí vì app có logic thật (SM-2, trộn bài AI) và nhiều tính năng dùng chung repository.
- **Use case khác repository ở đâu?** — repository = *truy cập dữ liệu*; use case = *một hành động nghiệp vụ* (có thể dùng nhiều repository).

---

## 1.3 Điều hướng: GoRouter, route guard, ShellRoute

### Vấn đề nó giải quyết

Điều hướng bằng `Navigator.push` (imperative): khó biết "màn hình nào ứng với URL nào", không có deep link/URL trên web, và **logic chặn truy cập** (chưa đăng nhập thì không được vào) phải rải khắp các nút bấm. GoRouter khai báo **bảng route → màn hình** ở một chỗ, hỗ trợ URL/tham số, và có một cửa duy nhất (`redirect`) để chặn/chuyển hướng.

### Khái niệm cốt lõi

- **Route khai báo:** `GoRoute(path: '/vocab/:id', builder: ...)`; `:id` là **path parameter** (đọc bằng `state.pathParameters['id']`). Route con lồng trong `routes:` của route cha.
- **`context.go(path)`** *thay* vị trí hiện tại (không chồng stack, hợp cho chuyển tab/khu vực); **`context.push(path)`** *chồng* thêm một màn (nút Back quay lại được).
- **`redirect`:** hàm chạy **trước khi vào** route; trả về path khác để chuyển hướng, hoặc `null` để cho qua. Chạy mỗi lần điều hướng **và** mỗi khi `refreshListenable` báo thay đổi.
- **`refreshListenable`:** một `Listenable` (thường `ChangeNotifier`); mỗi lần nó `notifyListeners()`, GoRouter tính lại `redirect`. Đây là cầu nối để "trạng thái đăng nhập đổi → tự chuyển màn".
- **`ShellRoute`:** bọc nhiều route con trong **một khung UI chung** (thanh điều hướng đáy/rail...). Khung không bị dựng lại khi chuyển giữa các route con.
- **`StatefulShellRoute.indexedStack`:** như `ShellRoute` nhưng **mỗi tab giữ Navigator + state riêng** (dùng `IndexedStack` để ẩn/hiện, không huỷ) — chuyển tab không mất vị trí cuộn hay form đang nhập.

| | `ShellRoute` | `StatefulShellRoute` |
|---|---|---|
| Khung UI chung | Có | Có |
| Giữ state từng tab khi chuyển tab | **Không** (tab bị dựng lại) | **Có** |
| Độ phức tạp | Thấp hơn | Cao hơn (khai báo `branches`) |
| Hợp khi | Tab nhẹ, nội dung tải lại rẻ | Tab có form/cuộn dài cần giữ nguyên |

### Cách hoạt động — vấn đề "chưa biết đã đăng nhập chưa"

Trạng thái đăng nhập của Firebase đến **bất đồng bộ**: lúc app vừa mở, SDK chưa khôi phục xong phiên cũ. Nếu `redirect` đọc "chưa có user" ngay lúc đó và đá sang màn đăng nhập, người **đã đăng nhập** sẽ thấy màn đăng nhập nháy lên rồi mới vào app. Cách xử lý chuẩn:

1. Thêm cờ **`hasResolved`** ("stream đã bắn giá trị đầu tiên chưa?") — tách khỏi câu hỏi "đã đăng nhập chưa?". Ba trạng thái thật sự: *chưa biết* / *đã biết: chưa đăng nhập* / *đã biết: đã đăng nhập*.
2. Khi chưa `hasResolved` → giữ ở màn **splash** (đang tải), tuyệt đối không đoán.
3. Tách phần "quyết định redirect" thành **hàm thuần** (nhận 3 giá trị đơn giản, trả về path hoặc `null`) → test bằng cách gọi thẳng hàm, không cần dựng router hay giả lập Firebase.

### Khi nào dùng / không dùng

- Cần URL/deep link, nhiều khu vực, guard tập trung → GoRouter.
- App rất nhỏ, vài màn tuyến tính → `Navigator` thường là đủ.

### Bẫy thường gặp

1. **Vòng lặp redirect:** A đá sang B, B đá về A. Luôn trả `null` khi đã ở đúng đích (`matchedLocation == target`).
2. **Redirect nặng/bất đồng bộ:** nó chạy rất thường xuyên; phải rẻ và đồng bộ.
3. **Tạo router mới mỗi lần rebuild** → mất vị trí điều hướng. Router phải là một instance ổn định.
4. **Quên `dispose` subscription** trong `ChangeNotifier` cầu nối → rò rỉ.

### Câu hỏi phỏng vấn hay gặp

- **`go` khác `push`?** — `go` thay vị trí (khai báo theo URL), `push` chồng thêm màn.
- **Vì sao cần `refreshListenable`?** — vì `redirect` chỉ chạy khi điều hướng; muốn phản ứng khi *auth đổi* mà không có ai bấm gì thì phải có tín hiệu để router tính lại.
- **Vì sao tách hàm quyết định redirect?** — để test không phụ thuộc `BuildContext`/Firebase.

---

## 1.4 Bảo mật khoá AI: mô hình BYOK + mã hoá bằng Cloud KMS

### Vấn đề nó giải quyết

App cho người dùng **tự nhập API key của chính họ** (BYOK = *Bring Your Own Key*) để gọi Gemini/Groq/OpenRouter — nhờ đó nhà phát triển không phải trả tiền AI thay người dùng. Nhưng key này là **bí mật có tiền** (ai lấy được có thể tiêu hết hạn mức của người dùng). Nó có thể bị lộ ở nhiều chỗ:

| Nơi có thể lộ | Vì sao nguy hiểm |
|---|---|
| Lưu plaintext trên Firestore | Chỉ cần một dòng Security Rules sai, hoặc ai đó có quyền đọc database/backup |
| Log của server/app | Log rất hay bị ghi cả request body, và log thường được nhiều người/công cụ đọc |
| Lưu trong app (SharedPreferences, code) | Có thể trích xuất từ máy/bản build |
| Gửi qua mạng không mã hoá | Bị nghe lén (được giải quyết bởi TLS) |

Mục tiêu: **không nơi nào lưu lâu dài hay ghi log key ở dạng đọc được**; chỉ **một** nơi được phép thấy key thật, và chỉ trong chốc lát.

### Khái niệm cốt lõi

- **Cloud KMS** (Key Management Service): dịch vụ giữ **khoá mã hoá** an toàn; bạn chỉ **gọi** `encrypt`/`decrypt`, *không bao giờ cầm khoá*. Ai được decrypt được kiểm soát bằng **IAM** (chỉ tài khoản dịch vụ của Cloud Function được cấp quyền).
- **Ciphertext:** bản đã mã hoá — vô nghĩa nếu không có KMS; an toàn hơn nhiều để lưu ở Firestore/SharedPreferences.
- **AAD (Additional Authenticated Data):** một chuỗi phụ (ở đây là `uid` người dùng) được **buộc** vào phép mã hoá. Decrypt chỉ thành công khi cung cấp **đúng AAD đó**. Hệ quả: ciphertext của user A bị chép sang tài khoản B sẽ **không giải mã được** — một lớp phòng thủ chiều sâu (defense-in-depth) ngoài Security Rules.
- **Proxy phía server:** client không bao giờ giữ key thật; nó gửi *ciphertext + prompt* cho Cloud Function, Cloud Function decrypt **trong bộ nhớ**, gọi nhà cung cấp AI, trả kết quả, rồi biến `apiKey` biến mất cùng vòng đời request.
- **Lưu ý thuật ngữ:** *Envelope encryption* là mẫu khác — KMS chỉ mã hoá một **khoá dữ liệu (DEK)**, còn dữ liệu lớn được mã hoá bằng DEK đó. Dự án này **gọi trực tiếp** `encrypt`/`decrypt` của KMS lên chính chuỗi API key (rất nhỏ) — là *KMS direct encryption*, không phải envelope.

### Cách hoạt động (hai luồng)

1. **Lúc người dùng nhập key:** client → Cloud Function `encryptApiKey` (gửi key thô qua TLS) → function gọi KMS `encrypt` (AAD = uid) → trả về ciphertext → client lưu ciphertext (không lưu key thô).
2. **Lúc cần gọi AI:** client → Cloud Function `generateContent` (gửi ciphertext + provider + model + prompt) → function xác thực người gọi → KMS `decrypt` (AAD = uid người gọi) → gọi nhà cung cấp → trả văn bản.

### Khi nào dùng / đánh đổi

- **Hợp:** chuỗi bí mật nhỏ (khoá API), cần kiểm soát quyền decrypt bằng IAM, muốn lịch sử truy cập (audit log của KMS).
- **Đánh đổi:** mỗi lần gọi AI có thêm một lần gọi KMS (tăng độ trễ + tính phí rất nhỏ); phụ thuộc thêm một dịch vụ; phải quản lý IAM đúng.

### Bẫy thường gặp

1. Ghi log **cả request** (có ciphertext hoặc — tệ hơn — key thô).
2. Quên buộc AAD → ciphertext dùng chéo được giữa người dùng.
3. Cho client quyền decrypt (mất toàn bộ ý nghĩa của mô hình).
4. Để lộ lỗi chi tiết của nhà cung cấp trong thông báo trả về client.

### Câu hỏi phỏng vấn hay gặp

- **Vì sao không mã hoá ngay trên client?** — Khoá mã hoá phải nằm ở đâu đó; nếu nằm trong app thì trích xuất được. KMS giữ khoá bên ngoài app.
- **AAD giải quyết gì?** — chống dùng chéo ciphertext giữa người dùng; decrypt phải đúng ngữ cảnh.
- **Envelope encryption là gì, dự án có dùng không?** — KMS mã hoá DEK, DEK mã hoá dữ liệu lớn. Dự án **không** dùng envelope; gọi thẳng KMS cho chuỗi nhỏ.

---

## 1.5 Multi-provider abstraction — interface chung, Factory, Proxy

### Vấn đề nó giải quyết

App hỗ trợ **3 nhà cung cấp AI** với 2 "giọng" giao thức khác nhau: Gemini (SDK/định dạng riêng) và Groq/OpenRouter (đều theo chuẩn **OpenAI-compatible Chat Completions**). Có ~9 tính năng cần gọi AI. Nếu mỗi tính năng tự `if provider == ...` thì thêm nhà cung cấp thứ 4 = sửa cả 9 nơi, và mỗi nơi có thể xử lý khác nhau.

### Khái niệm cốt lõi

- **Interface (abstract class):** hợp đồng tối thiểu — ở đây chỉ **một** hàm `generateContent`. Phía gọi chỉ biết hợp đồng, không biết ai thực hiện.
- **Factory:** một hàm tĩnh nhận cấu hình (provider nào, model gì, khoá nào) và **trả về đúng bản cài đặt**, ẩn logic "chọn class nào" khỏi nơi dùng.
- **Adapter:** mỗi nhà cung cấp có định dạng request/response riêng; adapter *dịch* nó về hình dạng chung `{ text }`. Vì Groq và OpenRouter cùng chuẩn OpenAI nên **một adapter dùng chung** cho cả hai, chỉ đổi địa chỉ/khoá.
- **Proxy (phía backend):** client không gọi thẳng nhà cung cấp; nó gọi *một* Cloud Function với cùng một hình dạng lời gọi bất kể nhà cung cấp — function mới là nơi phân nhánh theo provider.
- **Exhaustive `switch` với `never` (TypeScript):** nếu thêm giá trị mới vào union type mà quên xử lý trong `switch`, trình biên dịch báo lỗi ngay — không để lọt xuống runtime.

### Cách hoạt động

`Feature source` → `AiClientFactory.buildClient(settings)` → client (đã cấu hình provider/model/ciphertext) → `generateContent(prompt)` → Cloud Function → `switch(provider)` → adapter tương ứng → trả `{ text }` → phía Dart gói lại thành đối tượng phản hồi chuẩn để mọi source dùng chung.

### Khi nào dùng / không dùng

- **Hợp:** nhiều nơi dùng chung một khả năng có nhiều cách hiện thực.
- **Thừa:** chỉ có một cách hiện thực và không có kế hoạch thêm. (Trớ trêu: LexiCore hiện chỉ còn 1 bản cài đặt phía client, nhưng interface vẫn đáng giá — xem Phần 2.5.)

### Bẫy thường gặp

1. **Interface quá rộng** (nhét mọi tính năng riêng của từng nhà cung cấp vào) → mất tính trừu tượng.
2. **Rò rỉ chi tiết provider** lên tầng trên (ví dụ tên model riêng của Gemini trong logic chung).
3. Quên xử lý provider mới ở nhánh phía server → lỗi runtime (được `never` chặn ở TypeScript).

### Câu hỏi phỏng vấn hay gặp

- **Factory khác Strategy?** — Factory *chọn và tạo* đối tượng; Strategy là *cách hoán đổi hành vi* qua interface. Ở đây Factory tạo ra một "strategy" gọi AI.
- **Vì sao Groq và OpenRouter dùng chung adapter?** — cùng chuẩn OpenAI-compatible, chỉ khác endpoint và khoá.
- **Lợi ích khi đổi hết sang proxy qua Cloud Function mà 9 tính năng không phải sửa?** — vì chúng phụ thuộc interface, không phụ thuộc bản cài đặt.

---

## 1.6 Thuật toán SM-2 (Spaced Repetition) và xác suất hoá bài tập

### Vấn đề nó giải quyết

Con người quên theo **đường cong quên lãng** (Ebbinghaus): không ôn thì nhớ giảm rất nhanh; ôn đúng lúc sắp quên thì nhớ **bền hơn** mỗi lần. Ôn tất cả mỗi ngày thì lãng phí; ôn quá thưa thì quên. **Spaced repetition** = lên lịch ôn từng mục theo *mức nhớ riêng của nó*: nhớ tốt → giãn xa; quên → ôn lại sớm.

### Khái niệm cốt lõi (SM-2 gốc — Piotr Wozniak, 1987)

Mỗi từ có 3 biến trạng thái:

- **`repetitions`** — số lần trả lời đạt **liên tiếp**.
- **`interval`** — số ngày đến lần ôn kế.
- **`EF` (easiness factor)** — hệ số "độ dễ" của từ; càng cao thì khoảng cách giãn càng nhanh. Bắt đầu 2.5, không xuống dưới 1.3.

**`quality` (0–5):** mức nhớ của lần trả lời (5 = nhớ hoàn hảo, 0 = quên hẳn). `quality < 3` = coi như **quên**.

Quy tắc:

- `quality < 3` → `repetitions = 0`, `interval = 1` (ôn lại ngày mai). EF giữ nguyên.
- `quality ≥ 3` → `repetitions + 1`; `interval` = **1** (lần đầu), **6** (lần hai), rồi `interval_cũ × EF` (làm tròn) từ lần ba; cập nhật EF.
- **Công thức EF gốc:** `EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))`, chặn dưới 1.3. (Có số hạng bậc hai `(5−q)²`.)

**Ví dụ chạy tay** (EF = 2.5, toàn trả lời `q = 4`):

| Lần ôn | repetitions trước | interval mới | Ngày tới lần ôn kế |
|---|---|---|---|
| 1 | 0 | 1 | +1 ngày |
| 2 | 1 | 6 | +6 ngày |
| 3 | 2 | round(6 × EF) ≈ 15 | +15 ngày |
| Trượt (`q = 1`) | — | reset về 1, `repetitions = 0` | +1 ngày |

**Phần "trộn AI" riêng của dự án (không có trong SM-2):** một phiên có thể trộn flashcard (không cần AI) với bài AI-sinh. Cần một **hàm xác suất thuần**: nhận sẵn một số ngẫu nhiên từ ngoài (`roll` ∈ [0,1)), quyết định flashcard hay bài AI. Không tự gọi bộ sinh ngẫu nhiên bên trong → test bằng cách truyền `roll` cố định.

**Bẫy số thực (IEEE 754):** `1 - 0.7` **không** bằng đúng `0.3` trong số thực dấu phẩy động mà ra `0.30000000000000004`. So sánh `roll < 1 - ratio` sai đúng tại điểm biên; viết lại dạng cộng `roll + ratio < 1.0` tránh phép trừ trung gian nên đúng ở biên.

### Khi nào dùng / không dùng

- **Hợp:** học từ vựng/kiến thức rời rạc, lượng lớn, học lâu dài.
- **Hạn chế:** SM-2 là mô hình **đơn giản** (một hệ số cho mỗi mục). Các hệ thống mới hơn (ví dụ FSRS) mô hình hoá trí nhớ chính xác hơn; Anki dùng biến thể có chỉnh sửa của SM-2.

### Bẫy thường gặp

1. Dùng `quality` chỉ 2 giá trị (đúng/sai) → EF gần như không đổi, mất phần "thích nghi theo từng từ".
2. Gọi `DateTime.now()` ngay trong hàm tính → test không kiểm soát được thời gian (nên truyền đồng hồ vào).
3. Nhầm `interval` (ngày) với ngày tuyệt đối đến hạn (`nextReviewAt`).

### Câu hỏi phỏng vấn hay gặp

- **Vì sao `interval` lần hai là 6?** — hằng số kinh nghiệm từ bài báo gốc của SM-2, không có công thức suy ra.
- **EF thấp nghĩa là gì?** — từ khó, khoảng cách giãn chậm → gặp lại thường xuyên hơn.
- **Vì sao `roll + ratio < 1.0` chứ không `roll < 1 - ratio`?** — tránh sai số làm tròn số thực tại điểm biên.

---

## 1.7 Tự host TTS/STT + cache theo địa chỉ nội dung (content-addressable caching)

### Vấn đề nó giải quyết

Ứng dụng cần **phát âm** (TTS — Text-to-Speech) và có thể cần **nhận giọng** (STT — Speech-to-Text). Gọi dịch vụ TTS trả phí cho *mỗi lần* một từ được tra là tốn tiền và **dư thừa**: cùng một từ, cùng giọng, luôn cho ra cùng một file audio, nhưng bị trả tiền sinh lại hàng nghìn lần.

### Khái niệm cốt lõi

- **Mô hình tự host:** **Piper** (TTS mã nguồn mở, chạy nhanh trên CPU) và **faster-whisper** (STT, bản chạy nhanh của Whisper) chạy trong **container Docker** do bạn tự vận hành — không tính phí theo số lần gọi của bên thứ ba.
- **Cloud Run:** nền tảng chạy container theo kiểu **serverless**: chỉ trả tiền khi có request, **scale về 0** khi không ai dùng (đánh đổi: **cold start** — request đầu tiên sau lúc rảnh chậm hơn vì phải khởi động container). Có thể đặt **riêng tư** (không cho gọi công khai), chỉ tài khoản dịch vụ có quyền `run.invoker` mới gọi được.
- **Content-addressable cache:** khoá cache = **băm (SHA-256) của chính nội dung** (văn bản + ngôn ngữ + giọng), *không phải* ID ngẫu nhiên hay ID theo người dùng. Hệ quả: hai người tra cùng một từ tự động trỏ vào **cùng một đường dẫn** — dùng chung file, không cần bảng tra cứu "từ này đã có audio chưa", chỉ cần tính lại hash rồi hỏi file có tồn tại không.
- **Cache-first, generate-on-miss:** tồn tại → trả URL; chưa → gọi model sinh audio, lưu, rồi trả URL.
- **Chuẩn hoá đầu vào trước khi băm:** hash nhạy cảm với từng byte. Tiếng Việt có dấu có thể viết theo hai dạng Unicode (dựng sẵn *NFC* hoặc tách dấu *NFD*) nhìn giống hệt nhau nhưng byte khác nhau → phải chuẩn hoá (NFC + cắt khoảng trắng) trước khi băm, nếu không sinh ra hai file cho cùng một từ.

### Cách hoạt động

`getPronunciation(text, lang, voice)` → chuẩn hoá → SHA-256 → tạo đường dẫn `tts-cache/{tầng}/{ngôn ngữ}/{giọng}/{hash}.wav` → file có chưa? Có → trả URL. Chưa → gọi Cloud Run → lưu vào Storage → trả URL.

### Khi nào dùng / không dùng

- **Hợp:** nội dung lặp lại nhiều (từ điển), kết quả **xác định** (cùng đầu vào → cùng đầu ra), nội dung không nhạy cảm.
- **Không hợp:** nội dung mỗi lần một khác (bài nghe sinh mới bằng AI) — cache không bao giờ trúng; hoặc nội dung riêng tư của từng người.

### Bẫy thường gặp

1. **Đổi model/giọng nhưng quên đổi `voiceId`** trong khoá → dùng mãi audio cũ.
2. **Không chuẩn hoá Unicode** → cache lỡ, nhân đôi file.
3. **Hai request cùng lúc đều "miss"** → cùng sinh một file hai lần (vô hại vì kết quả giống nhau nhưng tốn tài nguyên).
4. **Cold start** làm lần phát âm đầu tiên chậm.

### Câu hỏi phỏng vấn hay gặp

- **Vì sao băm nội dung thay vì dùng ID tự tăng?** — để trùng nội dung tự động trùng khoá, không cần cơ sở dữ liệu tra cứu, và cache dùng chung giữa mọi người dùng.
- **Cache này có "hết hạn" không?** — Không có TTL; được "vô hiệu hoá" bằng cách đổi thành phần trong khoá (ví dụ `voiceId`).
- **Scale-to-zero đánh đổi gì?** — rẻ khi rảnh, nhưng cold start.

---

## 1.8 Cloud Firestore làm kho dữ liệu chính (client ghi thẳng)

### Vấn đề nó giải quyết

Cần lưu dữ liệu người dùng và đồng bộ giữa **nhiều thiết bị/nền tảng** (mobile + web) mà không tự dựng server + database + API cho từng loại dữ liệu. Firestore là cơ sở dữ liệu **tài liệu (document) trên cloud**, client dùng SDK truy cập trực tiếp, có realtime listener và cache cục bộ sẵn.

### Khái niệm cốt lõi

- **Mô hình dữ liệu:** *collection* chứa *document*; document chứa các trường và có thể có *subcollection*. Đường dẫn dạng `users/{uid}/vocab_records_english/{id}`. Không có JOIN — dữ liệu thường được **phi chuẩn hoá** theo cách đọc.
- **Chi phí theo số document đọc/ghi**, không theo dung lượng truy vấn: một lệnh `.get()` cả collection 1.000 document = **1.000 lượt đọc**. Vì vậy "tải hết rồi lọc ở client" đơn giản nhưng đắt khi dữ liệu lớn.
- **Truy vấn có giới hạn:** lọc/sắp xếp phải có **index** (đơn trường tự có; nhiều trường phải tạo), không có tìm kiếm chuỗi con/full-text tự nhiên.
- **Security Rules** — tầng kiểm soát truy cập **bắt buộc** khi client truy cập trực tiếp: `match` đường dẫn, `allow read/write: if <điều kiện>` dựa trên `request.auth` (người gọi), `resource.data` (dữ liệu hiện có), `request.resource.data` (dữ liệu sắp ghi). Mặc định **từ chối**. **Rules không phải bộ lọc:** truy vấn phải tự thu hẹp đủ để *luôn* thoả rules, nếu không cả truy vấn bị từ chối.
- **Admin SDK** (phía Cloud Function) **bỏ qua hoàn toàn** Security Rules — đó là lý do một số việc (ghi cache audio) chỉ cho server làm.
- **Cache cục bộ của SDK:** mặc định **bật trên mobile**, **tắt trên web** (hành vi mặc định của SDK). Đây là cache do **thư viện** quản lý, khác với "lớp cache do ứng dụng tự thiết kế" (như Hive trước đây).
- **Thiết kế theo người dùng:** `users/{uid}/...` — mỗi người một nhánh, rules chỉ cần `request.auth.uid == uid`.

### Khi nào dùng / không dùng

- **Hợp:** dữ liệu theo người dùng, cần đồng bộ nhiều thiết bị, quan hệ ít phức tạp, muốn ít hạ tầng.
- **Không hợp:** truy vấn quan hệ/thống kê nặng, full-text search, dữ liệu tần suất cực cao.
- **Mô hình "client ghi thẳng":** ít độ trễ, ít hạ tầng, **nhưng** mọi luật nghiệp vụ và kiểm soát truy cập phải nằm trong Security Rules — không còn tầng backend nào kiểm tra thêm. Khác Pocket Split, nơi Firestore chỉ đọc và mọi ghi đi qua backend riêng.

### Bẫy thường gặp

1. **Rules quá rộng** (`allow read, write: if request.auth != null`) — người đăng nhập nào cũng đọc/ghi được dữ liệu của người khác.
2. **Quét cả collection để lọc/tìm** → chi phí và độ trễ tăng theo dữ liệu.
3. **Rules không được version-control** → khó biết ai đổi gì, khó review.
4. **Mặc định tin rằng "có cache thì offline chạy"** mà không kiểm thử thật (chế độ máy bay) — hành vi offline của ghi (bị xếp hàng, `await` có thể treo) dễ gây bất ngờ.

### Câu hỏi phỏng vấn hay gặp

- **Firestore có thay được backend không?** — không hoàn toàn; hợp với CRUD + realtime, còn logic nhạy cảm/tài nguyên server vẫn cần Cloud Functions.
- **Vì sao Rules quan trọng?** — client không đáng tin; Rules là hàng rào duy nhất khi client ghi thẳng.
- **Firestore tính tiền thế nào và ảnh hưởng thiết kế ra sao?** — theo số document đọc/ghi; tránh quét collection, ưu tiên truy vấn có điều kiện + index.

---

## 1.9 Testing: TDD, test double, tách hàm thuần

### Vấn đề nó giải quyết

Code thay đổi liên tục (nhất là khi có AI hỗ trợ viết): không có test thì mỗi lần sửa đều là canh bạc. Test cũng là **tài liệu sống** cho hành vi mong muốn, và là bằng chứng bạn kiểm soát được hệ thống.

### Khái niệm cốt lõi

- **Kim tự tháp test:** nhiều **unit test** (nhanh, rẻ, một hàm/class) ở đáy → ít hơn **widget test** (dựng một phần UI) → rất ít **integration test** (cả app, chậm, mong manh) ở đỉnh.
- **TDD — red → green → refactor:** viết test **trước** (đỏ: chưa có code nên fail), viết code **tối thiểu** cho xanh, rồi dọn code. Giá trị lớn nhất là **thiết kế API rõ ràng** (bạn phải hình dung cách gọi trước) chứ không chỉ "có test".
- **Test double** (đối tượng thay thế phụ thuộc thật):
  - **Stub** — trả kết quả định sẵn.
  - **Mock** — kiểm tra "có được gọi đúng cách không" (`mocktail`, không cần sinh code; khác `mockito` cần `build_runner`).
  - **Fake** — bản cài đặt **chạy được nhưng đơn giản** (ví dụ `fake_cloud_firestore`: Firestore giả chạy trong bộ nhớ) — hành vi gần thật hơn mock.
- **Tách hàm thuần (pure function extraction):** đưa logic quyết định ra thành hàm chỉ phụ thuộc đầu vào (không I/O, không đọc giờ/ngẫu nhiên bên trong) → test bằng cách gọi thẳng, không cần mock nặng.
- **Đưa phụ thuộc qua interface** (`CloudFunctionCaller`, `VocabRepository`) → test truyền bản giả vào.

### Khi nào dùng / không dùng

- Logic có nhánh/điều kiện/biên (SM-2, redirect, tỉ lệ AI) → **nên** unit test kỹ.
- UI thuần bố cục → widget test chọn lọc, đừng test mọi pixel.

### Bẫy thường gặp

1. **Mock quá đà** → test bám chặt cách hiện thực, sửa code là vỡ test dù hành vi không đổi.
2. **Test phụ thuộc thời gian/ngẫu nhiên thật** → chập chờn (flaky).
3. **Chỉ test đường thành công**, bỏ qua lỗi/biên.
4. **Test "xanh" nhưng không kiểm tra gì** (assert yếu).

### Câu hỏi phỏng vấn hay gặp

- **Mock khác fake?** — mock kiểm *tương tác*; fake là bản cài đặt đơn giản *chạy thật*.
- **Vì sao TDD hữu ích với code do AI viết?** — test viết trước là *đặc tả* bạn kiểm soát; AI phải làm cho nó xanh, và bạn nhìn được hành vi mong muốn.
- **Làm sao test hàm dùng số ngẫu nhiên/thời gian?** — truyền `roll`/đồng hồ vào từ ngoài.

---

## 1.10 Kiến trúc triển khai đa nền tảng (monorepo) + ghim vùng miền (region pinning)

### Vấn đề nó giải quyết

Một sản phẩm, hai client (mobile Flutter + web Next.js) dùng chung Firebase/backend. Cần quyết định **mỗi phần chạy ở đâu, deploy bằng cách nào**, và bảo đảm các phần nói chuyện đúng chỗ với nhau.

### Khái niệm cốt lõi

- **Monorepo:** nhiều thành phần trong một repo Git. **Lưu ý:** cùng repo **không** có nghĩa cùng deploy — mỗi thành phần là một **deployable unit** riêng với lệnh và vòng đời riêng:

| Thành phần | Nó là gì | Cách ra bản mới |
|---|---|---|
| Mobile Flutter | Ứng dụng cài trên máy | Build APK/AAB/IPA rồi phát hành (không "deploy" theo nghĩa server) |
| Web Next.js | Ứng dụng web có render phía server (SSR) | Push nhánh đã kết nối → **Firebase App Hosting** tự build và triển khai |
| Cloud Functions | Hàm serverless (thế hệ 2 chạy trên nền Cloud Run) | `firebase deploy --only functions` (thủ công) |
| Cloud Run (TTS/STT) | Container riêng | Build/push image + `gcloud run deploy` (tách hẳn Functions) |

- **Region pinning:** mọi thành phần phía server khai báo **cùng một vùng miền** thay vì dùng mặc định; **client phải khai báo khớp**. Lệch vùng không báo lỗi rõ — client gọi nhầm endpoint hoặc chậm bất thường. Chọn vùng gần người dùng (Việt Nam → Singapore `asia-southeast1`) giảm độ trễ đáng kể so với mặc định ở Mỹ.
- **Serverless & cold start:** không tốn tiền khi rảnh, nhưng lần gọi đầu sau lúc rảnh chậm hơn.
- **`maxInstances`:** giới hạn cứng số bản chạy đồng thời — chặn chi phí bùng nổ (vì bug hoặc bị lạm dụng), đổi lại request vượt ngưỡng có thể bị từ chối/chờ.
- **Gói thanh toán:** Cloud Functions gen2 và Cloud Run yêu cầu **gói trả theo dùng (Blaze)**, dù mức dùng thật vẫn có thể nằm trong hạn mức miễn phí.

### Khi nào dùng / đánh đổi

- **Monorepo hợp** khi các phần chia sẻ hợp đồng (kiểu dữ liệu, shape Firestore) và do một người/nhóm nhỏ làm. **Đổi lại:** kiểu dữ liệu chung phải **đồng bộ tay** giữa các ngôn ngữ (Dart ↔ TypeScript) nếu chưa có gói dùng chung — dễ lệch.

### Bẫy thường gặp

1. **Lệch vùng** giữa client và function.
2. **Nhầm "push là deploy hết"** — Functions và Cloud Run **không** tự deploy khi push.
3. **Quên thêm domain mới** vào danh sách domain được phép của Firebase Auth → đăng nhập bằng popup mở rồi đóng im lặng.
4. **Kiểu dữ liệu chung bị lệch** giữa Dart và TypeScript.

### Câu hỏi phỏng vấn hay gặp

- **Vì sao Functions và Cloud Run deploy khác nhau dù cùng "AI backend"?** — Functions là hàm gọn theo mẫu callable; Cloud Run chứa container đóng gói mô hình nặng — khác cách build và cấp quyền.
- **`maxInstances` để làm gì?** — trần chi phí/tài nguyên.
- **Region lệch gây gì?** — gọi sai endpoint, không báo lỗi rõ.

---

## 1.11 Firebase Authentication + ID token (JWT)

### Vấn đề nó giải quyết

Cần biết **người dùng là ai** một cách an toàn mà không tự viết hệ thống mật khẩu (băm, muối, khôi phục, chống brute-force). Firebase Auth lo phần **định danh** (identity), và cấp một **token** để chứng minh danh tính đó khi gọi các dịch vụ khác.

### Khái niệm cốt lõi

- **Identity (xác thực — "bạn là ai") ≠ Authorization (phân quyền — "bạn được làm gì").** Firebase Auth chỉ trả lời câu đầu. Quyền được thể hiện ở Security Rules, hoặc ở backend/role riêng.
- **Identity provider:** cách đăng nhập (email/mật khẩu, Google...). Một tài khoản Firebase có thể gắn nhiều provider.
- **ID token = JWT** gồm 3 phần `header.payload.signature` (mã hoá base64url). Payload chứa các **claim**: `sub`/`uid`, `iat` (phát hành lúc), `exp` (hết hạn lúc), `auth_time`, `firebase.sign_in_provider`. **Chữ ký** để server kiểm tra token không bị sửa. Thời hạn mặc định khoảng **1 giờ**.
- **Refresh token:** sống lâu; SDK dùng **ngầm** để xin ID token mới khi cũ hết hạn — app hiếm khi đụng trực tiếp.
- **Luồng đăng nhập Google khác nhau theo nền tảng:**
  - **Mobile:** dùng gói `google_sign_in` mở hộp chọn tài khoản → nhận `accessToken` + `idToken` của Google → tạo `GoogleAuthProvider.credential(...)` → `signInWithCredential`.
  - **Web:** `signInWithPopup(GoogleAuthProvider())` (cửa sổ popup của trình duyệt).
- **`authStateChanges()`:** Stream báo `User?` mỗi khi trạng thái đăng nhập đổi; lần phát đầu tiên đến **bất đồng bộ** (sau khi SDK khôi phục phiên) — liên quan trực tiếp đến vấn đề `hasResolved` ở 1.3.
- **Đăng nhập bắt buộc (mandatory sign-in):** toàn bộ app nằm sau cổng đăng nhập; mọi màn bên trong có thể **giả định đã có người dùng** — đơn giản hoá code, nhưng đổi lại phải chắc chắn cổng ở router không bị vượt qua.

### Cách hoạt động

Đăng nhập → SDK giữ phiên (lưu bền) → mỗi lần gọi dịch vụ có bảo vệ, SDK tự đính **ID token** → phía nhận (Firestore Rules, Cloud Functions `onCall`) **kiểm tra chữ ký/hạn** và lộ ra `uid` (`request.auth.uid`).

### Khi nào dùng / đánh đổi

- **Hợp:** cần đăng nhập nhanh, an toàn, tích hợp sẵn với Firestore/Functions.
- **Đánh đổi:** phụ thuộc Firebase; đổi nhà cung cấp định danh sau này tốn công.

### Bẫy thường gặp

1. **Android: thiếu SHA-1 của keystore** trong cấu hình Firebase → màn chọn tài khoản Google mở rồi đóng ngay (`ApiException: 10 / DEVELOPER_ERROR`), không có thông báo lỗi trong app.
2. **Web: thiếu domain trong "Authorized domains"** → popup mở rồi đóng im lặng.
3. **Tin cờ đăng nhập lúc app vừa mở** khi stream chưa phát giá trị đầu.
4. **Nhầm ID token với access token của Google** (khác nhau, dùng cho hệ thống khác nhau).

### Câu hỏi phỏng vấn hay gặp

- **ID token và refresh token khác nhau?** — ID token ngắn hạn để gọi API; refresh token dài hạn để xin ID token mới.
- **Server biết token còn hạn bằng cách nào?** — kiểm tra chữ ký và claim `exp` (SDK phía server làm việc này).
- **Vì sao role không nên do client tự khai?** — client không đáng tin; quyền phải do server/rules quyết định.

---

## 1.12 Cloud Functions gọi được từ client (`onCall`)

### Vấn đề nó giải quyết

Có việc **không được làm ở client**: giữ bí mật (giải mã khoá API), gọi dịch vụ bên ngoài bằng thông tin nhạy cảm, hoặc dùng tài nguyên server. Có thể tự dựng endpoint HTTP, nhưng khi đó phải tự làm: xác thực người gọi, giải mã tham số, chuẩn hoá lỗi, CORS. **Callable function** (`onCall`) làm sẵn những việc đó cho client Firebase.

### Khái niệm cốt lõi

- **Trigger HTTP thường (`onRequest`) vs callable (`onCall`):** callable có **giao thức riêng** giữa SDK client và function — SDK tự đính **ID token** của người dùng; function tự xác thực và cung cấp `request.auth` (có `uid`) và `request.data` (tham số). Chỉ dùng cho client Firebase của chính bạn, không phải API công khai.
- **`HttpsError(code, message)`:** cách chuẩn để báo lỗi về client. Mã lỗi (`unauthenticated`, `invalid-argument`, `permission-denied`, `resource-exhausted`, `unavailable`, `internal`...) được SDK client ánh xạ thành ngoại lệ có `code` tương ứng — client xử lý theo mã, không phân tích chuỗi thông báo.
- **Kiểm tra đầu vào:** `request.data` là kiểu không đảm bảo (do client gửi) → phải xác thực hình dạng (type guard) trước khi dùng.
- **Tuỳ chọn:** `region` (vùng), `maxInstances` (trần số bản chạy), `timeoutSeconds` (hạn chờ). Thế hệ 2 chạy trên **Cloud Run**.
- **Dịch lỗi của dịch vụ ngoài:** trạng thái HTTP của nhà cung cấp (401/403/429/5xx) được ánh xạ sang mã `HttpsError` có ý nghĩa với client, thay vì lộ nguyên lỗi thô.

### Cách hoạt động

Client: `httpsCallable('generateContent').call(data)` → SDK đính ID token → Function: kiểm tra `request.auth` (có đăng nhập không) → kiểm tra `request.data` (đúng hình dạng không) → làm việc → trả về đối tượng hoặc ném `HttpsError`.

### Khi nào dùng / không dùng

- **Hợp:** gọi từ chính app của bạn, cần biết người gọi là ai, cần giữ bí mật ở server.
- **Không hợp:** cần API công khai cho bên thứ ba, webhook (dùng `onRequest`), hoặc tác vụ nền theo sự kiện (dùng trigger sự kiện/lịch).

### Bẫy thường gặp

1. **Quên kiểm tra `request.auth`** → ai cũng gọi được.
2. **Không kiểm tra `request.data`** → lỗi lạ hoặc lỗ hổng.
3. **Lộ lỗi nội bộ/của nhà cung cấp** cho client (có thể chứa thông tin nhạy cảm).
4. **Ghi log dữ liệu nhạy cảm** (key, prompt riêng tư).
5. **Lệch region** giữa client và function.
6. **Cold start** khiến lần gọi đầu chậm.

### Câu hỏi phỏng vấn hay gặp

- **`onCall` khác `onRequest` ở đâu?** — `onCall` có xác thực và (de)serialize sẵn cho client Firebase; `onRequest` là HTTP thô, tự lo hết.
- **Function biết ai đang gọi bằng cách nào?** — SDK đính ID token; function xác thực và điền `request.auth`.
- **Tại sao cần `maxInstances`/`timeoutSeconds`?** — kiểm soát chi phí và tránh treo vô hạn.

---

## 1.13 Đọc kết quả AI dạng JSON một cách "chịu lỗi"

### Vấn đề nó giải quyết

Ta yêu cầu mô hình ngôn ngữ (LLM) "chỉ trả JSON", nhưng nó **không bảo đảm** hợp lệ. Thực tế gặp: bọc trong hàng rào code markdown (` ```json ... ``` `), có chữ dẫn dắt/kết luận trước-sau JSON, **dấu phẩy thừa** trước `}`/`]` (nhất là với đầu ra dài, lồng nhiều tầng). `jsonDecode` nghiêm ngặt sẽ ném lỗi, làm hỏng cả tính năng dù nội dung hoàn toàn dùng được.

### Khái niệm cốt lõi

- **Phân tích phòng thủ (defensive parsing):** coi đầu ra AI là **đầu vào không đáng tin**, xử lý theo **nhiều lớp**, lớp sau chỉ chạy nếu lớp trước chưa đủ.
- **Các lớp thường dùng:** (1) bỏ hàng rào code markdown; (2) bỏ dấu phẩy thừa; (3) thử parse; (4) nếu vẫn lỗi → **trích đoạn object JSON cân bằng ngoặc** từ đúng dấu `{` đầu đến dấu `}` khớp cặp, rồi parse lại.
- **Nhận biết chuỗi (string-aware):** khi đếm ngoặc hoặc tìm dấu phẩy, phải **bỏ qua nội dung trong chuỗi** (kể cả dấu `\"` được thoát) — nếu không, một `{` hay `,` nằm *trong giá trị chuỗi* sẽ làm sai kết quả. Đây là lý do không thể chỉ dùng `replace` hay regex đơn giản.
- **Kiểm tra hình dạng sau khi parse:** JSON hợp lệ **chưa chắc** đúng cấu trúc bạn cần (thiếu trường, mảng rỗng, chỉ số ngoài phạm vi) — cần kiểm tra thêm ở tầng dùng dữ liệu.
- **Tính năng "JSON mode/structured output"** của nhà cung cấp giảm vấn đề nhưng không có ở mọi nhà cung cấp/model và vẫn không phải cam kết tuyệt đối.

### Cách hoạt động

`raw` → cắt khoảng trắng → bỏ hàng rào → bỏ dấu phẩy thừa (có nhận biết chuỗi) → `jsonDecode` → nếu ném `FormatException` → trích object cân bằng ngoặc → `jsonDecode` lần nữa → nếu vẫn không được thì ném lỗi cho tầng trên xử lý (thử lại/báo người dùng).

### Khi nào dùng / đánh đổi

- **Hợp:** mọi nơi nhận JSON từ LLM.
- **Đánh đổi:** bộ phân tích "rộng lượng" có thể **che** lỗi prompt; nên có test với các kiểu đầu ra hỏng thật đã gặp.

### Bẫy thường gặp

1. Dùng regex thô làm hỏng **nội dung chuỗi** chứa `,`/`{`/`}`.
2. Chỉ parse được khi "đẹp", lỗi ngay ở đầu ra dài.
3. Tin hình dạng dữ liệu mà không kiểm tra → lỗi xuất hiện xa nơi gây ra.
4. Sửa parser theo một mẫu hỏng mà không thêm test cho mẫu đó → tái phát.

### Câu hỏi phỏng vấn hay gặp

- **Vì sao không `jsonDecode` thẳng?** — LLM không đảm bảo JSON chuẩn dù đã dặn.
- **Vì sao phải nhận biết chuỗi khi đếm ngoặc?** — dấu ngoặc/phẩy trong giá trị chuỗi không phải cấu trúc JSON.
- **Xử lý thế nào khi parse vẫn thất bại?** — ném lỗi có kiểm soát để tầng trên thử lại hoặc báo người dùng, không âm thầm nuốt.

---

# PHẦN 2 — KIẾN THỨC ĐÃ ÁP DỤNG TRONG LEXICORE

> Tham chiếu dưới đây là đường dẫn trong repo `lexi-core` hiện tại (`D:\Flutter\lexi-core`), bám code thật — không phải mô tả lý tưởng từ tài liệu spec.

## 2.1 Riverpod trong LexiCore — bằng chứng cụ thể (và khác Pocket Split ở đâu)

### Bức tranh tổng thể (đếm từ code thật trong `lib/`)

- **16 notifier**, **tất cả** đều là code-gen dạng class: `@riverpod class X extends _$X` (ví dụ `AuthNotifier`, `VocabBankNotifier`, `UserSettingsNotifier`, `PracticeSessionNotifier`, `Part5/6/7PracticeNotifier`, `KnowledgeNotesNotifier`...). **Không có** notifier nào viết tay kiểu `extends Notifier<T>`.
- **Provider "hàm"** (chỉ tính/cung cấp giá trị) nằm gần như hết ở **một file**: `lib/core/di/app_providers.dart` — đây là nơi dựng toàn bộ đồ thị phụ thuộc (repository, use case, source AI...).
- **Chỉ 1 provider viết tay**: `vocabListForLanguageProvider = FutureProvider.autoDispose.family<...>` (`vocab_bank_provider.dart:67`).

> Sửa lại ý ở bản trước của tài liệu: trước đây ghi "vẫn dùng song song Notifier/AsyncNotifier viết tay" — **không đúng** với code hiện tại. Tất cả state có method đổi state đều đi qua code-gen.

### Ba dạng notifier thật — `build()` quyết định loại provider

| Notifier | Chữ ký `build()` | Loại được sinh | Vòng đời | Ghi chú |
|---|---|---|---|---|
| `AuthNotifier` (`auth_notifier.dart:9-11`) | `Stream<User?> build() => FirebaseAuth.instance.authStateChanges()` | StreamNotifier → state là `AsyncValue<User?>` | `keepAlive: true` | Không có "role"; trạng thái đăng nhập **chính là** stream của Firebase |
| `VocabBankNotifier` (`vocab_bank_provider.dart:11-34`) | `Future<List<VocabRecord>> build()` | AsyncNotifier → `AsyncValue<List<VocabRecord>>` | autoDispose (mặc định) | `build()` **watch** ngôn ngữ đang học → đổi ngôn ngữ thì tự tải lại |
| `UserSettingsNotifier` (`user_settings_provider.dart:44-86`) | `UserSettingsState build()` (đồng bộ) | Notifier → `UserSettingsState` | `keepAlive: true` | Đọc `SharedPreferences` đồng bộ; đẩy lên Firestore kiểu "cố gắng hết sức" (`unawaited` + `catchError`) |

**Mẫu "làm mới sau khi ghi" — `ref.invalidateSelf()`** (`vocab_bank_provider.dart:19-33`):
```dart
Future<void> save(VocabRecord record) async {
  await ref.read(saveVocabUseCaseProvider).execute(record);
  ref.invalidateSelf();          // vứt danh sách cũ → build() chạy lại → UI thấy dữ liệu mới
}
```
Mỗi thao tác ghi (`save`, `updateRecord`, `delete`) kết thúc bằng `invalidateSelf()` — đúng khái niệm `invalidate` ở Phần 1.1. Provider phụ `vocabListForLanguageProvider` `watch` chính `vocabBankNotifierProvider` để cũng bị tính lại theo cùng tín hiệu (comment trong file giải thích đúng lý do này).

**Một cái bẫy có thật trong code:** `vocabBank` (`vocab_bank_provider.dart:38-46`) đổi `AsyncValue` thành `List` bằng `.when(loading: () => [], error: (_, __) => [])` — tiện, nhưng **giấu** trạng thái đang tải và lỗi: màn dùng provider này không thể hiện spinner hay báo lỗi, chỉ thấy danh sách rỗng. Đáng nêu nếu bị hỏi "AsyncValue giúp gì / bạn đã từng dùng nó sai chưa".

### `keepAlive` — mỗi lựa chọn đều có lý do

- `httpClientProvider`, `ttsServiceProvider` → **keepAlive** (`app_providers.dart:60-72`). `http.Client` bị huỷ giữa lúc request đang bay thì request lỗi; service phát âm giữ một player gốc — theo ghi chú dự án, một lỗi nghiêm trọng đã xảy ra khi provider này auto-dispose trong lúc audio đang phát, và được sửa bằng `keepAlive`.
- `currentUidProvider` → **cố tình KHÔNG keepAlive** (`user_settings_provider.dart:28-36`). Comment trong code nói thẳng lý do: *"A keepAlive provider would cache the uid from its first read and never invalidate on sign-out/sign-in-as-a-different-account within the same app session, causing settings to be pushed to a stale (or another user's) Firestore document."* — chính là **bẫy số 2** ở Phần 1.1, tránh được bằng một quyết định có ý thức. Đây là ví dụ rất tốt để kể khi phỏng vấn hỏi "khi nào keepAlive nguy hiểm".

### Provider làm "khe cắm phụ thuộc" + override

`sharedPreferencesProvider` (`user_settings_provider.dart:19-22`) cố tình **ném lỗi** nếu không ai cắm giá trị thật:
```dart
@Riverpod(keepAlive: true)
SharedPreferences sharedPreferences(SharedPreferencesRef ref) =>
    throw UnimplementedError('sharedPreferencesProvider must be overridden in main.dart');
```
và `main()` cắm giá trị thật vào (`main.dart:16-18`):
```dart
final prefs = await SharedPreferences.getInstance();
runApp(ProviderScope(overrides: [sharedPreferencesProvider.overrideWithValue(prefs)], ...));
```
Lý do: `SharedPreferences.getInstance()` là bất đồng bộ, nhưng provider muốn trả **đồng bộ** → chờ nó xong ở `main()` rồi tiêm vào. Cùng cơ chế override, các comment trong file cho thấy test thay `apiKeyEncryptorProvider`, `aiSettingsSyncServiceProvider`, `currentUidProvider` bằng bản giả để không gọi Cloud Functions/Firestore/FirebaseAuth thật (Phần 1.9).

### Đồ thị phụ thuộc — điểm hội tụ và "fail loud"

`vocabRepositoryProvider` (`app_providers.dart:96-109`) là điểm hội tụ của gần như mọi use case (`saveVocabUseCase`, `getVocabListUseCase`, `updateVocabUseCase`...): mỗi use case chỉ `ref.watch(vocabRepositoryProvider)`, không tự khởi tạo, Riverpod lo thứ tự.
```dart
@riverpod
VocabRepository vocabRepository(VocabRepositoryRef ref) {
  final user = ref.watch(authNotifierProvider).valueOrNull;
  if (user == null) {
    throw StateError(
      'vocabRepositoryProvider was read while signed out; this should be '
      'unreachable now that sign-in is mandatory app-wide.',
    );
  }
  return VocabRepositoryImpl(uid: user.uid);
}
```
Provider này **throw** thay vì trả rỗng nếu chưa đăng nhập — nguyên tắc **fail loud** khi một bất biến bị vi phạm ("chỉ tới được khi đã đăng nhập", do GoRouter guard ở §2.3 bảo đảm). Nếu nó thực sự xảy ra thì là bug ở chỗ khác (guard bị vượt), nên crash rõ ràng còn hơn âm thầm trả dữ liệu rỗng. Và vì nó `watch` `authNotifierProvider`, **đổi tài khoản → repository tự dựng lại với `uid` mới**.

### So sánh trực tiếp hai dự án (đúng chỗ khác nhau giữa hai file spec)

| Khía cạnh | Pocket Split | LexiCore |
|---|---|---|
| Cách khai báo | Tay: `AsyncNotifierProvider<AuthRoleNotifier, AuthState>(AuthRoleNotifier.new)` | Code-gen: `@riverpod class X extends _$X` (provider sinh trong `.g.dart`) |
| Số provider viết tay | Tất cả | 1 |
| Trạng thái đăng nhập | `AsyncNotifier<AuthState>` **gọi backend `GET /me`** để lấy role | `StreamNotifier` bọc thẳng `authStateChanges()` → `AsyncValue<User?>`; **không có role** |
| Vòng đời mặc định | Sống mãi (không autoDispose) | autoDispose; `keepAlive` chọn lọc, có lý do |
| Nơi dựng phụ thuộc | Rải trong từng file provider | Tập trung `core/di/app_providers.dart` |
| Tiêm phụ thuộc cho test | Ít | Override + interface (`CloudFunctionCaller`, `VocabRepository`) |
| Phụ thuộc gói | `flutter_riverpod` | thêm `riverpod_annotation`, `build_runner` (sinh `.g.dart`) |

### Cách trả lời khi bị hỏi "bạn dùng Riverpod thế nào?" (mẫu ngắn)

*"State có hành vi được viết bằng code-gen notifier, kiểu của `build()` quyết định loại — `Stream` cho đăng nhập, `Future` cho danh sách từ, đồng bộ cho cài đặt. Phụ thuộc như repository/use case dựng ở một file DI, dùng `ref.watch` nên đổi tài khoản là chúng tự dựng lại. Sau mỗi lần ghi mình gọi `invalidateSelf()` để làm mới. `keepAlive` chỉ cho tài nguyên dùng chung như HTTP client; những thứ theo người dùng như `currentUid` cố tình để autoDispose để không giữ nhầm tài khoản cũ."*

## 2.2 Clean Architecture — ví dụ đọc thẳng từ cấu trúc thư mục thật

```
lib/features/practice/
├── data/sources/exercise_generator_source.dart   # gọi AI qua AiClientFactory
├── domain/
│   ├── entities/exercise_result.dart             # ExerciseResult, SessionResult — thuần Dart
│   └── use_cases/compute_sm2_use_case.dart        # 1 class = 1 hành động
└── presentation/
    ├── providers/
    └── screens/
```
`ComputeSm2UseCase` (`lib/features/practice/domain/use_cases/compute_sm2_use_case.dart`) là ví dụ rõ nhất cho "domain không phụ thuộc Flutter/Firebase": file này **không import** `flutter/material.dart` hay `cloud_firestore` — chỉ nhận `VocabRecord` (entity thuần) và trả `VocabRecord` mới, test được bằng `flutter_test` thuần không cần mock gì.

**Hai thoả hiệp thật cần nói thẳng nếu bị hỏi (đối chiếu với "Bẫy thường gặp" ở Phần 1.2):**
- **Entity tự có `fromJson/toJson`** — `VocabRepositoryImpl` gọi `VocabRecord.fromJson(d.data())` và `record.toJson()` trực tiếp; **không có lớp DTO riêng** tách khỏi entity. Vẫn thuần Dart (không import Firebase vào entity) nên domain vẫn test được, nhưng hình dạng lưu trữ và hình dạng nghiệp vụ dính vào nhau.
- **Có use case "dày", có use case "mỏng"** — cho thấy đúng lúc nào mẫu này đáng giá:
  - `SaveVocabUseCase` (`save_vocab_use_case.dart`) chứa **luật nghiệp vụ thật**: viết hoa headword (`capitalizeHeadword`), **cấm lưu câu** (`InputType.sentence`), **tối đa 2 chủ đề/từ**, và **chống trùng** (`existsByHeadword`) trước khi gọi `repo.save`. Đây là lý do tồn tại của tầng domain — luật nằm ở một chỗ, test được không cần Firestore.
  - `DeleteVocabUseCase` chỉ là `=> _repo.delete(id, language: language)` — **mỏng**, không thêm giá trị nào ngoài việc giữ cùng một khuôn cho mọi tính năng. Đây là chi phí thật của mẫu kiến trúc.

## 2.3 GoRouter — `authRedirectDecision`, hàm thuần thật trong `app_router.dart`

```dart
/// Pure redirect decision, extracted so it's unit-testable without a full
/// widget tree or a faked FirebaseAuth — see test/core/router/auth_redirect_test.dart.
String? authRedirectDecision({
  required String matchedLocation,
  required bool hasResolved,
  required bool signedIn,
}) {
  if (!hasResolved) {
    return matchedLocation == '/splash' ? null : '/splash';
  }
  if (!signedIn) {
    return matchedLocation == '/sign-in' ? null : '/sign-in';
  }
  if (matchedLocation == '/splash') return '/';
  return null;
}
```
(`lib/core/router/app_router.dart:57-75`) — đây chính minh chứng sống cho Phần 1.3: hàm này nhận 3 giá trị `bool`/`String` đơn giản, không hề chạm `GoRouterState` hay `FirebaseAuth` thật → test file `test/core/router/auth_redirect_test.dart` gọi thẳng hàm này với các tổ hợp input, không cần dựng `MaterialApp.router` hay giả lập Firebase.

`hasResolved` giải quyết đúng race-condition nêu ở Phần 1.3: comment tại dòng 77-80 nói rõ — bridge biến Firebase auth stream (bất đồng bộ) thành thứ GoRouter's `refreshListenable` phản ứng được, và **tự đếm** liệu stream đã bắn giá trị đầu tiên chưa, tách hẳn khỏi câu hỏi "đã đăng nhập chưa".

**Cấu trúc router thật — khác Pocket Split ở 4 điểm** (`lib/core/router/app_router.dart`):

| | Pocket Split | LexiCore |
|---|---|---|
| Khung UI chung | `StatefulShellRoute.indexedStack` (3 khu vực, mỗi tab giữ state) | **`ShellRoute`** bọc `AppShell` (`app_router.dart:242-243`) — **không** giữ state từng tab |
| Cầu nối auth → router | `_AuthListenable` bọc `ref.listen(authProvider)` (Riverpod) | `_AuthRefreshStream extends ChangeNotifier` nghe **thẳng** `FirebaseAuth.instance.authStateChanges()` (`:83-99`), tự đặt `hasResolved = true` ở lần phát đầu |
| Nơi giữ router | `routerProvider` (một Provider) | Biến toàn cục `final appRouter = GoRouter(...)` (`:225`) với `initialLocation: '/splash'` |
| Chống đá nhầm lúc khởi động | `return null` khi `authState == null` | Hàm thuần `authRedirectDecision` + cờ `hasResolved` + màn `/splash` (**tường minh hơn**) |

Hệ quả cần biết: vì dùng `ShellRoute` chứ không phải `StatefulShellRoute`, chuyển giữa các tab chính (`/`, `/vocab`, `/practice`...) sẽ **dựng lại** màn đích chứ không giữ vị trí cuộn/form đang nhập — chấp nhận được vì dữ liệu nằm ở provider/Firestore chứ không ở state cục bộ của widget. Router là biến toàn cục nên `_authRefreshStream` cũng là singleton sống suốt vòng đời app.

Comment trong `sign_in_screen.dart` (được `authRedirectDecision` trích dẫn) còn cho thấy một quyết định tinh tế hơn Pocket Split: màn `/sign-in` **không** tự động điều hướng đi chỉ vì `signedIn == true` — nó tự điều hướng sau khi bước "migrate dữ liệu Hive cũ" (xem §2.8) hoàn tất thật sự, để nếu migration lỗi thì hiện lỗi + nút "Thử lại" thay vì bị `redirect` toàn cục đá đi giữa chừng.

## 2.4 Bảo mật khoá AI — luồng thật, cả 2 phía Dart và TypeScript

**Phía Flutter, khi user nhập key** (`lib/core/services/encrypt_api_key.dart`):
```dart
final result = await _caller.call('encryptApiKey', {'apiKey': rawApiKey});
final ciphertext = result['ciphertext'] as String?;
```
Comment ngay trong file: *"turns a raw, user-entered API key into a Cloud KMS ciphertext that's safe to store in Firestore/SharedPreferences. The raw key itself is never persisted anywhere."*

**Phía Cloud Function, khi cần gọi AI thật** (`functions/src/services/kms.ts:22-49`):
```ts
export async function decryptWithKms(ciphertextBase64: string, aad: string): Promise<string> {
  const [result] = await getClient().decrypt({
    name: getKeyName(),
    ciphertext: Buffer.from(ciphertextBase64, "base64"),
    additionalAuthenticatedData: Buffer.from(aad, "utf8"),
  });
  ...
}
```
`aad` chính là `request.auth.uid` — comment ngay trên hàm `encryptWithKms` giải thích đúng khái niệm AAD ở Phần 1.4: *"Without this, any authenticated caller's ciphertext would decrypt identically regardless of who submitted it, removing a defense-in-depth layer beyond Firestore security rules for the single most sensitive value in this system."*

`generateContent.ts` (Cloud Function thật gọi AI, `functions/src/generateContent.ts:44-68`) là nơi dùng nó:
```ts
if (apiKeyCiphertext) {
  apiKey = await decryptWithKms(apiKeyCiphertext, request.auth.uid);
}
```
— decrypt chỉ xảy ra **trong function này, biến `apiKey` chỉ tồn tại trong bộ nhớ suốt thời gian gọi provider thật rồi mất theo vòng đời request**, không ghi log, không ghi Firestore.

**Chính xác về thuật ngữ:** code gọi thẳng `getClient().encrypt/decrypt` của KMS lên chính chuỗi API key (rất nhỏ) — đây là **KMS direct encryption**, *không* phải envelope encryption (mẫu dùng KMS mã hoá một khoá dữ liệu rồi khoá đó mã hoá dữ liệu lớn). Nếu bị hỏi "có dùng envelope encryption không" → **không**, và vì sao không cần: dữ liệu cần bảo vệ chỉ là một chuỗi ngắn.

**Hai chi tiết đáng nhớ:** (1) `encryptApiKey.ts` và `generateContent.ts` cùng dùng AAD = `uid` người gọi, nên ciphertext chỉ dùng được đúng tài khoản tạo ra nó; (2) `isGenerateContentRequest` (`generateContent.ts:29-42`) bắt buộc **đúng một** trong hai trường `apiKey` / `apiKeyCiphertext` (`hasRawKey !== hasCiphertext`) — đường `apiKey` thô là di sản của giai đoạn đầu (React Web Plan 1), đường ciphertext mới là đường chính hiện nay.

## 2.5 `AiClientFactory` — Factory + interface chung thật

`lib/core/services/ai_client_factory.dart`:
```dart
abstract interface class GenerativeModelClient {
  Future<GenerateContentResponse> generateContent(Iterable<Content> prompt);
}

class AiClientFactory {
  static GenerativeModelClient buildClient(UserSettingsState settings, {...}) {
    final config = settings.activeConfig;
    return _CloudFunctionClient(
      provider: settings.activeProvider,
      apiKeyCiphertext: config.apiKeyCiphertext ?? '',
      model: config.model,
      caller: functionCaller ?? FirebaseCloudFunctionCaller(),
    );
  }
}
```
Điều đáng nói nhất: **hiện tại chỉ có đúng 1 implementation** (`_CloudFunctionClient`) — dù interface `GenerativeModelClient` vẫn tồn tại và mọi "source" (9 feature khác nhau — dictionary, exercise, reading, listening, word radar, knowledge...) đều lập trình chống lại interface này, không chống lại class cụ thể. Đây là bằng chứng cho thấy kiến trúc đã **tiến hoá**: comment trong file nói rõ *"Flutter no longer calls any AI provider directly, since the stored key is now a KMS ciphertext only the Cloud Function can decrypt"* — trước đây (Plan 8, multi-provider AI settings) từng có nhiều implementation gọi trực tiếp Gemini SDK/HTTP Groq/OpenRouter; sau khi chuyển toàn bộ qua Cloud Function proxy (đồng bộ với web), chỉ còn 1 class nhưng interface được **giữ nguyên** vì mọi nơi gọi nó không cần đổi gì — đúng giá trị thật của việc lập trình theo interface: đổi cách hiện thực bên trong mà không đụng 9 nơi gọi nó.

**Phía Cloud Function thật sự phân nhánh theo provider** (`functions/src/generateContent.ts:73-84`):
```ts
switch (provider) {
  case "gemini": return await callGemini(params);
  case "groq": return await callGroq(params);
  case "openrouter": return await callOpenRouter(params);
  default: { const exhaustiveCheck: never = provider; ... }
}
```
`exhaustiveCheck: never` là một mẹo TypeScript — nếu sau này thêm 1 giá trị mới vào union type `AiProvider` mà quên xử lý ở `switch`, dòng này gây **lỗi biên dịch** ngay lập tức thay vì để lọt runtime.

## 2.6 SM-2 + trộn AI — cả công thức chuẩn lẫn "gotcha" số thực đã từng gặp thật

### Biến thể SM-2 thật của LexiCore (`compute_sm2_use_case.dart`)

Không phải SM-2 gốc nguyên bản — có 2 khác biệt cần biết để không nói sai khi bị hỏi:

| | SM-2 gốc (Phần 1.6) | LexiCore |
|---|---|---|
| Công thức EF | `EF + 0.1 − (5−q)(0.08 + (5−q)·0.02)` (có số hạng bậc hai) | `EF + 0.1 − (5−q)·0.08` (**đơn giản hoá**, bỏ số hạng bậc hai) |
| Giới hạn EF | Chỉ chặn dưới **1.3** | Chặn **cả hai đầu**: `.clamp(1.3, 2.5)` |
| `q < 3` | `repetitions=0`, `interval=1`, EF giữ nguyên | **Giống** (nhánh trượt không đụng EF) |
| Interval | 1 → 6 → `interval × EF` | **Giống**, làm tròn bằng `.round()` |
| Giá trị khởi tạo | EF = 2.5 | `sm2EaseFactor = 2.5`, `sm2Interval = 1`, `sm2Repetitions = 0` (`vocab_record.dart:22-24`) |

**Hệ quả thú vị (đọc từ code, đáng kể khi bị hỏi "EF có thay đổi không"):** cả 4 widget bài tập (`flashcard`, `multiple_choice`, `fill_in_blank`, `translation`) chỉ truyền `quality: đúng ? 5 : 1` — tức **nhị phân**. Với `q = 5`: `2.5 + 0.1 − 0 = 2.6` rồi bị `clamp` về **2.5**; với `q = 1` (< 3) EF không đổi. Nghĩa là qua bài tập thường, **EF gần như đứng yên ở 2.5** — lịch ôn thực chất chỉ phụ thuộc `repetitions` (1 → 6 → ×2.5). Chỉ **Nghe chép** đổi quality theo điểm (`sm2Quality`, `dictation_practice_provider.dart:95-102`): ≥0.95→5, ≥0.80→4, ≥0.60→3, ≥0.40→2, còn lại→0; nên `q = 3` (điểm 0.60–0.79) mới làm EF giảm (2.5 → 2.44), và chỉ khi đó tính "thích nghi theo từng từ" mới thực sự chạy.

**Điểm yếu kiểm thử:** `compute()` gọi `DateTime.now()` ngay bên trong nên test không kiểm soát được thời gian (không có đồng hồ tiêm vào) — test chỉ kiểm được `repetitions`/`interval`/EF chứ khó khẳng định ngày `nextReviewAt` chính xác.

### Trộn AI + bug số thực (`exercise_result.dart`)

Phần **đáng kể hơn** nằm ở `lib/features/practice/domain/entities/exercise_result.dart`:

```dart
bool shouldUseFlashcard(
  VocabRecord word, bool aiAvailable, double aiRatio, double roll,
) {
  if (word.sm2Repetitions == 0 || !aiAvailable) return true;
  // Written as `roll + aiRatio < 1.0` rather than `roll < (1 - aiRatio)`:
  // mathematically equivalent, but avoids a double-precision boundary bug
  // (e.g. `1 - 0.7` is `0.30000000000000004`, not exactly `0.3`)...
  return roll + aiRatio < 1.0;
}

double drawSessionAiRatio(double roll) => 0.20 + roll * 0.60;
```
Đây là **bug số thực dạng kinh điển** (IEEE 754 double-precision), rất đáng để kể khi phỏng vấn hỏi "bug khó nhất bạn từng gặp/hiểu": `1 - 0.7` trong dấu phẩy động không ra chính xác `0.3` mà ra `0.30000000000000004` — nếu viết điều kiện là `roll < 1 - aiRatio`, đúng tại biên `aiRatio = 0.7, roll = 0.3` sẽ **sai lệch 1 trường hợp cụ thể** (roll = 0.3 lẽ ra phải là biên đúng thì bị lệch). Đổi thành `roll + aiRatio < 1.0` tránh phép trừ trung gian, cho kết quả đúng tại đúng biên đó.

`shouldUseFlashcard` cũng thể hiện đúng nguyên tắc "hàm thuần, RNG truyền từ ngoài vào" ở Phần 1.9 — `roll` là tham số, không phải `Random().nextDouble()` gọi bên trong hàm, nên test có thể truyền `roll = 0.29999` và `roll = 0.30001` để khẳng định đúng hành vi ở biên mà không cần seed ngẫu nhiên.

`drawSessionAiRatio` — 1 số ngẫu nhiên trong session được map tuyến tính vào khoảng `[0.20, 0.80]`, dùng **một lần duy nhất mỗi phiên** ("Trộn AI"), không phải mỗi từ — nghĩa là trong cùng 1 phiên ôn tập, tỉ lệ AI/flashcard là cố định, chỉ đổi giữa các phiên khác nhau.

## 2.7 TTS/STT tự host — cache theo hash trong `pronunciationCache.ts`

```ts
export function cachePath({ tier, language, voiceId, text }: PronunciationCacheKey): string {
  const hash = createHash("sha256")
    .update(normalize(text) + language + voiceId)
    .digest("hex");
  return `tts-cache/${tier}/${language}/${voiceId}/${hash}.wav`;
}

export async function getOrCreatePronunciation(bucket, serviceUrl, key) {
  const path = cachePath(key);
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    const audio = await synthesizeViaCloudRun(serviceUrl, key.text, key.language);
    await file.save(audio, { metadata: { contentType: "audio/wav" } });
  }
  return publicDownloadUrl(bucket.name, path);
}
```
(`functions/src/services/pronunciationCache.ts`) — đúng khái niệm content-addressable cache ở Phần 1.7: `hash` tính từ `normalize(text) + language + voiceId` (không phải ID ngẫu nhiên), nên 2 user khác nhau tra cùng 1 từ cùng ngôn ngữ/giọng **tự động** trỏ vào cùng 1 path, Cloud Run chỉ bị gọi ở lần đầu tiên (cache miss).

Chi tiết dễ bỏ sót: `normalize(text)` = `text.trim().normalize("NFC")` (`pronunciationCache.ts:23-25`) — chuẩn hoá Unicode **trước khi băm**. Với tiếng Việt điều này quan trọng: chữ có dấu có thể được biểu diễn dựng sẵn (NFC) hoặc tách dấu (NFD), nhìn giống hệt nhưng khác byte → nếu không chuẩn hoá sẽ sinh **hai file audio** cho cùng một từ. `voiceId` cũng nằm trong khoá và trong đường dẫn, nên đổi giọng = tự động ra file mới, không phục vụ audio cũ.

**`storage.rules` xác nhận đúng mô hình "public read, chỉ server ghi được":**
```
match /tts-cache/{allPaths=**} {
  allow read: if true;
  allow write: if false;
}
```
`allow write: if false` áp dụng cho **mọi** client (kể cả user đã đăng nhập) — chỉ Admin SDK phía Cloud Function (bỏ qua Storage Rules hoàn toàn) mới ghi được vào đây. `allow read: if true` (công khai hoàn toàn) là chủ đích — vì các file này vốn đã không nhạy cảm (chỉ là audio phát âm từ điển) và URL download của Firebase Storage tự mang theo token truy cập riêng.

## 2.8 Firestore — nơi từng có Hive offline-first, giờ đã khác (điểm quan trọng nhất cần biết đúng)

**`README.md` hiện ghi:** *"Offline-first: Hive là nguồn dữ liệu chính (app mobile)"*. **Code thật không còn như vậy.** Bằng chứng trực tiếp:

`lib/features/vocabulary/data/repositories/vocab_repository_impl.dart` — **implementation duy nhất** của `VocabRepository` — đọc/ghi **thẳng** Firestore trên mọi method (`save`, `getAll`, `getById`, `update`, `delete`...), **không hề chạm Hive**:
```dart
@override
Future<void> save(VocabRecord record) async {
  await _vocabCol(record.targetLanguage).doc(record.id).set(record.toJson());
}

@override
Future<List<VocabRecord>> getAll({required Language language, ...}) async {
  final snapshot = await _vocabCol(language).get();   // tải CẢ collection rồi lọc/sắp xếp bằng Dart
  ...
}
```

**Ba điều đọc được từ chính file này (đáng nêu vì chúng là "chi phí thật" của mô hình client-ghi-thẳng, Phần 1.8):**
1. **Collection theo ngôn ngữ:** `_vocabCol(language)` = `users/{uid}/vocab_records_${language.name}` — mỗi ngôn ngữ một collection riêng; còn `topics` là **một** collection dùng chung, nên `deleteTopic` phải duyệt **mọi** ngôn ngữ để gỡ chủ đề khỏi từng từ.
2. **Quét toàn bộ collection để lọc:** `getAll` `.get()` cả collection rồi lọc theo chủ đề/CEFR/hạn ôn **bằng Dart**; `getByHeadword` cũng `.get()` cả collection rồi so `toLowerCase()` từng document. Vì `SaveVocabUseCase` gọi `existsByHeadword` **trước mỗi lần lưu**, mỗi lần lưu 1 từ tốn **N lượt đọc** (N = số từ của ngôn ngữ đó). Với vài trăm từ thì ổn; với hàng nghìn từ sẽ tốn và chậm.
3. **Cách cải thiện nếu bị hỏi:** lưu thêm trường `headwordLower` rồi truy vấn `where('headwordLower', isEqualTo: ...)` (đọc 0–1 document), hoặc dùng id document = headword chuẩn hoá để `get(doc)` trực tiếp.

**Vậy Hive đi đâu?** Còn đúng 1 chỗ dùng: `lib/core/services/hive_migration_service.dart` — và chính comment đầu file nói rõ nhất:

> *"One-time push of any pre-existing local Hive vocab/topics data into a newly-authenticated user's Firestore collections... normal app startup no longer opens Hive at all once this migration path is the only remaining Hive consumer."*

**Diễn giải đúng lịch sử (khớp memory `flutter_bloom_redesign`/`project_status`):** kiến trúc ban đầu (Plan 2-4, giữa 2026-07) đúng là offline-first thật — Hive là nguồn chính, có một `SyncService` bidirectional Hive↔Firestore với echo-guard chống vòng lặp cập nhật và dedup theo `headword|language`. **Về sau, khi đăng nhập trở thành bắt buộc trên toàn app** ("mandatory sign-in" — thấy rõ qua comment `vocabRepositoryProvider` ở §2.1: *"unreachable now that sign-in is mandatory app-wide"*), lý do tồn tại chính của offline-first (dùng được app khi chưa đăng nhập/mất mạng) không còn áp dụng theo cách cũ, và app đã **đơn giản hoá về Firestore-only** cho vocab — `HiveMigrationService` chỉ còn nhiệm vụ dọn dẹp dữ liệu tồn dư từ những user đã dùng app **trước khi** đổi sang bắt buộc đăng nhập.

**Hệ quả cần biết khi bị hỏi:**
- *"App có hoạt động offline không?"* — Trả lời trung thực gồm **hai vế**: (a) **ứng dụng không còn lớp cache tự thiết kế** (không còn Hive làm cache sống, không có đồng bộ hai chiều); (b) hành vi khi mất mạng do **cache mặc định của Firestore SDK** quyết định — grep `lib/` **không thấy** cấu hình `Settings(persistenceEnabled: ...)` nào, tức app dùng mặc định của SDK (mobile: bật; web: tắt). Vì vậy **chưa được kiểm chứng** app đọc/ghi thế nào khi ở chế độ máy bay — đặc biệt lệnh ghi bị SDK xếp hàng nên `await save(...)` có thể **treo** thay vì báo lỗi. Đừng khẳng định "báo lỗi ngay" hay "chạy offline tốt" khi chưa thử thật.
- *"Vậy Hive để làm gì?"* — Chỉ còn là *lưới an toàn di trú dữ liệu* cho user cũ, chạy đúng 1 lần, tự đánh dấu đã chạy qua `SharedPreferences` (`hive_migrated_$uid`) để không lặp lại và không ghi đè dữ liệu mới hơn trên Firestore bằng dữ liệu Hive cũ hơn.
- **Không có file `firestore.rules` trong repo** (khác `storage.rules` — file này **có** ở gốc repo) — Security Rules của Firestore được quản lý thủ công qua Firebase Console (đúng như hướng dẫn setup trong README §2), không version-controlled. Đây là một khoảng trống đáng biết thật: không có lịch sử thay đổi rules qua git cho Firestore, khác hẳn Storage.

## 2.9 Testing thật trong LexiCore

- **`test/core/router/auth_redirect_test.dart`** (nêu ở §2.3) — ví dụ sống cho "tách hàm thuần để test không cần mock nặng": test gọi thẳng `authRedirectDecision(...)` với các tổ hợp `hasResolved`/`signedIn`/`matchedLocation`, không dựng `GoRouter` hay `FirebaseAuth` giả.
- **Domain layer test không cần Firebase** — `ComputeSm2UseCase`, `shouldUseFlashcard`, `drawSessionAiRatio` đều là hàm/class thuần, test bằng input/output trực tiếp.
- **Bản giả thay vì mock trực tiếp Firebase:** `pubspec.yaml` có `fake_cloud_firestore` (Firestore giả chạy trong bộ nhớ — một **fake**, đúng khái niệm ở Phần 1.9) và `mocktail`. `hive_migration_service_test.dart` dùng seam `vocabRepositoryBuilder` để tiêm một `VocabRepository` giả có `save()` ném lỗi — vì `FakeFirebaseFirestore` không giả lập được lỗi ghi (comment trong `hive_migration_service.dart` nói rõ).
- **Seam qua interface:** `CloudFunctionCaller` (`cloud_function_caller.dart`) là interface mỏng bọc `httpsCallable` — comment trong file: *"this codebase's established pattern is to test through an injected interface (e.g. VocabRepository, TtsService) rather than mock the Firebase SDK's own concrete classes directly."* — đúng khái niệm "đưa phụ thuộc qua interface" ở Phần 1.9.
- **Điểm yếu đã nêu ở §2.6:** `ComputeSm2UseCase` gọi `DateTime.now()` bên trong nên khó test ngày chính xác.
- Theo CLAUDE.md, project dùng skill `tdd` (`superpowers:test-driven-development`) làm quy trình mặc định khi thêm feature/sửa bug — viết test trước, thấy đỏ, rồi mới viết code cho xanh.
- Kiểm đếm test hiện tại (theo memory gần nhất, cần chạy lại `flutter test`/`npm test` để lấy số chính xác nếu bị hỏi số cụ thể) — đừng đọc thuộc một con số cũ như thể nó luôn đúng; nếu bị hỏi, nói "khoảng X, để tôi chạy lại cho chính xác" an toàn hơn là chốt một số có thể đã lệch.

## 2.10 Kiến trúc triển khai — region pinning thật, 4 đơn vị deploy độc lập

Từ `CLAUDE.md` (ground truth do chính dự án ghi, đã đối chiếu khớp `firebase.json` đọc được ở trên):

| Thành phần | Nơi chạy | Cách deploy |
|---|---|---|
| Flutter mobile | Android/iOS thật | `flutter build apk/appbundle/ipa --release` — không qua CI |
| React web (`apps/web/`) | Firebase App Hosting, backend id `lexicore-web` | Push nhánh đã kết nối → tự build (thấy trong `firebase.json`: `"apphosting": {"backendId": "lexicore-web", "rootDir": "apps/web"}`) |
| Cloud Functions (`functions/`) | Serverless, region `asia-southeast1` | `firebase deploy --only functions` — CLI thủ công, **không** tự động theo git push |
| Cloud Run TTS/STT (`services/tts-stt/`) | Container riêng, region `asia-southeast1` | `gcloud run deploy` — **khác lệnh** với Cloud Functions dù cùng phục vụ "AI backend" |

**Region pinning thật trong code:** `generateContent.ts:120-123`:
```ts
export const generateContent = onCall(
  { region: "asia-southeast1", maxInstances: 10, timeoutSeconds: 120 },
  generateContentHandler
);
```
CLAUDE.md nhấn mạnh: client Flutter/web phải gọi `getFunctions(app, "asia-southeast1")` khớp đúng vùng này — lệch vùng miền thì `httpsCallable` **âm thầm gọi sai endpoint**, không có lỗi rõ ràng ngay lập tức, khó debug hơn nhiều so với lỗi biên dịch hay lỗi 404 rõ ràng.

**`maxInstances: 10`** — một chi tiết nhỏ nhưng đáng biết: giới hạn cứng số instance scale-out, chặn được kịch bản chi phí bùng nổ nếu có traffic bất thường (hoặc bug gọi lặp), đổi lại chấp nhận request bị từ chối nếu vượt quá 10 instance đồng thời — một quyết định trade-off cost vs availability có chủ đích, đáng nêu ra nếu bị hỏi "sao không để tự scale thoải mái".

## 2.11 Firebase Authentication — `AuthNotifier` thật (khớp Phần 1.11)

`lib/features/settings/presentation/providers/auth_notifier.dart` (toàn bộ ~35 dòng):
```dart
@Riverpod(keepAlive: true)
class AuthNotifier extends _$AuthNotifier {
  @override
  Stream<User?> build() => FirebaseAuth.instance.authStateChanges();

  Future<void> signInWithGoogle() async {
    if (kIsWeb) {
      final provider = GoogleAuthProvider()..setCustomParameters({'prompt': 'select_account'});
      await FirebaseAuth.instance.signInWithPopup(provider);
      return;
    }
    final googleUser = await GoogleSignIn().signIn();
    if (googleUser == null) return;                       // người dùng huỷ → im lặng thoát
    final googleAuth = await googleUser.authentication;
    final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken, idToken: googleAuth.idToken);
    await FirebaseAuth.instance.signInWithCredential(credential);
  }
  ...
}
```

**Điều đọc được (và đáng kể khi bị hỏi):**
- **Hai luồng đăng nhập theo nền tảng** (`kIsWeb`): web dùng `signInWithPopup`; mobile dùng gói `google_sign_in` → lấy `accessToken` + `idToken` của Google → `signInWithCredential` — đúng như mô tả ở Phần 1.11. Ở nhánh web, `prompt: select_account` buộc hiện hộp chọn tài khoản mỗi lần (không tự đăng nhập lại tài khoản trước).
- **Chỉ có Google.** `AuthNotifier` không có đăng nhập email/mật khẩu, **không có account linking**, không gọi backend riêng, **không có role** — khác hẳn Pocket Split (email + Google + linking hai chiều + `GET /me` lấy role từ PostgreSQL). Lý do hợp lý: LexiCore là ứng dụng cá nhân một vai trò, không cần phân quyền theo role.
- **Trạng thái đăng nhập = chính stream của Firebase**, bọc thành `AsyncValue<User?>` nhờ `StreamNotifier` (xem bảng ở §2.1). `vocabRepositoryProvider` `watch` nó nên **đổi tài khoản là repository tự dựng lại với `uid` mới**.
- **Có hai người nghe cùng một stream:** router có `_AuthRefreshStream` riêng nghe `authStateChanges()` (§2.3), còn provider dùng `authNotifierProvider`. Không sai (cùng nguồn) nhưng là **trùng lặp** — nếu bị hỏi "có thể gộp không" thì có thể cho router đọc từ provider, đổi lại phải xử lý `hasResolved` qua `AsyncValue`.
- **Đăng nhập bắt buộc** được bảo đảm bởi `authRedirectDecision` (§2.3), và các provider bên trong app **giả định** đã đăng nhập (`vocabRepositoryProvider` throw nếu không).
- `signOut()` gọi `GoogleSignIn().signOut()` (chỉ mobile) rồi `FirebaseAuth.instance.signOut()` — phải đăng xuất cả hai, nếu không lần sau Google có thể tự chọn lại tài khoản cũ.

**Hai bẫy cấu hình đã được dự án ghi lại** (README/CLAUDE.md): (1) Android **bắt buộc** đăng ký SHA-1 của keystore (debug, release/upload **và** Play App Signing) — thiếu thì màn chọn tài khoản mở rồi đóng ngay (`ApiException: 10`); (2) web: domain mới phải được thêm vào **Authorized domains**, nếu không popup đóng im lặng.

## 2.12 Cloud Functions `onCall` — khuôn chung của hai function (khớp Phần 1.12)

`encryptApiKey.ts` và `generateContent.ts` có **cùng một khuôn**, đọc thẳng từ code:

```ts
if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
if (!isXxxRequest(request.data)) throw new HttpsError("invalid-argument", "...");
// ... làm việc, bọc try/catch, dịch lỗi sang HttpsError ...
export const xxx = onCall({ region: "asia-southeast1", maxInstances: 10, timeoutSeconds: N }, handler);
```

| Khía cạnh | `encryptApiKey` | `generateContent` |
|---|---|---|
| Kiểm tra đăng nhập | `!request.auth` → `unauthenticated` | Giống |
| Kiểm tra đầu vào | type guard: `apiKey` là chuỗi không rỗng | type guard: đúng `provider`, `model`, `prompt`, và **đúng một** trong `apiKey`/`apiKeyCiphertext` |
| `timeoutSeconds` | **30** (chỉ một lần gọi KMS) | **120** (chờ nhà cung cấp AI trả lời — có thể chậm) |
| Việc chính | `encryptWithKms(key, uid)` | `decryptWithKms(...)` → `switch(provider)` → adapter |

**Dịch lỗi của nhà cung cấp ngoài** (`generateContent.ts:85-117`): `ProviderApiError.status` được ánh xạ — `401/403` → `permission-denied` ("Provider rejected the API key"), `429` → `resource-exhausted`, `5xx` → `unavailable`, còn lại → `internal`. Lỗi được `logger.error` với **`provider` và `message` lỗi**, không log `apiKey`/`prompt`. Thông báo trả về client là **câu chung** ("AI provider call failed"), không lộ chi tiết nội bộ — đúng "bẫy số 3" ở Phần 1.12.

**Phía client** (`lib/core/services/cloud_function_caller.dart`): `FirebaseCloudFunctionCaller` dùng `FirebaseFunctions.instanceFor(region: 'asia-southeast1')` rồi `httpsCallable(name).call(data)`. Comment trong file: *"the client must request the same region, or httpsCallable silently targets the wrong endpoint."* Interface `CloudFunctionCaller` bọc lại để test tiêm bản giả (§2.9).

**Đánh đổi có thể bị hỏi:** `ApiKeyEncryptor.encrypt` (`encrypt_api_key.dart:26-39`) **bắt mọi lỗi** rồi ném một thông báo chung "Không thể mã hoá API key. Vui lòng thử lại." — người dùng thấy câu thân thiện, nhưng client **không phân biệt được** `unauthenticated` với `internal`, nên không thể hướng dẫn hành động khác nhau (ví dụ "đăng nhập lại"). Đây là chỗ có thể cải thiện bằng cách đọc `FirebaseFunctionsException.code`.

## 2.13 Đọc JSON từ AI "chịu lỗi" — `parseAiJsonObject` (khớp Phần 1.13)

`lib/core/utils/ai_json_parser.dart` — **một hàm dùng chung cho 10 nguồn AI** (`gemini_dictionary_source`, `exercise_generator_source`, `reading_passage_source`, `part5/6/7_source`, `dictation_source`, `listening_passage_source`, `word_radar_source`, `knowledge_note_source`):

```dart
Map<String, dynamic> parseAiJsonObject(String raw) {
  final stripped = _stripTrailingCommas(_stripCodeFences(raw.trim()));
  try {
    return jsonDecode(stripped) as Map<String, dynamic>;
  } on FormatException {
    final extracted = _extractBalancedObject(stripped);
    if (extracted == null) rethrow;            // không cứu được → ném lỗi cho tầng trên
    return jsonDecode(extracted) as Map<String, dynamic>;
  }
}
```

Bốn lớp đúng như Phần 1.13: **bỏ hàng rào code** (`_stripCodeFences`, một regex bắt khối được bao bởi ba dấu backtick, có hoặc không nhãn `json`) → **bỏ dấu phẩy thừa** (`_stripTrailingCommas`, quét từng ký tự, có cờ `inString`/`escaped`) → **parse** → nếu lỗi thì **trích object cân bằng ngoặc** (`_extractBalancedObject`, cũng nhận biết chuỗi).

**Hai ví dụ chạy tay:**

| Đầu vào | Xử lý | Kết quả |
|---|---|---|
| ` ```json ` xuống dòng `{"a": [1, 2,],}` xuống dòng ` ``` ` | bỏ hàng rào → bỏ 2 dấu phẩy thừa → `{"a": [1, 2]}` | parse ngay được |
| `Kết quả: {"a": "x, }"} hết` | không có hàng rào; `jsonDecode` lỗi vì có chữ dẫn → trích cân bằng: dấu `}` **trong chuỗi** `"x, }"` bị bỏ qua nhờ cờ `inString` | `{"a": "x, }"}` |

Ví dụ thứ hai chính là lý do phải **nhận biết chuỗi**: nếu chỉ đếm `{`/`}` thô, dấu `}` nằm trong giá trị sẽ đóng object sớm và cắt sai.

**Bằng chứng kiểm thử** (`test/core/utils/ai_json_parser_test.dart`, mở rộng trong đợt cập nhật gần đây): có ca cho hàng rào có/không nhãn `json`, chữ theo sau JSON, **ngoặc trong giá trị chuỗi**, không có JSON nào (`throwsFormatException`), dấu phẩy thừa trước `}` và `]`, dấu phẩy thừa **lồng trong mảng object**, và ca "**không được đụng** dấu phẩy nằm *trong* giá trị chuỗi" (`"literally a trailing comma, right here"`). Comment trong code giải thích vì sao bỏ dấu phẩy thừa **vô điều kiện** thay vì chỉ khi lỗi: AI phát ra chúng khá thường trên đầu ra dài, lồng nhiều tầng (bản dịch + nhiều gợi ý).

**Giới hạn cần biết:** hàm này chỉ đảm bảo ra **một `Map` hợp lệ**, **không** kiểm tra hình dạng (thiếu trường, mảng rỗng...) — việc đó do từng source tự làm sau khi parse (Phần 1.13, "kiểm tra hình dạng").

---

## Khoảng trống/khác biệt thật cần biết (đối chiếu tài liệu dự án vs code)

| Tài liệu dự án nói | Thực tế code | Nên trả lời sao |
|---|---|---|
| README: "Offline-first: Hive là nguồn dữ liệu chính" | Đã lỗi thời — `VocabRepositoryImpl` chỉ dùng Firestore, Hive chỉ còn migration 1 lần (§2.8) | *"README mô tả kiến trúc ban đầu; app đã đơn giản hoá về Firestore-only sau khi đăng nhập trở thành bắt buộc — Hive giờ chỉ là lưới an toàn di trú dữ liệu cũ."* |
| Không có `firestore.rules` trong repo | Đúng — chỉ `storage.rules` được version-control; Firestore rules quản lý qua Console | *"Đây là khoảng trống thật — nên đưa Firestore rules vào repo để có lịch sử thay đổi, hiện chưa làm."* |
| Nhiều tài liệu cũ (memory/spec) nhắc `SyncService`, echo-guard, headword-index | Class đó không còn tồn tại trong `lib/` hiện tại (đã grep xác nhận) | *"Đó là kiến trúc của một giai đoạn trước — đã được thay bằng ghi thẳng Firestore, không còn lớp đồng bộ hai chiều riêng."* |
| "Có bản cache Hive nên offline vẫn đọc được" / "mất mạng thì báo lỗi ngay" | **Cả hai đều chưa kiểm chứng.** Không còn cache tự thiết kế; hành vi offline do cache mặc định của Firestore SDK quyết định (không có `Settings(persistenceEnabled)` trong `lib/`) | *"App không tự quản lý cache nữa; hành vi offline dựa vào SDK Firestore và mình chưa kiểm thử ở chế độ máy bay."* (§2.8) |
| Ngầm hiểu Firestore truy vấn có điều kiện hiệu quả | `getAll`/`getByHeadword` tải **cả collection** rồi lọc bằng Dart; mỗi lần lưu từ tốn N lượt đọc vì `existsByHeadword` (§2.8) | *"Chấp nhận được ở quy mô vài trăm từ; hướng sửa: trường `headwordLower` + truy vấn `where`, hoặc dùng id document là headword chuẩn hoá."* |
| SM-2 "chuẩn" thay đổi EF theo từng câu trả lời | Bài tập thường chỉ có `quality` 5 hoặc 1 nên EF gần như cố định 2.5; chỉ Nghe chép có quality nhiều mức (§2.6) | *"Lịch ôn thực chất theo `repetitions`; thích nghi EF chỉ xảy ra ở Nghe chép — hướng mở rộng là cho người dùng tự chấm nhiều mức."* |
| Mô tả kiến trúc dùng "envelope encryption" cho khoá AI | Chỉ là **KMS direct encryption** trên chuỗi ngắn, có AAD = uid (§2.4) | *"Mình dùng Cloud KMS trực tiếp cho chuỗi nhỏ, không cần envelope."* |
| Notifier "viết tay + code-gen chạy song song" | 16/16 notifier là code-gen; chỉ 1 provider viết tay (§2.1) | Nói đúng: *"hầu hết code-gen, một provider family viết tay."* |

---

## Checklist ôn nhanh trước phỏng vấn

- [ ] Giải thích được đồ thị DI của Riverpod code-gen: vì sao `vocabRepositoryProvider` là điểm hội tụ, vì sao nó `throw` thay vì trả rỗng khi chưa đăng nhập.
- [ ] Vẽ được luồng bảo mật key AI đầy đủ 2 phía: Flutter mã hoá qua Cloud Function `encryptApiKey` → lưu ciphertext → khi cần gọi AI thật, Cloud Function `generateContent` decrypt bằng KMS + AAD = uid → gọi provider thật → không log, không lưu plaintext.
- [ ] Giải thích được vì sao `AiClientFactory` vẫn giữ interface `GenerativeModelClient` dù hiện chỉ có 1 implementation — giá trị thật của lập trình theo interface.
- [ ] Kể được đúng công thức SM-2 (3 biến, ngưỡng quality < 3) **và** kể được bug dấu phẩy động `1 - 0.7 ≠ 0.3` thật đã gặp, cách sửa (`roll + aiRatio < 1.0`).
- [ ] Giải thích được content-addressable cache cho TTS: vì sao dùng SHA-256 của nội dung làm key thay vì ID ngẫu nhiên.
- [ ] **Trả lời đúng thực tế** (không lặp README) khi bị hỏi "app có offline-first không" — biết rõ Hive hiện chỉ là migration, không phải cache sống.
- [ ] Giải thích được vì sao 4 thành phần (mobile/web/Functions/Cloud Run) có 4 cách deploy khác nhau dù cùng 1 repo, và vì sao region phải khớp giữa client và server.
- [ ] Kể được ví dụ tách hàm thuần để test (`authRedirectDecision`, `shouldUseFlashcard`) — vì sao cách viết này giảm nhu cầu mock.
- [ ] **Riverpod:** phân biệt được `watch`/`read`/`listen`/`invalidateSelf`; nói được kiểu `build()` quyết định loại provider; nêu đúng vì sao `currentUidProvider` cố tình **không** `keepAlive`; so sánh được viết tay (Pocket Split) với code-gen (LexiCore) qua bảng ở §2.1.
- [ ] **GoRouter:** phân biệt `ShellRoute` (LexiCore) với `StatefulShellRoute` (Pocket Split) và hệ quả với state từng tab; giải thích `hasResolved` + `refreshListenable`.
- [ ] **Auth:** kể được hai luồng Google (mobile `google_sign_in` + `signInWithCredential` / web `signInWithPopup`); phân biệt identity với authorization; nêu được 2 bẫy cấu hình (SHA-1, Authorized domains).
- [ ] **`onCall`:** nói được khuôn chung (`request.auth` → validate `request.data` → dịch lỗi sang `HttpsError`); vì sao `timeoutSeconds` khác nhau giữa hai function; vì sao region phải khớp.
- [ ] **Parse JSON của AI:** kể được 4 lớp phòng thủ và vì sao phải nhận biết chuỗi khi đếm ngoặc.
- [ ] **Trung thực về giới hạn:** nói được (không né) 4 điểm — quét cả collection khi kiểm tra trùng, hành vi offline chưa kiểm chứng, EF gần như cố định, Firestore rules không nằm trong repo.
- [ ] **Bẫy thuật ngữ:** KMS direct ≠ envelope encryption.
