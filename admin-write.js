import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 고객용 index 게시판과 완전히 동일한 Firebase 프로젝트 / "boards" 컬렉션을 사용합니다.
// (별도 게시판이 아니라, 여기서 만든 글이 index의 다른 주문건들과 같은 목록에 그대로 섞여 보입니다.)
const firebaseConfig = {
    apiKey: "AIzaSyDU8d6ShVNtgLYEQZeyms88G-TDNnRd2aA",
    authDomain: "board-291e3.firebaseapp.com",
    projectId: "board-291e3",
    storageBucket: "board-291e3.firebasestorage.app",
    messagingSenderId: "25881766316",
    appId: "1:25881766316:web:c03e118cf26d3fff11b209"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const auth = getAuth(app);
let resolveAuthReady;
const authReadyPromise = new Promise((resolve) => { resolveAuthReady = resolve; });
onAuthStateChanged(auth, (user) => {
    if (user) resolveAuthReady(user);
    else signInAnonymously(auth).catch((e) => console.error("익명 로그인 실패:", e));
});
function ensureAnonymousLogin() { return authReadyPromise; }

// ---- index.html/app.js와 완전히 동일한 방식의 조회키(secretId) 계산 ----
// boardId + 작성자명 + 비밀번호(4자리, 고객의 "전화번호 뒷4자리" 입력란과 동일한 역할)를
// SHA-256 해싱해서 문서 ID로 씁니다. 고객이 index에서 "작성자명 + 이 4자리"를 입력하면
// 똑같은 방식으로 계산되어 문서가 열립니다.
async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function normalizeName(name) {
    return String(name || "").trim();
}
function normalizePhoneLast4(phone) {
    return String(phone || "").replace(/[^0-9]/g, "").slice(-4);
}
async function computeSecretId(boardId, author, phone) {
    const key = `${boardId}::${normalizeName(author)}::${normalizePhoneLast4(phone)}`;
    return sha256Hex(key);
}

function showLoading(show) {
    document.getElementById("loading-spinner").classList.toggle("hidden", !show);
}

document.getElementById("a-submit-btn").addEventListener("click", async () => {
    const title = document.getElementById("a-title").value.trim();
    const author = document.getElementById("a-author").value.trim();
    const message = document.getElementById("a-message").value.trim();
    const password = document.getElementById("a-password").value.trim();

    if (!title) { alert("제목을 입력해주세요."); return; }
    if (!author) { alert("작성자를 입력해주세요."); return; }
    if (password.length !== 4) { alert("비밀번호(숫자 4자리)를 정확히 입력해주세요."); return; }

    showLoading(true);
    try {
        const currentUser = await ensureAnonymousLogin();

        // 1. 문서 ID를 먼저 발급받고(아직 저장은 안 함), 그 ID로 조회키(secretId)를 계산합니다.
        //    (index.html의 실제 주문 저장 로직과 완전히 동일한 방식)
        const boardRef = doc(collection(db, "boards"));
        const boardId = boardRef.id;
        const secretId = await computeSecretId(boardId, author, password);

        // 2. 공개 문서: 개인정보 없이, 다른 주문건과 동일한 필드 구조로 저장.
        //    status를 '접수에러'로 저장하면 고객이 열었을 때 결제 버튼 대신
        //    "접수에러상태 - 시안보기에서 확인" 안내가 자동으로 표시됩니다.
        await setDoc(boardRef, {
            author: author,
            productName: title,
            title: title,
            quantity: "",
            size: "",
            price: "",
            file1Url: null,
            file2Url: null,
            uid: currentUser.uid,
            createdAt: new Date(),
            isDeleted: false,
            status: "접수에러",
            fromCart: false,
            createdByAdmin: true
        });

        // 3. 개인정보(여기서는 작업메시지)는 boards/{boardId}/private/{secretId}에만 저장.
        //    이름 + 비밀번호(4자리)를 정확히 알아야만 다시 계산해서 열람할 수 있습니다.
        await setDoc(doc(db, "boards", boardId, "private", secretId), {
            phone: password,
            address: "",
            message: message,
            uid: currentUser.uid
        });

        // 4. 관리자 백오피스 조회용(adminOrders)에도 동일하게 기록 (기존 주문 저장 방식과 동일)
        await setDoc(doc(db, "adminOrders", boardId), {
            phone: password,
            address: "",
            message: message,
            uid: currentUser.uid
        });

        const resultBox = document.getElementById("a-result");
        resultBox.classList.remove("hidden");
        resultBox.innerHTML = `
            ✅ 등록되었습니다. index 게시판 목록에 바로 노출됩니다.<br>
            고객 열람 정보 — 작성자: <b>${escapeHtml(author)}</b> / 비밀번호: <b>${password}</b>
        `;

        document.getElementById("a-title").value = "";
        document.getElementById("a-author").value = "";
        document.getElementById("a-message").value = "";
        document.getElementById("a-password").value = "";
    } catch (e) {
        console.error(e);
        alert("등록 중 오류가 발생했습니다: " + e.message);
    } finally {
        showLoading(false);
    }
});

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
