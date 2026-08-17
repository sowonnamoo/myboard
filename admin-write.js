import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, doc, setDoc, getDoc, getDocs,
    query, where, orderBy, limit, updateDoc, deleteDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 고객용 index 게시판과 완전히 동일한 Firebase 프로젝트 / "boards" 컬렉션을 사용합니다.
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

const MAX_SCHEDULED = 20;
const scheduledCollection = collection(db, "scheduledBoards");

let currentAdminUser = null;
let pollTimer = null;

// ============= 화면 전환 (로그인) =============
function showLoginView() {
    document.getElementById("view-login").classList.remove("hidden");
    document.getElementById("view-write-wrap").classList.add("hidden");
    document.getElementById("login-status").classList.add("hidden");
    stopPolling();
}
function showWriteView(user) {
    document.getElementById("view-login").classList.add("hidden");
    document.getElementById("view-write-wrap").classList.remove("hidden");
    document.getElementById("login-status").classList.remove("hidden");
    document.getElementById("login-email-text").textContent = user.email || "";
    refreshScheduleList();
    startPolling();
}

function showLoginError(msg) {
    const el = document.getElementById("login-error");
    el.textContent = msg;
    el.classList.remove("hidden");
}
function clearLoginError() {
    document.getElementById("login-error").classList.add("hidden");
}

onAuthStateChanged(auth, async (user) => {
    if (user && !user.isAnonymous) {
        try {
            const adminSnap = await getDoc(doc(db, "admins", user.uid));
            if (adminSnap.exists()) {
                currentAdminUser = user;
                showWriteView(user);
            } else {
                currentAdminUser = null;
                showLoginError("관리자 권한이 없는 계정입니다. 담당자에게 문의해주세요.");
                await signOut(auth);
                showLoginView();
            }
        } catch (e) {
            console.error(e);
            currentAdminUser = null;
            showLoginError("권한 확인 중 오류가 발생했습니다.");
            await signOut(auth);
            showLoginView();
        }
    } else {
        currentAdminUser = null;
        showLoginView();
    }
});

document.getElementById("login-btn").addEventListener("click", async () => {
    clearLoginError();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) { showLoginError("이메일과 비밀번호를 입력해주세요."); return; }

    const btn = document.getElementById("login-btn");
    btn.disabled = true;
    btn.textContent = "로그인 중...";
    try {
        await signInWithEmailAndPassword(auth, email, password);
        document.getElementById("login-password").value = "";
    } catch (e) {
        console.error(e);
        if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(e.code)) {
            showLoginError("이메일 또는 비밀번호가 올바르지 않습니다.");
        } else if (e.code === "auth/too-many-requests") {
            showLoginError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.");
        } else {
            showLoginError("로그인 중 오류가 발생했습니다: " + e.message);
        }
    } finally {
        btn.disabled = false;
        btn.textContent = "로그인";
    }
});
["login-email", "login-password"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("login-btn").click();
    });
});
document.getElementById("logout-btn").addEventListener("click", async () => { await signOut(auth); });

// ============= 유틸 =============
async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function normalizeName(name) { return String(name || "").trim(); }
function normalizePhoneLast4(phone) { return String(phone || "").replace(/[^0-9]/g, "").slice(-4); }
async function computeSecretId(boardId, author, phone) {
    return sha256Hex(`${boardId}::${normalizeName(author)}::${normalizePhoneLast4(phone)}`);
}
function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function showLoading(show, text) {
    if (text) document.getElementById("loading-text").textContent = text;
    document.getElementById("loading-spinner").classList.toggle("hidden", !show);
}

// ============= 실제 게시 로직 (즉시 등록 / 예약 발행 공용) =============
async function publishBoardEntry({ title, author, message, password, classification, adminUid, adminEmail }) {
    const boardRef = doc(collection(db, "boards"));
    const boardId = boardRef.id;
    const secretId = await computeSecretId(boardId, author, password);

    await setDoc(boardRef, {
        author, productName: title, title,
        quantity: "", size: "", price: "",
        file1Url: null, file2Url: null,
        uid: adminUid,
        createdAt: new Date(),
        isDeleted: false,
        status: "접수에러",
        fromCart: false,
        createdByAdmin: true,
        createdByAdminEmail: adminEmail || ""
    });

    await setDoc(doc(db, "boards", boardId, "private", secretId), {
        phone: password, address: "", message, uid: adminUid
    });

    // m/k/s 분류는 게시글/고객 열람 경로에는 절대 넣지 않고, 관리자 전용 저장소에만 기록.
    // secretId·createdAt도 함께 저장해서, 나중에 삭제관리(60일/1년 경과)에서
    // boards 문서를 매번 다시 조회하지 않고 이 컬렉션만 보고 정리할 수 있게 합니다.
    await setDoc(doc(db, "adminOrders", boardId), {
        phone: password, address: "", message, uid: adminUid,
        classification: classification || null,
        secretId,
        createdAt: new Date()
    });

    return boardId;
}

// ============= 등록 버튼 =============
document.getElementById("a-submit-btn").addEventListener("click", async () => {
    if (!currentAdminUser) { alert("관리자 로그인이 필요합니다."); showLoginView(); return; }

    const title = document.getElementById("a-title").value.trim();
    const classification = document.getElementById("a-type").value || null;
    const delayHours = parseInt(document.getElementById("a-delay").value, 10);
    const author = document.getElementById("a-author").value.trim();
    const message = document.getElementById("a-message").value.trim();
    const password = document.getElementById("a-password").value.trim();

    if (!title) { alert("제목을 입력해주세요."); return; }
    if (!author) { alert("작성자를 입력해주세요."); return; }
    if (password.length !== 4) { alert("비밀번호(숫자 4자리)를 정확히 입력해주세요."); return; }

    showLoading(true);
    try {
        if (delayHours === 0) {
            await publishBoardEntry({
                title, author, message, password, classification,
                adminUid: currentAdminUser.uid, adminEmail: currentAdminUser.email
            });
            showResult(`✅ 즉시 등록되었습니다. 작성자: <b>${escapeHtml(author)}</b> / 비밀번호: <b>${password}</b>`);
        } else {
            const pendingCount = await countPending();
            if (pendingCount >= MAX_SCHEDULED) {
                alert(`예약은 최대 ${MAX_SCHEDULED}건까지 가능합니다. 기존 예약이 등록된 후 다시 시도해주세요.`);
                return;
            }
            const scheduledDate = new Date(Date.now() + delayHours * 60 * 60 * 1000);
            await setDoc(doc(scheduledCollection), {
                title, author, message, password, classification,
                scheduledAt: Timestamp.fromDate(scheduledDate),
                status: "pending",
                createdAt: new Date(),
                createdByAdminUid: currentAdminUser.uid,
                createdByAdminEmail: currentAdminUser.email || ""
            });
            showResult(`⏰ ${delayHours}시간 뒤(${scheduledDate.getMonth() + 1}월 ${scheduledDate.getDate()}일 ${String(scheduledDate.getHours()).padStart(2, "0")}:${String(scheduledDate.getMinutes()).padStart(2, "0")})에 자동 등록됩니다. 작성자: <b>${escapeHtml(author)}</b> / 비밀번호: <b>${password}</b>`);
            refreshScheduleList();
        }
        clearForm();
    } catch (e) {
        console.error(e);
        if (e.code === "permission-denied") {
            alert("권한이 없습니다. 이 계정은 관리자로 등록되어 있지 않을 수 있습니다.");
        } else {
            alert("처리 중 오류가 발생했습니다: " + e.message);
        }
    } finally {
        showLoading(false);
    }
});

function showResult(html) {
    const resultBox = document.getElementById("a-result");
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = html;
}
function clearForm() {
    document.getElementById("a-title").value = "";
    document.getElementById("a-type").value = "";
    document.getElementById("a-delay").value = "0";
    document.getElementById("a-author").value = "";
    document.getElementById("a-message").value = "";
    document.getElementById("a-password").value = "";
}

// ============= 예약 관련 (화면에 목록은 안 보여주고, 조용히 개수만 체크 + 자동발행) =============
async function countPending() {
    const q = query(scheduledCollection, where("status", "==", "pending"), limit(MAX_SCHEDULED + 1));
    const snap = await getDocs(q);
    return snap.size;
}

// 예약 시간이 된 글을 이 페이지가 열려 있는 동안 자동으로 게시합니다.
// (탭을 닫으면 동작하지 않으며, 완전 자동화가 필요하면 별도 안내된 Cloud Functions를 쓰시면 됩니다.)
async function publishDueScheduledItems() {
    if (!currentAdminUser) return;
    try {
        const now = Timestamp.fromDate(new Date());
        const q = query(
            scheduledCollection,
            where("status", "==", "pending"),
            where("scheduledAt", "<=", now),
            orderBy("scheduledAt", "asc"),
            limit(MAX_SCHEDULED)
        );
        const snap = await getDocs(q);
        if (snap.empty) return;

        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            try {
                const boardId = await publishBoardEntry({
                    title: data.title, author: data.author, message: data.message, password: data.password,
                    classification: data.classification,
                    adminUid: data.createdByAdminUid, adminEmail: data.createdByAdminEmail
                });
                await updateDoc(doc(db, "scheduledBoards", docSnap.id), {
                    status: "published", publishedBoardId: boardId, publishedAt: new Date()
                });
            } catch (e) {
                console.error("예약 발행 실패:", docSnap.id, e);
            }
        }
        refreshScheduleList();
    } catch (e) {
        console.error("예약 확인 중 오류:", e);
    }
}

// ============= 예약 대기 목록 표시 (최대 5개) + 취소 =============
async function refreshScheduleList() {
    const listEl = document.getElementById("schedule-list");
    const countEl = document.getElementById("schedule-count-text");
    try {
        const q = query(
            scheduledCollection,
            where("status", "==", "pending"),
            orderBy("scheduledAt", "asc"),
            limit(5)
        );
        const snap = await getDocs(q);
        const totalPending = await countPending();
        countEl.textContent = `대기 ${totalPending} / ${MAX_SCHEDULED}건${totalPending > 5 ? " (최근 5건만 표시)" : ""}`;

        if (snap.empty) {
            listEl.innerHTML = `<p class="text-xs text-gray-400 py-4 text-center">예약된 글이 없습니다.</p>`;
            return;
        }

        listEl.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const d = data.scheduledAt.toDate();
            const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            const row = document.createElement("div");
            row.className = "flex items-center justify-between p-2.5";
            row.innerHTML = `
                <div class="min-w-0">
                    <p class="font-medium text-gray-800 truncate">${escapeHtml(data.title)} <span class="text-xs text-gray-400 font-normal">· ${escapeHtml(data.author)}</span></p>
                    <p class="text-xs text-gray-400">⏰ ${dateStr} 예약 · <span class="text-amber-600">대기중</span></p>
                </div>
                <button class="cancel-schedule-btn text-xs border border-gray-300 text-gray-600 rounded px-2.5 py-1 hover:bg-gray-100 shrink-0 ml-2">예약취소</button>
            `;
            row.querySelector(".cancel-schedule-btn").addEventListener("click", async () => {
                if (!confirm(`"${data.title}" 예약을 취소하시겠습니까?`)) return;
                try {
                    await deleteDoc(doc(db, "scheduledBoards", docSnap.id));
                    refreshScheduleList();
                } catch (e) {
                    console.error(e);
                    alert("취소 중 오류가 발생했습니다: " + e.message);
                }
            });
            listEl.appendChild(row);
        });
    } catch (e) {
        console.error("예약 목록 조회 실패:", e);
        let hint = "";
        if (e.code === "permission-denied") {
            hint = "권한 오류 — firestore.rules를 게시(Publish)했는지, admins/{uid} 문서를 만들었는지 확인해주세요.";
        } else if (e.code === "failed-precondition") {
            hint = "Firestore 색인이 필요합니다. 브라우저 개발자도구(F12) → Console 탭에서 이 오류를 클릭하면 나오는 링크로 색인을 만들어주세요.";
        } else {
            hint = e.message || "";
        }
        listEl.innerHTML = `<p class="text-xs text-red-500 py-4 text-center px-2">목록을 불러오지 못했습니다.<br>${escapeHtml(hint)}</p>`;
    }
}

function startPolling() {
    stopPolling();
    publishDueScheduledItems();
    pollTimer = setInterval(publishDueScheduledItems, 20 * 1000);
}
function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ============= 삭제관리: 등록 후 일정 기간 지난 m/k/s 분류 글 정리 (분류별로 각각 실행) =============
// 문자로 발송되는 링크라, 오래된 글은 보안/용량 확보를 위해 주기적으로 정리가 필요합니다.
// adminOrders에 저장해둔 classification + createdAt만 보고 대상(분류 1개 + 60일/1년 경과)을 찾아
// boards 본문 + private 서브문서 + adminOrders 문서를 함께 삭제합니다.
async function runDeleteOldClassified(classification, days, label) {
    if (!currentAdminUser) { alert("관리자 로그인이 필요합니다."); return; }

    showLoading(true, "삭제 대상 확인 중...");
    let snap;
    try {
        const cutoff = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
        const q = query(
            collection(db, "adminOrders"),
            where("classification", "==", classification),
            where("createdAt", "<=", cutoff)
        );
        snap = await getDocs(q);
    } catch (e) {
        console.error(e);
        showLoading(false);
        alert("대상 확인 중 오류가 발생했습니다: " + e.message + "\n(Firestore 색인 생성이 필요할 수 있습니다. 콘솔의 오류 링크를 확인해주세요.)");
        return;
    }
    showLoading(false);

    if (snap.empty) { alert(`${label} 대상 글이 없습니다.`); return; }
    if (!confirm(`${label} 대상 ${snap.size}건을 삭제하시겠습니까?\n삭제하면 되돌릴 수 없습니다.`)) return;

    showLoading(true, "삭제 중...");
    let successCount = 0;
    for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const boardId = docSnap.id;
        try {
            if (data.secretId) {
                await deleteDoc(doc(db, "boards", boardId, "private", data.secretId));
            }
            await deleteDoc(doc(db, "boards", boardId));
            await deleteDoc(doc(db, "adminOrders", boardId));
            successCount++;
        } catch (e) {
            console.error("삭제 실패:", boardId, e);
        }
    }
    showLoading(false);
    alert(`${successCount}건 삭제되었습니다.` + (successCount < snap.size ? ` (${snap.size - successCount}건 실패, 콘솔 로그 확인)` : ""));
}

document.querySelectorAll(".delete-cls-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const cls = btn.dataset.cls;
        const days = parseInt(btn.dataset.days, 10);
        const periodLabel = days === 60 ? "60일 지난" : "1년 지난";
        runDeleteOldClassified(cls, days, `${periodLabel} '${cls}' 분류 글`);
    });
});




// admin-write.js 맨 아랫줄에 추가할 코드
window.addEventListener('DOMContentLoaded', () => {
    const p = new URLSearchParams(window.location.search);
    if (p.has('rand_title')) {
        setTimeout(() => {
            if(document.getElementById('a-title')) document.getElementById('a-title').value = p.get('rand_title');
            if(document.getElementById('a-type')) document.getElementById('a-type').value = p.get('rand_type');
            if(document.getElementById('a-delay')) document.getElementById('a-delay').value = p.get('rand_delay');
            if(document.getElementById('a-author')) document.getElementById('a-author').value = p.get('rand_author');
            if(document.getElementById('a-message')) document.getElementById('a-message').value = p.get('rand_msg');
            if(document.getElementById('a-password')) document.getElementById('a-password').value = p.get('rand_pass');
        }, 500); // 로그인 체크 후 폼이 나타나는 시간을 고려해 0.5초 뒤 입력
    }
});