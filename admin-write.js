import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, doc, setDoc, getDoc, getDocs,
    query, where, orderBy, limit, deleteDoc, updateDoc, Timestamp
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
let registerMode = "now"; // "now" | "schedule"
let scheduledOffsetHours = null;
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

// ============= 등록 방식 (즉시 / 예약) =============
document.getElementById("mode-now-btn").addEventListener("click", () => {
    registerMode = "now";
    document.getElementById("mode-now-btn").classList.add("active");
    document.getElementById("mode-schedule-btn").classList.remove("active");
    document.getElementById("schedule-options").classList.add("hidden");
    document.getElementById("a-submit-btn").textContent = "등록하기";
});
document.getElementById("mode-schedule-btn").addEventListener("click", () => {
    registerMode = "schedule";
    document.getElementById("mode-schedule-btn").classList.add("active");
    document.getElementById("mode-now-btn").classList.remove("active");
    document.getElementById("schedule-options").classList.remove("hidden");
    document.getElementById("a-submit-btn").textContent = "예약 등록하기";
});

document.querySelectorAll(".offset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".offset-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const hours = parseInt(btn.dataset.hours, 10);
        const target = new Date(Date.now() + hours * 60 * 60 * 1000);
        document.getElementById("a-schedule-datetime").value = toLocalDatetimeInputValue(target);
        updateSchedulePreview();
    });
});
document.getElementById("a-schedule-datetime").addEventListener("change", () => {
    document.querySelectorAll(".offset-btn").forEach(b => b.classList.remove("active"));
    updateSchedulePreview();
});
function toLocalDatetimeInputValue(d) {
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function updateSchedulePreview() {
    const val = document.getElementById("a-schedule-datetime").value;
    const preview = document.getElementById("schedule-preview");
    if (!val) { preview.textContent = ""; return; }
    const d = new Date(val);
    preview.textContent = `➡ ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}에 자동 등록됩니다.`;
}

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
    document.getElementById("loading-text").textContent = text || "처리 중...";
    document.getElementById("loading-spinner").classList.toggle("hidden", !show);
}

// ============= 파일 업로드 (기존 사이트와 동일한 R2 업로드 방식) =============
function uploadToR2(fileInputId, authorName) {
    return new Promise((resolve, reject) => {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput || fileInput.files.length === 0) { resolve(null); return; }
        const file = fileInput.files[0];

        const MAX_SIZE = 500 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert("⚠️ 파일 용량이 너무 큽니다. 500MB 이하만 업로드 가능합니다.");
            reject(new Error("파일 크기 초과"));
            return;
        }
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'ai', 'psd', 'zip', 'hwp', 'eps', 'gif', 'heic', 'webp', 'xlsx'];
        const ext = file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            alert("⚠️ 허용되지 않는 파일 형식입니다.");
            reject(new Error("허용되지 않는 확장자: " + ext));
            return;
        }

        const uniqueFileName = `${authorName}_${Date.now()}_${file.name}`;
        const WORKER_URL = "https://r2.ecogr.workers.dev/";
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `${WORKER_URL}?name=${encodeURIComponent(uniqueFileName)}`, true);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("X-File-Size", file.size);
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText).url); }
                catch (e) { reject(new Error("업로드 응답 처리 실패")); }
            } else {
                reject(new Error("업로드 실패: " + xhr.statusText));
            }
        };
        xhr.onerror = () => reject(new Error("업로드 중 네트워크 오류"));
        xhr.send(file);
    });
}

// ============= 실제 게시 로직 (즉시 등록 / 예약 발행 공용) =============
async function publishBoardEntry({ title, author, message, password, file1Url, file1Type, file2Url, file2Type, adminUid, adminEmail }) {
    const boardRef = doc(collection(db, "boards"));
    const boardId = boardRef.id;
    const secretId = await computeSecretId(boardId, author, password);

    await setDoc(boardRef, {
        author, productName: title, title,
        quantity: "", size: "", price: "",
        file1Url: file1Url || null, file2Url: file2Url || null,
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

    // m/k/s 파일 분류는 게시글/고객 열람 경로에는 절대 넣지 않고, 관리자 전용 저장소에만 기록.
    await setDoc(doc(db, "adminOrders", boardId), {
        phone: password, address: "", message, uid: adminUid,
        file1Type: file1Type || null,
        file2Type: file2Type || null
    });

    return boardId;
}

// ============= 등록 버튼 =============
document.getElementById("a-submit-btn").addEventListener("click", async () => {
    if (!currentAdminUser) { alert("관리자 로그인이 필요합니다."); showLoginView(); return; }

    const title = document.getElementById("a-title").value.trim();
    const author = document.getElementById("a-author").value.trim();
    const message = document.getElementById("a-message").value.trim();
    const password = document.getElementById("a-password").value.trim();
    const file1Type = document.getElementById("a-file1-type").value || null;
    const file2Type = document.getElementById("a-file2-type").value || null;

    if (!title) { alert("제목을 입력해주세요."); return; }
    if (!author) { alert("작성자를 입력해주세요."); return; }
    if (password.length !== 4) { alert("비밀번호(숫자 4자리)를 정확히 입력해주세요."); return; }

    let scheduledDate = null;
    if (registerMode === "schedule") {
        const val = document.getElementById("a-schedule-datetime").value;
        if (!val) { alert("예약할 날짜/시간을 선택해주세요."); return; }
        scheduledDate = new Date(val);
        if (scheduledDate.getTime() <= Date.now()) { alert("예약 시간은 현재 시간보다 이후여야 합니다."); return; }

        const pendingCount = await countPending();
        if (pendingCount >= MAX_SCHEDULED) {
            alert(`예약은 최대 ${MAX_SCHEDULED}건까지 가능합니다. 대기 목록에서 정리 후 다시 시도해주세요.`);
            return;
        }
    }

    showLoading(true, registerMode === "schedule" ? "파일 업로드 중..." : "등록 중...");
    try {
        const file1Url = await uploadToR2("a-file1", author);
        const file2Url = await uploadToR2("a-file2", author);

        if (registerMode === "now") {
            showLoading(true, "등록 중...");
            await publishBoardEntry({
                title, author, message, password,
                file1Url, file1Type, file2Url, file2Type,
                adminUid: currentAdminUser.uid, adminEmail: currentAdminUser.email
            });
            showResult(`✅ 즉시 등록되었습니다. 작성자: <b>${escapeHtml(author)}</b> / 비밀번호: <b>${password}</b>`);
        } else {
            showLoading(true, "예약 저장 중...");
            await setDoc(doc(scheduledCollection), {
                title, author, message, password,
                file1Url: file1Url || null, file1Type,
                file2Url: file2Url || null, file2Type,
                scheduledAt: Timestamp.fromDate(scheduledDate),
                status: "pending",
                createdAt: new Date(),
                createdByAdminUid: currentAdminUser.uid,
                createdByAdminEmail: currentAdminUser.email || ""
            });
            showResult(`⏰ 예약 등록되었습니다. ${scheduledDate.getFullYear()}년 ${scheduledDate.getMonth() + 1}월 ${scheduledDate.getDate()}일 ${String(scheduledDate.getHours()).padStart(2, "0")}:${String(scheduledDate.getMinutes()).padStart(2, "0")}에 자동으로 게시됩니다.`);
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
    document.getElementById("a-author").value = "";
    document.getElementById("a-message").value = "";
    document.getElementById("a-password").value = "";
    document.getElementById("a-file1").value = "";
    document.getElementById("a-file2").value = "";
    document.getElementById("a-file1-type").value = "";
    document.getElementById("a-file2-type").value = "";
    document.getElementById("a-schedule-datetime").value = "";
    document.querySelectorAll(".offset-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("schedule-preview").textContent = "";
}

// ============= 예약 대기 목록 =============
async function countPending() {
    const q = query(scheduledCollection, where("status", "==", "pending"), limit(MAX_SCHEDULED + 1));
    const snap = await getDocs(q);
    return snap.size;
}

async function refreshScheduleList() {
    const q = query(scheduledCollection, where("status", "==", "pending"), orderBy("scheduledAt", "asc"), limit(MAX_SCHEDULED));
    const snap = await getDocs(q);

    const listEl = document.getElementById("schedule-list");
    const countEl = document.getElementById("schedule-count-text");
    countEl.textContent = `${snap.size} / ${MAX_SCHEDULED}건`;

    if (snap.empty) {
        listEl.innerHTML = `<p class="text-xs text-gray-400 py-4 text-center">예약된 글이 없습니다.</p>`;
        return;
    }

    listEl.innerHTML = "";
    snap.forEach(docSnap => {
        const data = docSnap.data();
        const d = data.scheduledAt.toDate();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const row = document.createElement("div");
        row.className = "flex items-center justify-between py-2.5";
        row.innerHTML = `
            <div class="min-w-0">
                <p class="font-medium text-gray-800 truncate">${escapeHtml(data.title)}</p>
                <p class="text-xs text-gray-400">${escapeHtml(data.author)} · ⏰ ${dateStr}</p>
            </div>
            <button class="cancel-schedule-btn text-xs border border-red-200 text-red-600 rounded px-2.5 py-1 hover:bg-red-50 shrink-0 ml-2">취소</button>
        `;
        row.querySelector(".cancel-schedule-btn").addEventListener("click", async () => {
            if (!confirm("이 예약을 취소하시겠습니까?")) return;
            await deleteDoc(doc(db, "scheduledBoards", docSnap.id));
            refreshScheduleList();
        });
        listEl.appendChild(row);
    });
}

// ============= 예약 시간 도래 시 자동 발행 (페이지가 열려 있는 동안 폴링) =============
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
                    file1Url: data.file1Url, file1Type: data.file1Type,
                    file2Url: data.file2Url, file2Type: data.file2Type,
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

function startPolling() {
    stopPolling();
    publishDueScheduledItems();
    pollTimer = setInterval(publishDueScheduledItems, 20 * 1000);
}
function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
