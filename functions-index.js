/**
 * ============================================================================
 *  예약 게시글 자동 발행 - Cloud Functions (선택 사항)
 * ============================================================================
 *  admin-write.html을 열어둔 탭이 있을 때만 동작하는 폴링 방식과 달리,
 *  이 함수는 서버(Google Cloud Scheduler)에서 1분마다 실행되기 때문에
 *  브라우저를 꺼둬도 예약 시간에 정확히 자동 발행됩니다.
 *
 *  ⚠️ 이 코드는 참고용 소스이며, 저(Claude)는 여기서 직접 배포할 수 없습니다.
 *     아래 "배포 방법"대로 관리자님이 Firebase CLI로 한 번 배포해주셔야 합니다.
 *
 *  [필요 조건]
 *  - Firebase 프로젝트가 Blaze(종량제) 요금제여야 합니다.
 *    (Cloud Scheduler/Pub-Sub은 무료 Spark 요금제에서 지원되지 않습니다.
 *     실제 사용량은 매우 적어 보통 월 課금이 거의 발생하지 않습니다.)
 *
 *  [배포 방법]
 *  1) 터미널에서 프로젝트 폴더로 이동 후:
 *       npm install -g firebase-tools   (처음 한 번만)
 *       firebase login
 *       firebase init functions        (이미 functions 폴더가 있다면 생략)
 *         - 언어: JavaScript
 *         - 기존 프로젝트 선택 시 board-291e3 선택
 *  2) functions/index.js 파일 내용을 이 파일 내용으로 교체
 *  3) functions 폴더에서: npm install firebase-admin firebase-functions
 *  4) 배포:
 *       firebase deploy --only functions
 *  5) 배포 후 Google Cloud Console → Cloud Scheduler에 잡이 자동 생성된 걸 확인하시면 끝입니다.
 * ============================================================================
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

function normalizeName(name) {
    return String(name || "").trim();
}
function normalizePhoneLast4(phone) {
    return String(phone || "").replace(/[^0-9]/g, "").slice(-4);
}
function computeSecretId(boardId, author, phone) {
    const key = `${boardId}::${normalizeName(author)}::${normalizePhoneLast4(phone)}`;
    return crypto.createHash("sha256").update(key).digest("hex");
}

// 매 1분마다 실행 (Cloud Scheduler가 자동으로 관리)
exports.publishScheduledBoards = onSchedule(
    { schedule: "every 1 minutes", timeZone: "Asia/Seoul", region: "us-central1" },
    async () => {
        const now = Timestamp.now();
        const snap = await db.collection("scheduledBoards")
            .where("status", "==", "pending")
            .where("scheduledAt", "<=", now)
            .orderBy("scheduledAt", "asc")
            .limit(20)
            .get();

        if (snap.empty) return;

        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            try {
                const boardRef = db.collection("boards").doc();
                const boardId = boardRef.id;
                const secretId = computeSecretId(boardId, data.author, data.password);

                await boardRef.set({
                    author: data.author,
                    productName: data.title,
                    title: data.title,
                    quantity: "",
                    size: "",
                    price: "",
                    file1Url: null,
                    file2Url: null,
                    uid: data.createdByAdminUid || null,
                    createdAt: new Date(),
                    isDeleted: false,
                    status: "접수에러",
                    fromCart: false,
                    createdByAdmin: true,
                    createdByAdminEmail: data.createdByAdminEmail || ""
                });

                await db.collection("boards").doc(boardId)
                    .collection("private").doc(secretId).set({
                        phone: data.password,
                        address: "",
                        message: data.message,
                        uid: data.createdByAdminUid || null
                    });

                // m/k/s 분류 - 관리자 전용 저장소에만 기록 (게시글에는 노출 안 됨)
                // secretId·createdAt도 함께 저장해서 admin-write.html의 삭제관리(60일/1년)가
                // 이 컬렉션만 보고 정리할 수 있게 합니다.
                await db.collection("adminOrders").doc(boardId).set({
                    phone: data.password,
                    address: "",
                    message: data.message,
                    uid: data.createdByAdminUid || null,
                    classification: data.classification || null,
                    secretId,
                    createdAt: new Date()
                });

                await docSnap.ref.update({
                    status: "published",
                    publishedBoardId: boardId,
                    publishedAt: new Date()
                });

                console.log(`[예약발행] ${docSnap.id} -> boards/${boardId}`);
            } catch (err) {
                console.error(`[예약발행 실패] ${docSnap.id}:`, err);
            }
        }
    }
);
