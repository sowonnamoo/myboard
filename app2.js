import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, addDoc, limit, deleteDoc, updateDoc, startAfter, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// app.js와 반드시 동일한 방식으로 정규화해야 같은 secretId가 계산됩니다.
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

// index1.html(글 작성 창)에서 이미 익명 로그인이 되어 있다면 이 창(index2)도 같은 uid를 이어받습니다.
// (같은 브라우저/기기여야 본인 글로 인식됩니다.) 혹시 로그인 전이면 여기서 새로 익명 로그인합니다.
const auth = getAuth(app);
let resolveAuthReady;
const authReadyPromise = new Promise((resolve) => { resolveAuthReady = resolve; });
onAuthStateChanged(auth, (user) => {
    if (user) {
        resolveAuthReady(user);
    } else {
        signInAnonymously(auth).catch((e) => console.error("익명 로그인 실패:", e));
    }
});
function ensureAnonymousLogin() {
    return authReadyPromise;
}

// [R2 업로드 함수] app.js의 uploadToR2와 동일한 방식(용량/확장자 제한 포함),
// 다만 이 페이지는 input이 미리 고정돼있지 않고 클릭 시점에 선택된 파일 하나를 바로 받아 업로드함
function uploadFileToR2(file, authorName) {
    return new Promise((resolve, reject) => {
        const MAX_SIZE = 500 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert("⚠️ 파일 용량이 너무 큽니다. 500MB 이하의 파일만 업로드 가능합니다.");
            reject(new Error("파일 크기 초과: " + (file.size / (1024 * 1024)).toFixed(2) + "MB"));
            return;
        }

        const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'ai', 'psd', 'zip', 'hwp', 'eps', 'gif', 'HEIC', 'WEBP', 'xlsx'];
        const ext = file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            alert("⚠️ 허용되지 않는 파일 형식입니다.");
            reject(new Error("보안상 차단된 파일 형식: " + ext));
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
                try {
                    const result = JSON.parse(xhr.responseText);
                    resolve(result.url);
                } catch (e) {
                    reject(new Error("업로드 응답을 처리하지 못했습니다."));
                }
            } else {
                reject(new Error("업로드 실패: " + xhr.statusText));
            }
        };
        xhr.onerror = () => reject(new Error("업로드 중 네트워크 오류가 발생했습니다."));
        xhr.send(file);
    });
}

// 파일 다운로드 강제 실행 함수 (app.js와 동일)
window.downloadFile = async (url, filename) => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
    } catch (e) {
        alert("다운로드 중 오류가 발생했습니다.");
        console.error(e);
    }
};

// R2 워커는 업로드 후 `.../?name=파일명` 형태(쿼리스트링)의 URL을 돌려줌.
// 삭제도 같은 워커에 DELETE + ?name=파일명으로 요청함 (워커 코드로 확인 완료).
async function deleteFileFromR2(fileUrl) {
    try {
        const key = new URL(fileUrl).searchParams.get('name');
        if (!key) return;
        await fetch(`https://r2.ecogr.workers.dev/?name=${encodeURIComponent(key)}`, { method: 'DELETE' });
    } catch (e) {
        console.warn('R2 파일 삭제 시도 실패(무시):', e);
    }
}

// 까페24의 시안 이미지가 재업로드됐는지 자동 감지해서, 재업로드됐으면
// 기존 수정요청(첨부파일 포함)을 R2 + 파이어베이스 양쪽에서 자동으로 정리함.
// 까페24 서버가 Last-Modified/ETag를 CORS로 노출해주는 경우에만 동작하고,
// 그렇지 않으면(대부분의 정적 파일 서버가 이렇게 막혀있음) 조용히 아무 것도 안 하고 넘어감.
// -> 이 경우엔 지금까지처럼 quick_check.html의 "해제" 버튼으로 수동 처리하면 됨.
async function checkImageRefreshAndCleanup(boardId, imgUrl) {
    try {
        const res = await fetch(imgUrl, { method: 'HEAD', cache: 'no-store', mode: 'cors' });
        const marker = res.headers.get('last-modified') || res.headers.get('etag');
        if (!marker) return; // 헤더를 못 읽으면(CORS 미허용 등) 자동 감지 불가 - 그냥 넘어감

        const boardSnap = await getDoc(doc(db, "boards", boardId));
        if (!boardSnap.exists()) return;
        const prevMarker = boardSnap.data().sianImageMarker;

        if (!prevMarker) {
            // 처음 확인하는 경우 - 기준값만 저장 (아직 "변경"으로 판단할 근거가 없음)
            await updateDoc(doc(db, "boards", boardId), { sianImageMarker: marker }).catch(() => {});
            return;
        }
        if (prevMarker === marker) return; // 변경 없음

        // 이미지가 재업로드된 것으로 판단 - 기존 수정요청(첨부파일 포함) 자동 정리
        const hanjoolSnap = await getDocs(collection(db, "boards", boardId, "hanjool"));
        await Promise.all(hanjoolSnap.docs.map(d => {
            const data = d.data();
            return data.fileUrl ? deleteFileFromR2(data.fileUrl) : Promise.resolve();
        }));
        await Promise.all(hanjoolSnap.docs.map(d => deleteDoc(d.ref)));
        await updateDoc(doc(db, "boards", boardId), {
            sianImageMarker: marker,
            fileLocked: false,
            sianRefreshedAt: serverTimestamp()
        });

        // 방금 정리된 최신 상태를 화면에 다시 반영
        await checkMemoAndSetButton(boardId, (await getDoc(doc(db, "boards", boardId))).data().sian);
    } catch (e) {
        // CORS 등으로 헤더 자체를 못 읽는 경우 fetch가 여기로 떨어짐 - 조용히 무시
        console.warn('시안 이미지 변경 자동 감지 실패(무시, 수동 "해제"로 처리 가능):', e);
    }
}

let allOrders = [];
let currentPage = 1;
let currentViewId = ""; 
let lastVisible = null;
let hasMoreOrders = true; // Firestore에 더 가져올 문서가 남아있는지 여부
const POSTS_PER_PAGE = 8;
// 현재 상세보기 중인 게시글의 "시안 이미지 번호"(finalCode)를 담아둡니다.
// 재구입 버튼이 화면 텍스트를 파싱하지 않고 이 값을 바로 사용합니다.
let currentSianImgCode = "";
// 재구입 버튼이 index3.html에 작성자명/전화번호를 그대로 넘길 수 있도록,
// 비밀번호 확인 성공 시(viewDetail/autoViewDetail) 여기에 저장해둡니다.
let currentAuthorName = "";
let currentAuthorPhone = "";

async function loadMemo(boardId) {
    const memoDisplay = document.getElementById("memo-display");
    const memoStatus = document.getElementById("memo-status");
    if (!memoDisplay || !memoStatus) return;
    
    const q = query(collection(db, "boards", boardId, "hanjool"), orderBy("createdAt", "desc"), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        memoDisplay.innerText = snapshot.docs[0].data().text;
        memoStatus.classList.remove("hidden");
    } else {
        memoDisplay.innerText = "작성된 수정요청 없습니다.(인쇄승인 가능)";
        memoStatus.classList.add("hidden");
    }
}

// Firestore에서 lastVisible 이후로 유효한(숨김 처리 안 된) 글을 목표 개수만큼 모을 때까지
// 필요한 만큼 반복해서 가져옵니다. 숨겨진 글을 건너뛴 만큼 목록 개수가 줄어드는 문제를 방지합니다.
async function fetchValidOrders(targetCount) {
    const collected = [];
    let exhausted = false;

    while (collected.length < targetCount && !exhausted) {
        const q = lastVisible
            ? query(collection(db, "boards"), orderBy("createdAt", "desc"), startAfter(lastVisible), limit(POSTS_PER_PAGE))
            : query(collection(db, "boards"), orderBy("createdAt", "desc"), limit(POSTS_PER_PAGE));
        const snapshot = await getDocs(q);

        if (snapshot.empty) { exhausted = true; break; }

        for (const docSnap of snapshot.docs) {
            lastVisible = docSnap; // 숨김 처리된 글도 포함해서 커서를 갱신 (중복/누락 방지)
            const data = docSnap.data();
            if (data.isDeleted !== true) {
                collected.push({ id: docSnap.id, ...data });
                if (collected.length >= targetCount) break;
            }
        }

        if (snapshot.docs.length < POSTS_PER_PAGE) {
            exhausted = true; // Firestore에 더 가져올 문서가 없음
        }
    }

    hasMoreOrders = !exhausted;
    return collected;
}

async function loadOrders() {
    try {
        allOrders = [];
        lastVisible = null;
        allOrders = await fetchValidOrders(POSTS_PER_PAGE);
        renderTable(); 
    } catch (err) { console.error(err); }
}

window.loadMore = async function() {
    if (!hasMoreOrders) { alert("더 이상 게시글이 없습니다."); return; }
    try {
        const newOnes = await fetchValidOrders(POSTS_PER_PAGE);
        if (newOnes.length === 0) { alert("더 이상 게시글이 없습니다."); return; }
        allOrders = allOrders.concat(newOnes);
        renderTable();
    } catch (err) { console.error(err); }
};

function renderTable(dataToRender = allOrders) {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";
    
    const now = new Date();
    const FOUR_DAYS_IN_MS = 4 * 24 * 60 * 60 * 1000;

    dataToRender.forEach(data => {
        let dateObj;
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            dateObj = data.createdAt.toDate();
        } else {
            dateObj = new Date(data.createdAt);
        }

        if (isNaN(dateObj.getTime())) {
            dateObj = new Date();
        }

        let author = data.author || "고객님";
        if (author.length > 1) {
            author = author.substring(0, author.length - 1) + "*";
        }

        // [오류 수정 시작] 변수 선언을 forEach 루프 안으로 확실히 넣었습니다.
        const rawInfo = `${data.productName || ''}/${data.quantity || ''}/${data.size || ''}`;
        const displayInfo = rawInfo.length > 5 ? rawInfo.substring(0, 5) + "****" : rawInfo;
        
        const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

        listBody.innerHTML += `
        <tr class="hover:bg-gray-50 border-b border-gray-100"> 
            <td class="py-3 px-4 text-left font-medium text-gray-900 truncate">
                <div class="flex items-center gap-2">
                    <span class="whitespace-nowrap">🔒 ${author}님</span>
                    <button onclick="viewDetail('${data.id}')" class="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full hover:bg-blue-700 whitespace-nowrap">시안보기 / 인쇄승인</button>
                    <span class="text-xs text-gray-500 truncate">${displayInfo}</span>
                </div>
            </td>
            <td class="py-3 text-sm text-gray-600 text-center whitespace-nowrap">에코그래픽스</td>
            <td class="py-3 text-xs text-gray-400 text-center whitespace-nowrap">${dateStr}</td>
        </tr>`;
        // [오류 수정 끝]
    });

    const pager = document.getElementById("pagination");
    pager.innerHTML = "";
    if (dataToRender.length > 0 && hasMoreOrders) {
        pager.innerHTML = `
            <button onclick="loadMore()" class="w-full mt-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 py-2 rounded font-bold text-sm transition">
                더보기 (현재 ${dataToRender.length}개 표시)
            </button>
        `;
    }
}



window.goToPage = (p) => { 
    currentPage = p; 
    const keyword = document.getElementById("search-author").value.trim();
    if (keyword) {
        const filtered = allOrders.filter(o => o.author.includes(keyword));
        renderTable(filtered);
    } else {
        renderTable(); 
    }
};

// (구) 공개문서 password 필드를 직접 비교하던 viewDetail은 제거했습니다.
// 실제 조회 로직은 아래 secretId 기반의 새 viewDetail만 사용합니다.

// 새로 추가할 함수 (이 함수가 메모를 확인한 뒤 버튼을 세팅함)
async function checkMemoAndSetButton(boardId, sianStatus) {
    const memoDisplay = document.getElementById("memo-display");
    const memoStatus = document.getElementById("memo-status");
    const approveBtn = document.getElementById("approve-btn");
    const memoInput = document.getElementById("memo-input"); // 입력창
    const saveBtn = document.getElementById("save-memo-btn"); // 등록버튼
    const deleteBtn = document.getElementById("delete-memo-btn"); // 삭제버튼
    const fileBtn = document.getElementById("file-replace-btn"); // 파일교체 버튼
    const fileDownloadArea = document.getElementById("file-download-area");
    
    // 조판 완료 상태 여부 확인
    const isDone = (sianStatus === "done");

    // 관리자가 새 시안을 등록해 초기화한 시각 확인 (재업로드 안내 문구용)
    // fileLocked는 더 이상 파일교체 버튼을 막는 데 쓰지 않음 - 관리자 쪽 "미확인 첨부" 표시 용도로만 남겨둠
    let sianRefreshedAt = null;
    try {
        const boardSnap = await getDoc(doc(db, "boards", boardId));
        if (boardSnap.exists()) {
            sianRefreshedAt = boardSnap.data().sianRefreshedAt || null;
        }
    } catch (e) { /* 조회 실패해도 나머지 UI는 정상 진행 */ }

    // [핵심] 조판 완료 시 입력창과 버튼 비활성화
    memoInput.disabled = isDone;
    saveBtn.disabled = isDone;
    deleteBtn.disabled = isDone;
    if (fileBtn) fileBtn.disabled = isDone;
    
    // 버튼 스타일 조정 (비활성화 시 흐리게)
    saveBtn.style.opacity = isDone ? "0.5" : "1";
    deleteBtn.style.opacity = isDone ? "0.5" : "1";
    if (fileBtn) {
        fileBtn.style.opacity = isDone ? "0.5" : "1";
        fileBtn.title = "";
    }

    approveBtn.onclick = null;
    
    const q = query(collection(db, "boards", boardId, "hanjool"), orderBy("createdAt", "desc"), limit(1));
    const snapshot = await getDocs(q);
    const hasMemo = !snapshot.empty;

    if (hasMemo) {
        memoDisplay.className = "text-sm text-gray-700 mb-3 italic";
        const latest = snapshot.docs[0].data();
        memoDisplay.innerText = latest.text;
        const requestedAt = latest.createdAt && latest.createdAt.toDate
            ? latest.createdAt.toDate().toLocaleString('ko-KR')
            : '';
        memoStatus.innerHTML = ' - 🔊 수정요청이 등록되셨습니다. [교정 제작중/잠시 기다려주세요]' +
            (requestedAt ? `<span class="font-normal text-xs ml-1">(요청: ${requestedAt})</span>` : '');
        memoStatus.classList.remove("hidden");
        if (fileDownloadArea) {
            if (latest.fileUrl) {
                const uploadedAt = latest.createdAt && latest.createdAt.toDate
                    ? latest.createdAt.toDate().toLocaleString('ko-KR')
                    : '';
                fileDownloadArea.innerHTML =
                    `<a href="javascript:void(0)" onclick="downloadFile('${latest.fileUrl}', '${(latest.fileName || 'file').replace(/'/g, "")}')" class="text-blue-600 underline text-xs">📎 내가 올린 파일 다운로드 (${latest.fileName || '파일'})</a>` +
                    (uploadedAt ? `<span class="text-gray-400 text-xs ml-1">(등록: ${uploadedAt})</span>` : '');
            } else {
                fileDownloadArea.innerHTML = "";
            }
        }
    } else if (!isDone && sianRefreshedAt) {
        // 관리자가 새 시안을 등록하고 초기화한 직후 - 굵은 글씨로 등록 안내 + 갱신 시각
        const timeStr = sianRefreshedAt.toDate ? sianRefreshedAt.toDate().toLocaleString('ko-KR') : '';
        memoDisplay.className = "text-sm mb-3 font-bold text-blue-700";
        memoDisplay.innerHTML = `시안이 등록되셨습니다. (인쇄승인 가능상태)` +
            (timeStr ? `<span class="text-gray-400 font-normal text-xs ml-1">(등록: ${timeStr})</span>` : '');
        memoStatus.classList.add("hidden");
        if (fileDownloadArea) fileDownloadArea.innerHTML = "";
    } else {
        memoDisplay.className = "text-sm text-gray-700 mb-3 italic";
        memoDisplay.innerText = isDone ? "조판 완료로 인해 수정 요청이 불가능합니다." : "작성된 수정요청 없습니다.(인쇄승인 가능상태)";
        memoStatus.classList.add("hidden");
        if (fileDownloadArea) fileDownloadArea.innerHTML = "";
    }

    if (isDone) {
        approveBtn.innerText = "조판완료";
        approveBtn.className = "bg-red-600 text-white px-6 py-2 rounded font-bold cursor-default";
        approveBtn.onclick = null;
    } else if (hasMemo) {
        approveBtn.innerText = "인쇄승인";
        approveBtn.className = "bg-gray-400 text-white px-6 py-2 rounded font-bold cursor-not-allowed";
        approveBtn.onclick = () => alert("수정내용이 작성된 상태에서는 인쇄승인이 불가능합니다. (삭제버튼 클릭) 수정내용을 삭제해주세요.");
    } else {
        approveBtn.innerText = "인쇄승인";
        approveBtn.className = "bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700";
        approveBtn.onclick = async () => {
            // [핵심] 시안 이미지 로드 상태 체크
            const loadingMsg = document.getElementById('loading-msg');
            // loadingMsg가 화면에 보이고 있다면(display가 none이 아니면) 이미지가 아직 안 올라온 것
            if (loadingMsg && loadingMsg.style.display !== 'none') {
                return alert("아직 시안 이미지가 등록되지 않았습니다. 시안이 등록된 후 승인해주세요.");
            }

            // 승인 진행
            if (confirm("정말로 인쇄승인하시겠습니까?")) {
                await ensureAnonymousLogin();
                try {
                    await updateDoc(doc(db, "boards", boardId), { sian: "done" });
                    // 상태 변경 후 즉시 상태 갱신
                    await checkMemoAndSetButton(boardId, "done");
                    alert("조판완료 처리되었습니다.");
                } catch (e) {
                    if (e.code === "permission-denied") {
                        alert("본인이 작성한 글만 인쇄승인할 수 있습니다.");
                    } else {
                        alert("인쇄승인 실패: " + e.message);
                    }
                }
            }
        };
    }
}
// 비밀번호 확인 후 실행되는 부분
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    if (!snap.exists()) return alert("게시글이 존재하지 않습니다.");
    
    const data = snap.data(); // 공개 문서: 상품명/수량/가격 등 비민감 정보만 있음 (phone/password 없음)
    const modal = document.getElementById("password-modal");
    const nameInput = document.getElementById("modal-name-input");
    const input = document.getElementById("modal-password-input");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    modal.classList.remove("hidden");
    if (nameInput) nameInput.value = "";
    input.value = "";
    (nameInput || input).focus();

    confirmBtn.onclick = async () => {
        // 봇 방지: 비밀번호 10회 이상 틀리면 3시간 동안 조회 차단 (app.js의 방식과 동일)
        const blockUntil = localStorage.getItem("sianBlockUntil");
        const nowTime = new Date().getTime();
        if (blockUntil && nowTime < parseInt(blockUntil)) {
            const remainingSec = Math.ceil((parseInt(blockUntil) - nowTime) / 1000);
            const min = Math.floor(remainingSec / 60);
            const sec = remainingSec % 60;
            alert(`비밀번호를 너무 많이 틀려 ${min}분 ${sec}초 동안 접속이 제한됩니다.`);
            return;
        }

        const inputName = nameInput ? nameInput.value.trim() : "";
        const inputVal = input.value;

        const secretId = await computeSecretId(id, inputName, inputVal);
        const privateSnap = inputName !== ""
            ? await getDoc(doc(db, "boards", id, "private", secretId))
            : null;

        if (privateSnap && privateSnap.exists()) {
    const privateData = privateSnap.data(); // phone 등 - 여기서만 얻음
    // 성공 시 실패 횟수 초기화
    localStorage.setItem("sianFailCount", "0");

    modal.classList.add("hidden");
    currentViewId = id;
    currentAuthorName = data.author || "";
    currentAuthorPhone = privateData.phone || "";

    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-detail").classList.remove("hidden");
            
            // 1. 메모 및 버튼 제어 먼저 수행
await checkMemoAndSetButton(id, data.sian);
            
            // 2. 제목 및 이미지 로드 수행 (여기에 있어야 꼬이지 않음)
          const dTitle = document.getElementById("detail-title");
const dImage = document.getElementById("detail-image");




            
            if (dTitle) {
    const priceVal = data.price ? `${data.price.toLocaleString()}원` : "가격 미정";
    dTitle.innerText = `${data.author}님 (${data.productName}/${data.quantity}/${data.size}) ${priceVal}`;
}
            if (dImage) {
                const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
                const yy = String(createdAt.getFullYear()).slice(-2);
                const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
                const dd = String(createdAt.getDate()).padStart(2, '0');
                const hh = String(createdAt.getHours()).padStart(2, '0');
                const mi = String(createdAt.getMinutes()).padStart(2, '0');
                const timeCode = `${yy}${mm}${dd}${hh}${mi}`;
                const rawPhone = privateData.phone || "00000000000";
                const phonePrefix = rawPhone.slice(0, -4); // 뒷4자리(=비밀번호)가 이미지번호로 노출되지 않도록 뒷4자리를 제외
                const finalCode = phonePrefix + timeCode;
                currentSianImgCode = finalCode; // 재구입 버튼이 사용할 이미지번호 저장
                const imgUrl = `https://sowonnamoo1005.cafe24.com/1/${finalCode}.jpg`;
                const timestamp = new Date().getTime();

                // 까페24 이미지가 재업로드됐는지 자동 확인 (비동기, 화면 렌더링을 막지 않음)
                checkImageRefreshAndCleanup(id, imgUrl);

               dImage.innerHTML = `
    <div id="image-container" style="position: relative; width: 744px; min-height: 500px; margin: 0; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center;">
        <img id="loading-msg" src="https://sowonnamoo1005.cafe24.com/web/1new/preview_v1.jpg" alt="제작중" style="max-width: 100%; max-height: 100%; display: none; position: absolute;">
        <a href="water.html?url=${encodeURIComponent(imgUrl + '?t=' + timestamp)}" target="_blank" style="display: grid; width: 100%; height: 100%; text-decoration: none; position: relative;">
            <img src="${imgUrl}?t=${timestamp}" alt="시안 이미지" 
                 onerror="this.style.display='none'; document.getElementById('loading-msg').style.display='block';"
                 onload="document.getElementById('loading-msg').style.display='none';"
                 style="grid-area: 1 / 1; width: 100%; height: 100%; object-fit: contain; cursor: pointer; display: block; z-index: 1;">
        </a>
    </div>
    <div style="text-align: left; margin-top: 5px; font-size: 9pt; font-weight: bold; color: black; padding-left: 5px; display: flex; align-items: center; gap: 10px;">
        시안 이미지 번호 : ${finalCode}
        <button onclick="copyToClipboard('${finalCode}')" style="cursor:pointer; font-size: 8pt; padding: 2px 6px; background: #eee; border: 1px solid #ccc; border-radius: 3px;">복사</button>
    </div>`;
            }
        } else {
            let failCount = parseInt(localStorage.getItem("sianFailCount") || "0") + 1;
            if (failCount >= 10) {
                localStorage.setItem("sianBlockUntil", (nowTime + (3 * 60 * 60 * 1000)).toString());
                localStorage.setItem("sianFailCount", "0");
                alert("비밀번호를 10회 틀려 3시간 동안 접속이 제한됩니다.");
            } else {
                localStorage.setItem("sianFailCount", failCount.toString());
                alert(`작성자명 또는 전화번호가 일치하지 않습니다. (${failCount}/10회)`);
            }
        }
    };
    cancelBtn.onclick = () => {
        modal.classList.add("hidden");
        if (nameInput) nameInput.value = "";
    };
};

// hanjool(수정요청)은 규칙상 update가 없어서 항상 "전부 삭제 후 하나만 새로 생성"하는 방식.
// 그래서 텍스트만 새로 남기거나 파일만 새로 올릴 때 상대방 값(파일링크 또는 텍스트)이
// 같이 날아가지 않도록, 새로 쓰기 전에 기존 값을 먼저 읽어서 없는 필드는 이어받는다.
async function getLatestHanjool(boardId) {
    const q = query(collection(db, "boards", boardId, "hanjool"), orderBy("createdAt", "desc"), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].data();
}
async function deleteAllHanjool(boardId) {
    const q = query(collection(db, "boards", boardId, "hanjool"));
    const snap = await getDocs(q);
    await Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref)));
}

document.getElementById("save-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return alert("게시글을 먼저 선택해주세요.");
    const input = document.getElementById("memo-input");
    if (!input.value.trim()) return;

    const currentUser = await ensureAnonymousLogin();

    try {
        // 1. 기존 메모(+ 첨부파일 정보) 확인 후 전부 삭제
        //    (예전에 uid 없이 저장된 메모는 규칙상 삭제가 거부될 수 있으므로,
        //     하나가 실패해도 나머지 진행에는 영향 없게 처리)
        const existing = await getLatestHanjool(currentViewId);
        await deleteAllHanjool(currentViewId);

        // 2. 새 메모 저장 - 기존에 첨부파일이 있었다면 그 링크는 그대로 이어받음
        const newEntry = { text: input.value, createdAt: new Date(), uid: currentUser.uid };
        if (existing && existing.fileUrl) {
            newEntry.fileUrl = existing.fileUrl;
            newEntry.fileName = existing.fileName;
        }
        await addDoc(collection(db, "boards", currentViewId, "hanjool"), newEntry);
        input.value = "";
        // 이전 "재업로드 되었습니다" 알림이 있었다면, 새 수정요청을 남겼으니 지워서 다음에 남지 않게 함
        await updateDoc(doc(db, "boards", currentViewId), { sianRefreshedAt: null }).catch(() => {});

        // 3. (핵심) 최신 상태를 DB에서 다시 읽어온 후 버튼과 레이어 동기화
        const snap = await getDoc(doc(db, "boards", currentViewId));
        await checkMemoAndSetButton(currentViewId, snap.data().sian);

        alert("수정내용이 작성되었습니다.");
    } catch (e) {
        if (e.code === "permission-denied") {
            alert("본인이 작성한 글에만 수정요청을 남길 수 있습니다.");
        } else {
            alert("수정요청 등록 실패: " + e.message);
        }
    }
});

document.getElementById("delete-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return;
    await ensureAnonymousLogin();
    try {
        const q = query(collection(db, "boards", currentViewId, "hanjool"));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        // 이전 "재업로드 되었습니다" 알림이 있었다면 같이 지움
        await updateDoc(doc(db, "boards", currentViewId), { sianRefreshedAt: null }).catch(() => {});

        // 최신 sian 데이터를 다시 읽어서 버튼 갱신
        const snap = await getDoc(doc(db, "boards", currentViewId));
        await checkMemoAndSetButton(currentViewId, snap.data().sian);
        alert("수정내용이 삭제/취소 되었습니다.");
    } catch (e) {
        if (e.code === "permission-denied") {
            alert("본인이 작성한 글의 수정요청만 삭제할 수 있습니다.");
        } else {
            alert("삭제 실패: " + e.message);
        }
    }
});

const FILE_REPLACE_WARNING =
    "반복된 파일교체는 작업지연을 유발합니다. 기다리시는 손님께 폐가 되는 일 방지 차원상 " +
    "수정량이 많은 경우 후순위로 접수되니 차례, 양해 부탁드립니다. " +
    "파일수정시 통상 1일 1회 혹은 다음날 시안 등록됩니다. " +
    "파일을 올리시는 경우 신중히 최종확정된 파일로 접수 바랍니다.";

document.getElementById("file-replace-btn").addEventListener("click", () => {
    if (!currentViewId) return alert("게시글을 먼저 선택해주세요.");
    alert(FILE_REPLACE_WARNING);
    document.getElementById("revision-file-input").click();
});

document.getElementById("revision-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // 같은 파일을 다시 선택해도 change 이벤트가 또 발생하도록 초기화
    if (!file || !currentViewId) return;

    const currentUser = await ensureAnonymousLogin();
    const fileBtn = document.getElementById("file-replace-btn");

    try {
        // 업로드 직전에 최신 조판 상태만 다시 확인 (다른 창에서 이미 조판완료 처리됐을 수 있으므로)
        const boardSnap = await getDoc(doc(db, "boards", currentViewId));
        const boardData = boardSnap.data() || {};
        if (boardData.sian === "done") {
            return alert("조판 완료로 인해 파일 첨부가 불가능합니다.");
        }

        fileBtn.disabled = true;
        fileBtn.innerText = "업로드중...";

        const fileUrl = await uploadFileToR2(file, boardData.author || "고객");

        // 기존 수정요청(텍스트) 확인 후 전부 삭제 - 있던 텍스트는 그대로 이어받고 파일만 새로 붙임
        const existing = await getLatestHanjool(currentViewId);
        await deleteAllHanjool(currentViewId);

        await addDoc(collection(db, "boards", currentViewId, "hanjool"), {
            text: (existing && existing.text) ? existing.text : "📎 파일이 첨부되었습니다. (수정중입니다)",
            fileUrl: fileUrl,
            fileName: file.name,
            createdAt: new Date(),
            uid: currentUser.uid
        });

        // 새 시안이 등록되어 관리자가 잠금을 풀어주기 전까지 재업로드 잠금
        // + 이전 "재업로드 되었습니다" 알림이 있었다면 같이 지움
        await updateDoc(doc(db, "boards", currentViewId), { fileLocked: true, sianRefreshedAt: null });

        const freshSnap = await getDoc(doc(db, "boards", currentViewId));
        await checkMemoAndSetButton(currentViewId, freshSnap.data().sian);

        alert("수정내용이 접수되셨습니다.");
    } catch (err) {
        if (err.code === "permission-denied") {
            alert("본인이 작성한 글에만 파일을 첨부할 수 있습니다.");
        } else {
            alert("파일 첨부 실패: " + err.message);
        }
    } finally {
        fileBtn.disabled = false;
        fileBtn.innerText = "📎 파일교체";
        // 최신 상태(조판완료 여부 등)를 다시 반영
        const snap = await getDoc(doc(db, "boards", currentViewId)).catch(() => null);
        if (snap && snap.exists()) {
            await checkMemoAndSetButton(currentViewId, snap.data().sian);
        }
    }
});

loadOrders();



// app2.js 맨 마지막에 추가
function updateOverlayState(sianStatus) {
    const overlay = document.getElementById("done-overlay");
    if (!overlay) {
        console.error("#done-overlay 요소를 찾을 수 없습니다.");
        return;
    }
    
    // 상태가 'done'이면 레이어를 표시하여 메모장을 가립니다.
    if (sianStatus === "done") {
        overlay.classList.remove("hidden"); // 레이어 보임 (메모장 가림)
    } else {
        overlay.classList.add("hidden");    // 레이어 숨김 (메모장 보임)
    }
}

// === 기존 함수를 수정하지 않고, 상태 변경 시 레이어를 동기화하기 위한 래퍼 구성 ===
// 원래의 checkMemoAndSetButton 함수를 다른 이름으로 저장합니다.
const originalCheckMemo = checkMemoAndSetButton;

/**
 * checkMemoAndSetButton 함수를 재정의합니다.
 * 원래의 메모 및 버튼 제어 로직을 실행한 후, 즉시 레이어 상태를 업데이트합니다.
 */
checkMemoAndSetButton = async function(boardId, sianStatus) {
    // 1. 원래의 메모 확인 및 버튼 세팅 로직을 비동기로 실행
    await originalCheckMemo(boardId, sianStatus);
    
    // 2. (핵심) 조판 완료로 변경된 상태를 즉시 UI(레이어)에 반영
    updateOverlayState(sianStatus);
};






// 재구입 코드 (기존 로직 유지 + 숫자만 추출하는 기능 적용)
setInterval(() => {
    const approveBtn = document.getElementById('approve-btn');
    const container = approveBtn ? approveBtn.parentNode : null;
    
    // 조판완료 상태일 때 (기존 로직)
    if (approveBtn && approveBtn.innerText === "조판완료") {
        if (!document.getElementById('reorder-btn')) {
            const reorderBtn = document.createElement('button');
            reorderBtn.id = 'reorder-btn';
            reorderBtn.className = 'bg-green-500 text-white px-6 py-2 rounded font-bold hover:bg-green-600';
            reorderBtn.innerText = '재구입';
            
            reorderBtn.onclick = () => {
                const title = document.getElementById('detail-title').innerText;

                // 시안 상세를 그릴 때 저장해 둔 이미지번호를 그대로 사용합니다.
                // (화면 문구가 "시안 이미지 번호 : ..."로 바뀌면서 예전 텍스트 매칭이
                //  더 이상 맞지 않아 항상 빈 값이 되던 문제를 근본적으로 고쳤습니다)
                let imgCode = currentSianImgCode;

                // 혹시를 대비한 예비 방법: 위 값이 비어있으면 화면 텍스트에서 한 번 더 찾아봅니다.
                if (!imgCode) {
                    const divs = document.querySelectorAll('div');
                    for (let div of divs) {
                        if (div.innerText.includes('시안 이미지 번호')) {
                            const rawText = div.innerText.split(':')[1]?.trim() || "";
                            imgCode = rawText.replace(/[^0-9]/g, '');
                            break;
                        }
                    }
                }

                // [수정된 부분] window.location.href 대신 window.open으로 새 창(팝업) 오픈
                // 작성자명/전화번호도 함께 넘겨서 index3.html에 자동으로 채워지게 함
                // (가격은 매번 달라지므로 의도적으로 넘기지 않음 - 직접 입력)
                const url = `index3.html?productName=${encodeURIComponent(title)}&imgCode=${encodeURIComponent(imgCode)}&author=${encodeURIComponent(currentAuthorName)}&phone=${encodeURIComponent(currentAuthorPhone)}`;
                window.open(url, '_blank', 'width=500,height=800,scrollbars=yes');
            };
            
            // 기존 approveBtn 앞에 삽입
            if (container) {
                container.insertBefore(reorderBtn, approveBtn);
            }
        }
    } else {
        // 조판완료가 아니면 버튼 제거
        const existingBtn = document.getElementById('reorder-btn');
        if (existingBtn) existingBtn.remove();
    }
}, 500);


window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        alert("이미지 번호가 복사되었습니다: " + text);
    }).catch(err => {
        alert("복사에 실패했습니다.");
    });
};

// --- [추가] URL 파라미터(autoId) 감지하여 자동 상세 보기 ---
// ⚠️ 예전 버전은 autoId만 있으면 비밀번호 확인 없이 바로 열렸습니다(취약점).
// 이제는 key(secretId)가 함께 있고 실제로 유효할 때만 자동으로 열리고,
// key가 없거나 틀리면 일반 viewDetail(비밀번호 입력창)로 넘어갑니다.
window.addEventListener('load', async () => {
    const params = new URLSearchParams(window.location.search);
    const autoId = params.get('autoId');
    const autoKey = params.get('key');
    
    if (autoId) {
        const checkInterval = setInterval(async () => {
            if (allOrders.length > 0) {
                clearInterval(checkInterval);
                if (autoKey) {
                    await autoViewDetail(autoId, autoKey);
                } else {
                    await viewDetail(autoId); // key 없으면 비밀번호 입력창으로
                }
            }
        }, 300);
    }
});

async function autoViewDetail(id, secretId) {
    const snap = await getDoc(doc(db, "boards", id));
    if (!snap.exists()) return alert("게시글이 존재하지 않습니다.");

    // key가 실제로 유효한 secretId인지(=본인이 맞는지) private 문서 존재 여부로 확인
    const privateSnap = await getDoc(doc(db, "boards", id, "private", secretId));
    if (!privateSnap.exists()) {
        return viewDetail(id); // 위조/오래된 key면 비밀번호 입력창으로 폴백
    }
    const privateData = privateSnap.data();
    
    const data = snap.data();
    currentViewId = id;
    currentAuthorName = data.author || "";
    currentAuthorPhone = privateData.phone || "";

    // 화면 전환
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-detail").classList.remove("hidden");

    // 메모 및 버튼 상태 설정
    await checkMemoAndSetButton(id, data.sian);

    // 제목 표시
    const dTitle = document.getElementById("detail-title");
    if (dTitle) {
        const priceVal = data.price ? `${data.price.toLocaleString()}원` : "가격 미정";
        dTitle.innerText = `${data.author}님 (${data.productName}/${data.quantity}/${data.size}) ${priceVal}`;
    }

    // 이미지 로드 로직
    const dImage = document.getElementById("detail-image");
    if (dImage) {
        const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
        const yy = String(createdAt.getFullYear()).slice(-2);
        const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
        const dd = String(createdAt.getDate()).padStart(2, '0');
        const hh = String(createdAt.getHours()).padStart(2, '0');
        const mi = String(createdAt.getMinutes()).padStart(2, '0');
        const timeCode = `${yy}${mm}${dd}${hh}${mi}`;
        const rawPhone = privateData.phone || "00000000000";
        const phonePrefix = rawPhone.slice(0, -4); // 뒷4자리(=비밀번호)가 이미지번호로 노출되지 않도록 뒷4자리를 제외
        const finalCode = phonePrefix + timeCode;
        currentSianImgCode = finalCode; // 재구입 버튼이 사용할 이미지번호 저장
        const imgUrl = `https://sowonnamoo1005.cafe24.com/1/${finalCode}.jpg`;
        const timestamp = new Date().getTime();

        // 까페24 이미지가 재업로드됐는지 자동 확인 (비동기, 화면 렌더링을 막지 않음)
        checkImageRefreshAndCleanup(id, imgUrl);

        dImage.innerHTML = `
            <div id="image-container" style="position: relative; width: 744px; min-height: 500px; margin: 0; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center;">
                <img id="loading-msg" src="https://sowonnamoo1005.cafe24.com/web/1new/preview_v1.jpg" alt="제작중" style="max-width: 100%; max-height: 100%; display: none; position: absolute;">
                <a href="water.html?url=${encodeURIComponent(imgUrl + '?t=' + timestamp)}" target="_blank" style="display: grid; width: 100%; height: 100%; text-decoration: none; position: relative;">
                    <img src="${imgUrl}?t=${timestamp}" alt="시안 이미지" 
                         onerror="this.style.display='none'; document.getElementById('loading-msg').style.display='block';"
                         onload="document.getElementById('loading-msg').style.display='none';"
                         style="grid-area: 1 / 1; width: 100%; height: 100%; object-fit: contain; cursor: pointer; display: block; z-index: 1;">
                </a>
            </div>
            <div style="text-align: left; margin-top: 5px; font-size: 9pt; font-weight: bold; color: black; padding-left: 5px; display: flex; align-items: center; gap: 10px;">
                시안 이미지 번호 : ${finalCode}
                <button onclick="copyToClipboard('${finalCode}')" style="cursor:pointer; font-size: 8pt; padding: 2px 6px; background: #eee; border: 1px solid #ccc; border-radius: 3px;">복사</button>
            </div>`;
    }
}
