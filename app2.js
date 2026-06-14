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
        memoDisplay.innerText = "작성된 메모가 없습니다.";
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
        
        listBody.innerHTML += `
    <tr class="hover:bg-gray-50 border-b border-gray-100"> 
        <td class="py-3 px-4 text-left font-medium text-gray-900 truncate">
            <span class="mr-2">🔒 ${data.author}님</span>
            <button onclick="viewDetail('${data.id}')" class="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full mr-2 hover:bg-blue-700">시안요청완료 / 작업진행상황 / 운송장 </button>
            <span class="text-xs text-gray-500">${displayInfo}</span>
        </td>
        <td class="py-3 text-sm text-gray-600">에코그래픽스</td>
        <td class="py-3 text-xs text-gray-400">${dateStr}</td>
    </tr>`;
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
            await checkMemoAndSetButton(id, data.status);

            // ... (이미지 및 타이틀 로드 로직)
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    };
    cancelBtn.onclick = () => modal.classList.add("hidden");
};

// 새로 추가할 함수 (이 함수가 메모를 확인한 뒤 버튼을 세팅함)
async function checkMemoAndSetButton(boardId, status) {
    const memoDisplay = document.getElementById("memo-display");
    const memoStatus = document.getElementById("memo-status");
    const approveBtn = document.getElementById("approve-btn");
    
    approveBtn.onclick = null;
    
    const q = query(collection(db, "boards", boardId, "hanjool"), orderBy("createdAt", "desc"), limit(1));
    const snapshot = await getDocs(q);

    const hasMemo = !snapshot.empty;
    if (hasMemo) {
        memoDisplay.innerText = snapshot.docs[0].data().text;
        memoStatus.classList.remove("hidden");
    } else {
        memoDisplay.innerText = "작성된 메모가 없습니다.";
        memoStatus.classList.add("hidden");
    }

    if (status === "done") {
        approveBtn.innerText = "조판완료";
        approveBtn.className = "bg-red-600 text-white px-6 py-2 rounded font-bold cursor-default";
    } else if (hasMemo) {
        approveBtn.innerText = "인쇄승인";
        approveBtn.className = "bg-gray-400 text-white px-6 py-2 rounded font-bold cursor-not-allowed";
        approveBtn.onclick = () => alert("메모가 작성된 상태에서는 인쇄승인이 불가능합니다.");
    } else {
        approveBtn.innerText = "인쇄승인";
        approveBtn.className = "bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700";
        approveBtn.onclick = async () => {
            if (confirm("정말로 인쇄승인하시겠습니까?")) {
                await updateDoc(doc(db, "boards", boardId), { status: "done" });
                approveBtn.innerText = "조판완료";
                approveBtn.className = "bg-red-600 text-white px-6 py-2 rounded font-bold cursor-default";
                approveBtn.onclick = null;
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
            await checkMemoAndSetButton(id, data.status);

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

    const q = query(collection(db, "boards", currentViewId, "hanjool"));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    await addDoc(collection(db, "boards", currentViewId, "hanjool"), { 
        text: input.value, 
        createdAt: new Date() 
    });
    input.value = "";
    loadMemo(currentViewId);
});

document.getElementById("delete-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return;
    const q = query(collection(db, "boards", currentViewId, "hanjool"));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    document.getElementById("memo-display").innerText = "작성된 메모가 없습니다.";
    document.getElementById("memo-status").classList.add("hidden");
    alert("메모가 삭제되었습니다.");
});

loadData();
