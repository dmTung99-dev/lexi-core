# LexiCore — Spec Kiến Thức Dự Án

**Mục đích tài liệu này:** giống hệt tinh thần bản Pocket Split ([`docs/pocket-split-knowledge-spec.md`](pocket-split-knowledge-spec.md)) — bạn là người đưa ý tưởng/định hướng, AI viết phần lớn code, nhưng khi bị hỏi "bạn đã làm gì" thì câu trả lời phải là **hiểu vì sao code viết vậy và tự sửa/mở rộng được**, không phải "AI viết hết". Hai phần:

- **Phần 1 — Kiến thức nền tảng:** khái niệm chung, trả lời được kể cả không mở code.
- **Phần 2 — Áp dụng trong LexiCore:** đúng file, đúng dòng, đúng luồng thật trong dự án — để chỉ thẳng vào code khi bị hỏi "cho ví dụ cụ thể".

LexiCore lớn hơn Pocket Split nhiều (Flutter mobile + React web + Cloud Functions + Cloud Run, hàng trăm commit qua nhiều "Plan"), nên tài liệu này **không** cố phủ hết mọi tính năng — nó chọn 10 mảng kiến thức có giá trị nhất khi bị phỏng vấn kỹ thuật, đều đã đối chiếu trực tiếp với code hiện tại (không chỉ dựa vào README/CLAUDE.md).

> ⚠️ **Phát hiện quan trọng khi soạn tài liệu này:** `README.md` hiện vẫn mô tả *"Offline-first: Hive là nguồn dữ liệu chính"* — **không còn đúng với code hiện tại**. Xem mục 2.8 để hiểu chuyện gì đã xảy ra và trả lời đúng thực tế thay vì lặp lại README. Đây không phải lỗi của bạn hay của AI — README đơn giản là chưa được cập nhật sau khi kiến trúc đổi.

---

# PHẦN 1 — KIẾN THỨC NỀN TẢNG CẦN NẮM

## 1.1 Riverpod với code generation (`@riverpod`)

**Vấn đề nó giải quyết:** viết provider tay (như Pocket Split) dễ quên đăng ký đúng kiểu (`Provider`/`NotifierProvider`/`AsyncNotifierProvider`), dễ sai kiểu generic. Code generation (`riverpod_annotation` + `build_runner`) sinh ra provider + `Ref` type-safe từ một annotation `@riverpod` trên function/class, giảm boilerplate và lỗi runtime.

**Khái niệm:**
- `@riverpod` (function hoặc class) → sinh 1 provider cùng tên (viết hoa chữ đầu, hậu tố `Provider`) trong file `.g.dart` cùng tên (`part 'x.g.dart';`).
- `@Riverpod(keepAlive: true)` — mặc định provider bị **auto-dispose** khi không còn ai `watch` nó (giải phóng bộ nhớ tự động — khác Pocket Split, nơi mọi provider sống suốt vòng đời app). `keepAlive: true` tắt auto-dispose — dùng cho service cần sống xuyên suốt (HTTP client, service phát âm...) mà việc bị dispose giữa chừng sẽ gây lỗi (ví dụ: đang phát audio thì object bị huỷ).
- **Provider phụ thuộc provider khác qua `ref.watch(...)`** — tạo thành một đồ thị dependency (DI graph) được Riverpod tự quản lý thứ tự khởi tạo, không cần constructor injection thủ công.
- Vẫn dùng song song `Notifier`/`AsyncNotifier` viết tay khi state cần method thay đổi phức tạp (không chỉ là "tính ra 1 giá trị từ input khác").

## 1.2 Clean Architecture + feature-first folder structure

**Vấn đề nó giải quyết:** một app có ~15 tính năng lớn (tra từ, vocab bank, luyện tập, đọc, nghe, kiến thức...) — nếu không tách lớp, code nghiệp vụ (thuật toán SM-2, validate) sẽ dính chặt vào UI hoặc vào cách gọi Firestore, rất khó test và khó thay backend.

**3 lớp chuẩn trong mỗi feature:**
- **`domain/`** — `entities` (model thuần Dart, không phụ thuộc Flutter/Firebase), `repositories` (interface trừu tượng), `use_cases` (1 class = 1 hành động nghiệp vụ, ví dụ "tính điểm SM-2"). Lớp này **test được mà không cần mock Firebase**.
- **`data/`** — implement interface ở domain bằng nguồn dữ liệu thật (`*_impl.dart`, `*_source.dart` gọi API/Firestore).
- **`presentation/`** — `providers` (Riverpod, cầu nối UI↔domain), `screens`, `widgets`.
- **Feature-first thay vì layer-first ở gốc** — thư mục chia theo tính năng (`features/dictionary/`, `features/vocabulary/`...) trước, rồi mới chia theo layer bên trong mỗi feature — giúp xoá/thêm cả một tính năng mà không phải lục nhiều thư mục layer rải rác.

## 1.3 GoRouter — guard bắt buộc đăng nhập, tách hàm thuần để test

**Vấn đề nó giải quyết:** giống Pocket Split (route guard), nhưng thêm một vấn đề: logic quyết định redirect càng phức tạp càng khó test nếu nó nằm lẫn trong closure của `GoRouter`.

**Khái niệm mới so với Pocket Split:**
- **Tách "quyết định redirect" thành một hàm thuần (pure function)** — nhận state đơn giản (đã đăng nhập chưa, đã resolve chưa, đang ở đâu), trả về path cần redirect hoặc `null`. Hàm này **không** phụ thuộc `BuildContext`, `GoRouterState`, hay Firebase thật → test unit trực tiếp, không cần dựng widget tree hay giả lập Firebase.
- **Trạng thái "chưa resolve"** — auth stream của Firebase là bất đồng bộ; trước khi nó bắn giá trị đầu tiên, app **không biết** user đã đăng nhập hay chưa. Cần một cờ `hasResolved` riêng (không chỉ `null`/`true`/`false`) để phân biệt "đang tải" với "đã tải xong và chưa đăng nhập" — nếu lẫn 2 trạng thái này, sẽ có khung hình redirect sai (đá về login dù đang chờ), y hệt race-condition đã nói ở Pocket Split §1.2 nhưng LexiCore xử lý nó tường minh hơn.

## 1.4 Bảo mật khoá AI: mô hình BYOK + mã hoá phong bì (envelope encryption)

**Vấn đề nó giải quyết:** app cho người dùng tự nhập API key của họ (BYOK = Bring Your Own Key) để gọi Gemini/Groq/OpenRouter. Key này **tuyệt đối không được lưu dạng plaintext** ở bất cứ đâu (Firestore, log, SharedPreferences) — vì Firestore dù có Security Rules vẫn là một điểm lộ nếu rules sai hoặc bị bypass, và log là nơi rất dễ vô tình làm lộ bí mật.

**Khái niệm:**
- **Envelope encryption với Cloud KMS** — thay vì tự quản lý khoá mã hoá trong code, dùng dịch vụ quản lý khoá riêng (Cloud KMS) để encrypt/decrypt; ứng dụng chỉ lưu **ciphertext**, không bao giờ cầm khoá gốc.
- **AAD (Additional Authenticated Data)** — gắn thêm một giá trị (ở đây là `uid` người dùng) vào phép mã hoá, khiến ciphertext chỉ decrypt đúng khi cung cấp đúng AAD đó. Đây là lớp phòng thủ sâu (defense-in-depth): dù ciphertext của user A bị đọc trộm và chèn vào request của user B, decrypt vẫn thất bại vì AAD (uid) không khớp.
- **Decrypt chỉ xảy ra phía server, trong bộ nhớ, dùng xong là mất** — client không bao giờ tự decrypt được, kể cả chính chủ của key.

## 1.5 Multi-provider abstraction — Factory + interface chung

**Vấn đề nó giải quyết:** app hỗ trợ 3 nhà cung cấp AI (Gemini SDK riêng, Groq/OpenRouter theo chuẩn OpenAI-compatible REST) — muốn toàn bộ phần còn lại của app (9 tính năng đều gọi AI) không cần biết đang dùng provider nào.

**Khái niệm:**
- **Interface chung (abstract class)** định nghĩa đúng 1 method mọi provider phải có (`generateContent`) — các "source" khác (dictionary, exercise, reading...) chỉ phụ thuộc interface này, không phụ thuộc provider cụ thể → thêm provider thứ 4 không đụng vào 9 nơi gọi AI.
- **Factory pattern** — 1 hàm tĩnh nhận cấu hình (provider nào, model gì) và trả về đúng implementation, ẩn hết logic "chọn class nào" khỏi nơi gọi.
- **Proxy pattern qua backend** — bản thân implementation phía client không gọi thẳng ra Internet tới Gemini/Groq nữa, mà gọi 1 Cloud Function `onCall` — cùng 1 hình dạng lời gọi (`provider`, `model`, `prompt`) bất kể provider thật là gì, decrypt + gọi provider thật xảy ra hoàn toàn ở server.

## 1.6 Thuật toán SM-2 (Spaced Repetition) và xác suất hoá bài tập

**Vấn đề nó giải quyết:** lên lịch ôn tập tối ưu theo trí nhớ — từ nhớ tốt thì giãn cách ôn ra xa hơn, từ quên thì ôn lại sớm.

**Khái niệm cốt lõi (SM-2 gốc):**
- 3 biến trạng thái mỗi từ: `repetitions` (số lần ôn đúng liên tiếp), `interval` (số ngày tới lần ôn kế), `easeFactor`/`EF` (hệ số độ dễ, càng cao thì khoảng cách giãn càng nhanh).
- `quality` (0-5, người dùng tự đánh giá hoặc suy ra từ đúng/sai) **< 3** → coi như "quên", reset `repetitions = 0`, `interval = 1`.
- `quality ≥ 3` → `repetitions` tăng 1; `interval` mới = 1 (lần đầu), 6 (lần hai), hoặc `interval_cũ × EF` (từ lần ba); `EF` mới = `EF + 0.1 - (5 - quality) × 0.08`, giới hạn trong `[1.3, 2.5]` (EF không được xuống dưới 1.3, thấp hơn thì việc ôn gần như không giãn ra được nữa).

**Khái niệm bonus riêng của dự án này (không phải SM-2 gốc):** một phiên ôn tập có thể trộn flashcard (không cần AI) với bài AI-sinh (multiple choice/fill-blank/translation theo cấp CEFR) — cần một **hàm xác suất thuần** (nhận sẵn 1 số ngẫu nhiên từ bên ngoài, không tự gọi RNG bên trong) để dễ test bằng cách truyền giá trị cố định thay vì phải seed random.

## 1.7 Tự host TTS/STT (không dùng API trả phí) + cache theo địa chỉ nội dung (content-addressable caching)

**Vấn đề nó giải quyết:** phát âm từ điển cần TTS, nhưng gọi TTS provider trả phí mỗi lần một từ được tra là tốn kém và dư thừa (cùng 1 từ được hàng nghìn user tra đi tra lại).

**Khái niệm:**
- **Self-hosted model container** (Piper cho TTS, faster-whisper cho STT) đóng gói Docker, triển khai trên nền tảng serverless container (Cloud Run) — trả tiền theo request thật, scale về 0 khi không ai dùng, không phải trả phí theo API call của bên thứ 3.
- **Content-addressable cache** — key cache = hash (SHA-256) của chính nội dung cần tạo (text + ngôn ngữ + giọng), **không phải** một ID ngẫu nhiên. Hệ quả: 2 user tra cùng 1 từ, cùng ngôn ngữ/giọng sẽ luôn ra cùng 1 đường dẫn cache — tự động dùng chung file, không cần bảng tra cứu riêng để biết "từ này đã có audio chưa", chỉ cần tính lại hash và kiểm tra file có tồn tại không.
- **Cache-first, generate-on-miss** — kiểm tra file đã tồn tại trong storage chưa; có rồi thì trả thẳng URL, chưa có mới gọi model sinh audio rồi lưu lại.

## 1.8 Firestore là nguồn dữ liệu chính (không phải chỉ để cache/demo)

**Khác với Pocket Split** (nơi Firestore chỉ đọc/stream, ghi thật qua backend riêng), ở LexiCore, **client Flutter/React đọc/ghi Firestore trực tiếp** cho phần lớn dữ liệu (từ vựng, chủ đề, bài luyện đã lưu, ghi chú kiến thức) — không có backend trung gian cho CRUD. Backend riêng (Cloud Functions) **chỉ** tồn tại cho phần cần giữ bí mật hoặc cần tài nguyên server (gọi AI, TTS/STT) — đúng nguyên tắc "chỉ đưa lên server phần thật sự cần server làm, phần còn lại để Firestore Security Rules tự bảo vệ".

**Khái niệm cần nắm thêm:**
- **Trade-off của mô hình "client ghi thẳng Firestore"**: đơn giản, ít latency hơn một backend trung gian, nhưng mọi ràng buộc nghiệp vụ (không cho ghi đè dữ liệu người khác, giới hạn kích thước...) phải nằm hết trong Security Rules — không có tầng nào khác kiểm tra được.
- **Subcollection theo `users/{uid}/...`** — mỗi user một cây dữ liệu riêng, Security Rules đơn giản (so `request.auth.uid == uid`) thay vì phải lọc theo mảng thành viên như Pocket Split.

## 1.9 Testing: TDD + tách hàm thuần để dễ test

**Khái niệm:**
- **TDD (Test-Driven Development)** — viết test trước khi viết code hiện thực, test đỏ → viết code tối thiểu cho xanh → refactor. Giá trị lớn nhất không phải "có test" mà là **thiết kế API rõ ràng hơn** vì bạn phải tưởng tượng cách gọi nó trước khi có cách gọi nào tồn tại.
- **Tách hàm thuần (pure function extraction) để test không cần mock nặng** — logic quyết định (redirect, trộn AI/flashcard, tính SM-2) được viết thành hàm nhận input rõ ràng, trả output rõ ràng, không tự gọi I/O bên trong → test trực tiếp, không cần giả lập Firebase/HTTP.
- **`mocktail`** — thư viện mock không cần code generation (khác `mockito` cần `build_runner`), dùng khi cần giả lập một interface (ví dụ `VocabRepository`) để test layer trên nó mà không chạm Firestore thật.

## 1.10 Kiến trúc triển khai đa nền tảng (monorepo) + ghim vùng miền (region pinning)

**Vấn đề nó giải quyết:** một sản phẩm, 2 client (mobile Flutter + web Next.js) dùng chung backend/dữ liệu — cần quyết định nơi mỗi phần chạy và đảm bảo chúng nói chuyện đúng chỗ với nhau.

**Khái niệm:**
- **Monorepo có nhiều "deployable unit" độc lập** — mobile app (build ra APK/IPA, không "deploy" theo nghĩa server), web app (Next.js trên nền tảng hosting có SSR), Cloud Functions (serverless, deploy qua CLI riêng), Cloud Run service (container, deploy qua lệnh riêng, tách hẳn khỏi Cloud Functions dù cùng "backend AI"). Mỗi unit có lệnh deploy, vòng đời, và rủi ro khác nhau — gộp chung vào 1 repo không có nghĩa chúng deploy cùng lúc hay cùng cách.
- **Region pinning** — mọi thành phần server-side phải khai báo cùng 1 vùng miền (thay vì dùng mặc định), và **client phải khai báo khớp** — lệch vùng miền không gây lỗi rõ ràng ngay, mà âm thầm gọi nhầm endpoint hoặc chậm bất thường.

---

# PHẦN 2 — KIẾN THỨC ĐÃ ÁP DỤNG TRONG LEXICORE

> Tham chiếu dưới đây là đường dẫn trong repo `lexi-core` hiện tại (`D:\Flutter\lexi-core`), bám code thật — không phải mô tả lý tưởng từ tài liệu spec.

## 2.1 Riverpod code-gen — bằng chứng cụ thể

Toàn bộ dependency-injection graph của app nằm trong **một file duy nhất**: `lib/core/di/app_providers.dart` (240+ dòng, `part 'app_providers.g.dart'`). Ví dụ:

```dart
@Riverpod(keepAlive: true)
http.Client httpClient(HttpClientRef ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
}
```
`keepAlive: true` ở đây có lý do cụ thể: một `http.Client` bị dispose giữa chừng một request đang bay sẽ làm request đó lỗi — đây là dịch vụ cần sống xuyên suốt app, không phải theo từng màn hình.

**Đồ thị dependency thấy rõ qua ví dụ này** — `vocabRepositoryProvider` (dòng 96-109) là điểm hội tụ của gần như mọi use case (`saveVocabUseCase`, `getVocabListUseCase`, `updateVocabUseCase`...) — mỗi use case chỉ khai `ref.watch(vocabRepositoryProvider)`, không tự new instance, Riverpod tự lo thứ tự khởi tạo:
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
Đáng chú ý: provider này **throw** thay vì trả `null`/giá trị rỗng nếu chưa đăng nhập — đúng nguyên tắc "fail loud" khi một bất biến (invariant) của app bị vi phạm (ở đây: "route này chỉ tới được khi đã đăng nhập", đảm bảo bởi GoRouter guard ở §2.3) — nếu điều đó xảy ra thực sự là bug ở nơi khác (guard bị bypass), nên thà crash rõ ràng còn hơn âm thầm trả dữ liệu rỗng gây khó hiểu.

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

`compute_sm2_use_case.dart` — đúng công thức SM-2 kinh điển mô tả ở Phần 1.6, không có gì lạ. Phần **đáng kể hơn** nằm ở `lib/features/practice/domain/entities/exercise_result.dart`:

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
Future<List<SplitItem>> getAll({...}) async {
  final snapshot = await _vocabCol(language).get();   // luôn gọi network, không có cache
  ...
}
```

**Vậy Hive đi đâu?** Còn đúng 1 chỗ dùng: `lib/core/services/hive_migration_service.dart` — và chính comment đầu file nói rõ nhất:

> *"One-time push of any pre-existing local Hive vocab/topics data into a newly-authenticated user's Firestore collections... normal app startup no longer opens Hive at all once this migration path is the only remaining Hive consumer."*

**Diễn giải đúng lịch sử (khớp memory `flutter_bloom_redesign`/`project_status`):** kiến trúc ban đầu (Plan 2-4, giữa 2026-07) đúng là offline-first thật — Hive là nguồn chính, có một `SyncService` bidirectional Hive↔Firestore với echo-guard chống vòng lặp cập nhật và dedup theo `headword|language`. **Về sau, khi đăng nhập trở thành bắt buộc trên toàn app** ("mandatory sign-in" — thấy rõ qua comment `vocabRepositoryProvider` ở §2.1: *"unreachable now that sign-in is mandatory app-wide"*), lý do tồn tại chính của offline-first (dùng được app khi chưa đăng nhập/mất mạng) không còn áp dụng theo cách cũ, và app đã **đơn giản hoá về Firestore-only** cho vocab — `HiveMigrationService` chỉ còn nhiệm vụ dọn dẹp dữ liệu tồn dư từ những user đã dùng app **trước khi** đổi sang bắt buộc đăng nhập.

**Hệ quả cần biết khi bị hỏi:**
- *"App có hoạt động offline không?"* — Với vocab/practice/reading/listening: **không** còn theo nghĩa đọc/ghi khi mất mạng — mọi `getAll`/`save` gọi Firestore trực tiếp, lỗi mạng sẽ throw. (Vẫn có `.enablePersistence()`/cache mặc định của SDK Firestore ở tầng thấp hơn ứng dụng nếu client bật, nhưng đó là hành vi SDK chung, không phải kiến trúc offline-first có chủ đích của app như README mô tả — không nên khẳng định điều đó nếu chưa xác minh lại cấu hình Firestore SDK cụ thể.)
- *"Vậy Hive để làm gì?"* — Chỉ còn là *lưới an toàn di trú dữ liệu* cho user cũ, chạy đúng 1 lần, tự đánh dấu đã chạy qua `SharedPreferences` (`hive_migrated_$uid`) để không lặp lại và không ghi đè dữ liệu mới hơn trên Firestore bằng dữ liệu Hive cũ hơn.
- **Không có file `firestore.rules` trong repo** (khác `storage.rules` — file này **có** ở gốc repo) — Security Rules của Firestore được quản lý thủ công qua Firebase Console (đúng như hướng dẫn setup trong README §2), không version-controlled. Đây là một khoảng trống đáng biết thật: không có lịch sử thay đổi rules qua git cho Firestore, khác hẳn Storage.

## 2.9 Testing thật trong LexiCore

- **`test/core/router/auth_redirect_test.dart`** (nêu ở §2.3) — ví dụ sống cho "tách hàm thuần để test không cần mock nặng": test gọi thẳng `authRedirectDecision(...)` với các tổ hợp `hasResolved`/`signedIn`/`matchedLocation`, không dựng `GoRouter` hay `FirebaseAuth` giả.
- **Domain layer test không cần Firebase** — `ComputeSm2UseCase`, `shouldUseFlashcard`, `drawSessionAiRatio` đều là hàm/class thuần, test bằng input/output trực tiếp.
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

---

## Khoảng trống/khác biệt thật cần biết (đối chiếu tài liệu dự án vs code)

| Tài liệu dự án nói | Thực tế code | Nên trả lời sao |
|---|---|---|
| README: "Offline-first: Hive là nguồn dữ liệu chính" | Đã lỗi thời — `VocabRepositoryImpl` chỉ dùng Firestore, Hive chỉ còn migration 1 lần (§2.8) | *"README mô tả kiến trúc ban đầu; app đã đơn giản hoá về Firestore-only sau khi đăng nhập trở thành bắt buộc — Hive giờ chỉ là lưới an toàn di trú dữ liệu cũ."* |
| Không có `firestore.rules` trong repo | Đúng — chỉ `storage.rules` được version-control; Firestore rules quản lý qua Console | *"Đây là khoảng trống thật — nên đưa Firestore rules vào repo để có lịch sử thay đổi, hiện chưa làm."* |
| Nhiều tài liệu cũ (memory/spec) nhắc `SyncService`, echo-guard, headword-index | Class đó không còn tồn tại trong `lib/` hiện tại (đã grep xác nhận) | *"Đó là kiến trúc của một giai đoạn trước — đã được thay bằng ghi thẳng Firestore, không còn lớp đồng bộ hai chiều riêng."* |

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
