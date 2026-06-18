import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, addDoc, limit, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDU8d6Sh-TDNnRd2aA",
    authDomain: "board-291e3.firebaseapp.com",
    projectId: "board-291e3",
    storageBucket: "board-291e3.firebasestorage.app",
    messagingSenderId: "25881766316",
    appId: "1:25881766316:web:c03e118cf26d3fff11b209"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allOrders = [];
let currentPage = 1;
let currentViewId = ""; 
const POSTS_PER_PAGE = 8;

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
        memoDisplay.innerText = "작성된 수정요청 없습니다.";
        memoStatus.classList.add("hidden");
    }
}

async function loadData() {
    const q = query(collection(db, "boards"), orderBy("createdAt", "desc"), limit(20));
    const snapshot = await getDocs(q);
    allOrders = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.isDeleted) allOrders.push({ id: doc.id, ...data });
    });
    renderTable(allOrders);
}

function renderTable(dataToRender = allOrders) {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";
    const totalPages = Math.ceil(dataToRender.length / POSTS_PER_PAGE);
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;

   dataToRender.slice(startIndex, startIndex + POSTS_PER_PAGE).forEach(data => {
    const rawInfo = `${data.productName}/${data.quantity}/${data.size}`;
    const displayInfo = rawInfo.length > 5 ? rawInfo.substring(0, 5) + "****" : rawInfo;
    const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : "";
    
    // 가격 데이터 포맷팅
    const priceDisplay = (data.price !== undefined && data.price !== null) 
                         ? `${data.price.toLocaleString()}원` 
                         : "-";

    listBody.innerHTML += `
    <tr class="hover:bg-gray-50 border-b border-gray-100"> 
        <td class="py-3 px-4 text-left font-medium text-gray-900 truncate">
            <span class="mr-2">🔒 ${data.author}님</span>
            <button onclick="viewDetail('${data.id}')" class="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full mr-2 hover:bg-blue-700">시안요청완료 / 작업진행상황 / 운송장 </button>
            <span class="text-xs text-gray-500">${displayInfo}</span>
        </td>
        <td class="py-3 text-sm text-gray-600">에코</td>
        <td class="py-3 text-xs text-gray-400">${dateStr}</td>
        <td class="py-3 text-sm text-gray-600">${priceDisplay}</td> </tr>`;
    });

    const pager = document.getElementById("pagination");
    pager.innerHTML = "";
    if (totalPages <= 1) return;

    const range = 5;
    const startPage = Math.floor((currentPage - 1) / range) * range + 1;
    const endPage = Math.min(startPage + range - 1, totalPages);

    if (currentPage > 1) pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white hover:bg-gray-100" onclick="goToPage(${currentPage - 1})">이전</span>`;
    for (let i = startPage; i <= endPage; i++) {
        const active = i === currentPage ? "bg-blue-600 text-white" : "bg-white";
        pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded mx-0.5 ${active}" onclick="goToPage(${i})">${i}</span>`;
    }
    if (currentPage < totalPages) pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white hover:bg-gray-100" onclick="goToPage(${currentPage + 1})">다음</span>`;
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

window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    if (!snap.exists()) return alert("게시글이 존재하지 않습니다.");
    
    const data = snap.data();
    const storedPass = String(data.password || "");
    const modal = document.getElementById("password-modal");
    const input = document.getElementById("modal-password-input");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    modal.classList.remove("hidden");
    input.value = "";
    input.focus();

    confirmBtn.onclick = async () => {
        const inputVal = input.value;
        const isNumeric = /^\d+$/.test(storedPass);
        const passToCompare = isNumeric ? storedPass.slice(-4) : storedPass;

        if (inputVal === passToCompare) {
            modal.classList.add("hidden");
            currentViewId = id;

            // 1. 화면 전환
            document.getElementById("view-list").classList.add("hidden");
            document.getElementById("view-detail").classList.remove("hidden");

            // 2. 메모 체크를 위한 별도 함수 호출 (버튼 제어까지 여기서 처리)
await checkMemoAndSetButton(id, data.sian);
            
            // ... (이미지 및 타이틀 로드 로직)
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    };
    cancelBtn.onclick = () => modal.classList.add("hidden");
};

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
        memoDisplay.innerText = isDone ? "조판 완료로 인해 수정 요청이 불가능합니다." : "작성된 수정요청 없습니다.";
        memoStatus.classList.add("hidden");
    }

    if (isDone) {
        approveBtn.innerText = "조판완료";
        approveBtn.className = "bg-red-600 text-white px-6 py-2 rounded font-bold cursor-default";
        approveBtn.onclick = null;
    } else if (hasMemo) {
        approveBtn.innerText = "인쇄승인";
        approveBtn.className = "bg-gray-400 text-white px-6 py-2 rounded font-bold cursor-not-allowed";
        approveBtn.onclick = () => alert("수정내용이 작성된 상태에서는 인쇄승인이 불가능합니다. 삭제버튼 클릭후 글을 삭제해주세요.");
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
                await updateDoc(doc(db, "boards", boardId), { sian: "done" });
                // 상태 변경 후 즉시 상태 갱신
                await checkMemoAndSetButton(boardId, "done");
                alert("조판완료 처리되었습니다.");
            }
        };
    }
}
// 비밀번호 확인 후 실행되는 부분 (여기가 수정되어야 함)
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    if (!snap.exists()) return alert("게시글이 존재하지 않습니다.");
    
    const data = snap.data();
    const storedPass = String(data.password || "");
    const modal = document.getElementById("password-modal");
    const input = document.getElementById("modal-password-input");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    modal.classList.remove("hidden");
    input.value = "";
    input.focus();

    confirmBtn.onclick = async () => {
        const inputVal = input.value;
        const isNumeric = /^\d+$/.test(storedPass);
        const passToCompare = isNumeric ? storedPass.slice(-4) : storedPass;

        if (inputVal === passToCompare) {
    modal.classList.add("hidden");
    currentViewId = id;

    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-detail").classList.remove("hidden");
            
            // 1. 메모 및 버튼 제어 먼저 수행
await checkMemoAndSetButton(id, data.sian);
            
            // 2. 제목 및 이미지 로드 수행 (여기에 있어야 꼬이지 않음)
            const dTitle = document.getElementById("detail-title");
            const dImage = document.getElementById("detail-image");

            if (dTitle) dTitle.innerText = `${data.author}님 (${data.productName}/${data.quantity}/${data.size})`;
            if (dImage) {
                const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
                const yy = String(createdAt.getFullYear()).slice(-2);
                const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
                const dd = String(createdAt.getDate()).padStart(2, '0');
                const hh = String(createdAt.getHours()).padStart(2, '0');
                const mi = String(createdAt.getMinutes()).padStart(2, '0');
                const timeCode = `${yy}${mm}${dd}${hh}${mi}`;
                const rawPhone = data.phone || "00000000000";
                const phonePrefix = rawPhone.slice(0, -2);
                const finalCode = phonePrefix + timeCode;
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
        재구입 이미지번호 : ${finalCode}
        <button onclick="copyToClipboard('${finalCode}')" style="cursor:pointer; font-size: 8pt; padding: 2px 6px; background: #eee; border: 1px solid #ccc; border-radius: 3px;">복사</button>
    </div>`;
            }
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    };
    cancelBtn.onclick = () => modal.classList.add("hidden");
};

document.getElementById("save-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return alert("게시글을 먼저 선택해주세요.");
    const input = document.getElementById("memo-input");
    if (!input.value.trim()) return;

    // 1. 기존 메모 삭제
    const q = query(collection(db, "boards", currentViewId, "hanjool"));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    // 2. 새 메모 저장
    await addDoc(collection(db, "boards", currentViewId, "hanjool"), { 
        text: input.value, 
        createdAt: new Date() 
    });
    input.value = "";
    
    // 3. (핵심) 최신 상태를 DB에서 다시 읽어온 후 버튼과 레이어 동기화
    const snap = await getDoc(doc(db, "boards", currentViewId));
    await checkMemoAndSetButton(currentViewId, snap.data().sian);
    
    alert("메모가 저장되었습니다.");
});

document.getElementById("delete-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return;
    const q = query(collection(db, "boards", currentViewId, "hanjool"));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // 수정된 부분: 최신 sian 데이터를 다시 읽어서 버튼 갱신
    const snap = await getDoc(doc(db, "boards", currentViewId));
    await checkMemoAndSetButton(currentViewId, snap.data().sian);
    alert("메모가 삭제되었습니다.");
}); // <-- 이벤트 리스너를 닫는 괄호는 딱 여기까지만 있어야 합니다.

loadData();




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
    
    // 조판완료 상태일 때
    if (approveBtn && approveBtn.innerText === "조판완료") {
        if (!document.getElementById('reorder-btn')) {
            const reorderBtn = document.createElement('button');
            reorderBtn.id = 'reorder-btn';
            reorderBtn.className = 'bg-green-500 text-white px-6 py-2 rounded font-bold hover:bg-green-600';
            reorderBtn.innerText = '재구입';
            
            reorderBtn.onclick = () => {
                const title = document.getElementById('detail-title').innerText;
                
                // [수정된 핵심 부분]
                let imgCode = "";
                const divs = document.querySelectorAll('div');
                for (let div of divs) {
                    if (div.innerText.includes('재구입 이미지번호')) {
                        const rawText = div.innerText.split(':')[1]?.trim() || "";
                        // 숫자 이외의 모든 문자(한글, 공백, 특수문자 등)를 제거합니다.
                        imgCode = rawText.replace(/[^0-9]/g, ''); 
                        break;
                    }
                }
                
                // 제목과 숫자만 남은 이미지 번호를 전달
                window.location.href = `index3.html?productName=${encodeURIComponent(title)}&imgCode=${encodeURIComponent(imgCode)}`;
            };
            container.insertBefore(reorderBtn, approveBtn);
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


