import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, addDoc, limit, deleteDoc, updateDoc, startAfter } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

let allOrders = [];
let currentPage = 1;
let currentViewId = ""; 
let lastVisible = null;
let hasMoreOrders = true; // Firestore에 더 가져올 문서가 남아있는지 여부
const POSTS_PER_PAGE = 8;
// 현재 상세보기 중인 게시글의 "시안 이미지 번호"(finalCode)를 담아둡니다.
// 재구입 버튼이 화면 텍스트를 파싱하지 않고 이 값을 바로 사용합니다.
let currentSianImgCode = "";

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
    
    // 조판 완료 상태 여부 확인
    const isDone = (sianStatus === "done");

    // [핵심] 조판 완료 시 입력창과 버튼 비활성화
    memoInput.disabled = isDone;
    saveBtn.disabled = isDone;
    deleteBtn.disabled = isDone;
    
    // 버튼 스타일 조정 (비활성화 시 흐리게)
    saveBtn.style.opacity = isDone ? "0.5" : "1";
    deleteBtn.style.opacity = isDone ? "0.5" : "1";

    approveBtn.onclick = null;
    
    const q = query(collection(db, "boards", boardId, "hanjool"), orderBy("createdAt", "desc"), limit(1));
    const snapshot = await getDocs(q);
    const hasMemo = !snapshot.empty;

    if (hasMemo) {
        memoDisplay.innerText = snapshot.docs[0].data().text;
        memoStatus.classList.remove("hidden");
    } else {
        memoDisplay.innerText = isDone ? "조판 완료로 인해 수정 요청이 불가능합니다." : "작성된 수정요청 없습니다.(인쇄승인 가능상태)";
        memoStatus.classList.add("hidden");
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

document.getElementById("save-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return alert("게시글을 먼저 선택해주세요.");
    const input = document.getElementById("memo-input");
    if (!input.value.trim()) return;

    const currentUser = await ensureAnonymousLogin();

    try {
        // 1. 기존 메모 삭제 (예전에 uid 없이 저장된 메모는 규칙상 삭제가 거부될 수 있으므로,
        //    하나가 실패해도 나머지 진행에는 영향 없게 처리)
        const q = query(collection(db, "boards", currentViewId, "hanjool"));
        const snapshot = await getDocs(q);
        await Promise.allSettled(snapshot.docs.map(doc => deleteDoc(doc.ref)));

        // 2. 새 메모 저장
        await addDoc(collection(db, "boards", currentViewId, "hanjool"), { 
            text: input.value, 
            createdAt: new Date(),
            uid: currentUser.uid
        });
        input.value = "";

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
                const url = `index3.html?productName=${encodeURIComponent(title)}&imgCode=${encodeURIComponent(imgCode)}`;
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
