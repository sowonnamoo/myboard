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

// 데이터 로드
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

// 테이블 렌더링
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
        renderTable(allOrders.filter(o => o.author.includes(keyword)));
    } else {
        renderTable(); 
    }
};

// 메모 및 버튼 제어 함수
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
                checkMemoAndSetButton(boardId, "done");
                alert("조판완료 처리되었습니다.");
            }
        };
    }
}

// 상세 보기 및 이미지 렌더링
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    if (!snap.exists()) return alert("게시글이 존재하지 않습니다.");
    
    const data = snap.data();
    const storedPass = String(data.password || "");
    const modal = document.getElementById("password-modal");
    const input = document.getElementById("modal-password-input");
    
    modal.classList.remove("hidden");
    input.value = "";
    input.focus();

    document.getElementById("modal-confirm-btn").onclick = async () => {
        const isNumeric = /^\d+$/.test(storedPass);
        if (input.value === (isNumeric ? storedPass.slice(-4) : storedPass)) {
            modal.classList.add("hidden");
            currentViewId = id;
            document.getElementById("view-list").classList.add("hidden");
            document.getElementById("view-detail").classList.remove("hidden");

            await checkMemoAndSetButton(id, data.status);
            
            // 기존 댓글 로드 (가정)
            if (typeof loadComments === 'function') loadComments(id);

            const dTitle = document.getElementById("detail-title");
            const dImage = document.getElementById("detail-image");

            if (dTitle) dTitle.innerText = `${data.author}님 (${data.productName}/${data.quantity}/${data.size})`;
            
            if (dImage) {
                const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
                const timeCode = `${String(createdAt.getFullYear()).slice(-2)}${String(createdAt.getMonth()+1).padStart(2,'0')}${String(createdAt.getDate()).padStart(2,'0')}${String(createdAt.getHours()).padStart(2,'0')}${String(createdAt.getMinutes()).padStart(2,'0')}`;
                const finalCode = (data.phone || "00000000000").slice(0, -2) + timeCode;
                const timestamp = new Date().getTime();
                const imgUrl = `https://sowonnamoo1005.cafe24.com/1/${finalCode}.jpg`;

                dImage.innerHTML = `
                <div id="image-container" style="position: relative; width: 744px; height: 500px; margin: 0; border: none; display: flex; align-items: center; justify-content: flex-start; background-color: #f9f9f9;">
                    <img id="loading-msg" src="https://sowonnamoo1005.cafe24.com/web/1new/preview_v1.jpg" alt="제작중" style="max-width: 100%; max-height: 100%; display: none;">
                    
                    <a href="${imgUrl}?t=${timestamp}" target="_blank" class="auto-refresh-link" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
                        <img src="${imgUrl}?t=${timestamp}" 
                             class="auto-refresh-img" 
                             alt="시안 이미지" 
                             onerror="this.style.display='none'; document.getElementById('loading-msg').style.display='block';"
                             onload="document.getElementById('loading-msg').style.display='none';"
                             style="width: 100%; height: 100%; object-fit: contain; cursor: pointer; display: block;">
                    </a>
                </div>
                <div style="text-align: left; margin-top: 5px; font-size: 9pt; font-weight: bold; color: black; padding-left: 5px;">
                    재구입 이미지번호 : ${finalCode}
                </div>`;
            }
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    };
    document.getElementById("modal-cancel-btn").onclick = () => modal.classList.add("hidden");
};

// 메모 저장/삭제
document.getElementById("save-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return;
    const input = document.getElementById("memo-input");
    if (!input.value.trim()) return;
    const snapshot = await getDocs(query(collection(db, "boards", currentViewId, "hanjool")));
    await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
    await addDoc(collection(db, "boards", currentViewId, "hanjool"), { text: input.value, createdAt: new Date() });
    input.value = "";
    await checkMemoAndSetButton(currentViewId, "pending");
    alert("메모가 저장되었습니다.");
});

document.getElementById("delete-memo-btn").addEventListener("click", async () => {
    if (!currentViewId) return;
    const snapshot = await getDocs(query(collection(db, "boards", currentViewId, "hanjool")));
    await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
    await checkMemoAndSetButton(currentViewId, "pending");
    alert("메모가 삭제되었습니다.");
});

loadData();
