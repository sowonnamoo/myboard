import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, addDoc, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const POSTS_PER_PAGE = 8;
let currentViewId = "";

async function loadData() {
    // 1. 최신 20개만 쿼리
    const q = query(collection(db, "boards"), orderBy("createdAt", "desc"), limit(20));
    
    const snapshot = await getDocs(q);
    allOrders = [];
    
    // 2. 데이터 배열에 저장
    snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.isDeleted) allOrders.push({ id: doc.id, ...data });
    });
    
    // 3. 화면 렌더링
    renderTable(allOrders);
}

function renderTable(dataToRender = allOrders) {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";
    
    // [수정] 전체 개수가 아닌 전달받은 데이터(dataToRender) 개수 기준 계산
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

    // [수정] 페이징 영역이 정확히 표시되도록
    const pager = document.getElementById("pagination");
    pager.innerHTML = "";
    
    if (totalPages <= 1) return; // 페이지가 1개면 페이징 표시 안 함

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
    // 검색 중일 때는 검색 결과로, 아니면 전체 데이터로 렌더링하도록 수정
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
    
    // [추가] 랜덤 영문 3자리 생성 함수
    const getRandomChars = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        let result = '';
        for (let i = 0; i < 3; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const modal = document.getElementById("password-modal");
    const input = document.getElementById("modal-password-input");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    modal.classList.remove("hidden");
    input.value = "";
    input.focus();

    confirmBtn.onclick = () => {
        const inputVal = input.value;
        const isNumeric = /^\d+$/.test(storedPass);
        const passToCompare = isNumeric ? storedPass.slice(-4) : storedPass;

        if (inputVal === passToCompare) {
    modal.classList.add("hidden");
    currentViewId = id;
    loadComments(id);
    
    const dTitle = document.getElementById("detail-title");
    const dImage = document.getElementById("detail-image");
    const dCode = document.getElementById("image-code"); // 추가됨
    const vList = document.getElementById("view-list");
    const vDetail = document.getElementById("view-detail");

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
    const watermarkUrl = 'https://sowonnamoo1005.cafe24.com/web/1new/watermark.png';
    const imgUrl = `https://sowonnamoo1005.cafe24.com/1/${finalCode}.jpg`;
    const timestamp = new Date().getTime();

    // 아래 코드로 완전히 교체하세요 (중복 제거 및 테두리/정렬 수정 완료)
dImage.innerHTML = `
    <div id="image-container" style="position: relative; width: 744px; min-height: 500px; margin: 0; border: none; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center;">
        
        <img id="loading-msg" src="https://sowonnamoo1005.cafe24.com/web/1new/preview_v1.jpg" alt="제작중" style="max-width: 100%; max-height: 100%; display: none; position: absolute;">
        
        <a href="water.html?url=${encodeURIComponent(imgUrl + '?t=' + timestamp)}" target="_blank" class="auto-refresh-link" 
           style="display: grid; width: 100%; height: 100%; text-decoration: none; position: relative;">
            
            <img src="${imgUrl}?t=${timestamp}" 
                 class="auto-refresh-img" 
                 alt="시안 이미지" 
                 onerror="this.style.display='none'; document.getElementById('loading-msg').style.display='block';"
                 onload="document.getElementById('loading-msg').style.display='none';"
                 style="grid-area: 1 / 1; width: 100%; height: 100%; object-fit: contain; cursor: pointer; display: block; z-index: 1;">
        </a>
    </div>
    
    <div style="text-align: left; margin-top: 5px; font-size: 9pt; font-weight: bold; color: black; padding-left: 5px;">
        재구입 이미지번호 : ${finalCode}
    </div>`;
}
            
            if (vList) vList.classList.add("hidden");
            if (vDetail) vDetail.classList.remove("hidden");
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    };

    cancelBtn.onclick = () => modal.classList.add("hidden");
};

document.getElementById("save-comment-btn").addEventListener("click", async () => {
    const input = document.getElementById("comment-input");
    if (!input.value) return;
    await addDoc(collection(db, "boards", currentViewId, "comments"), { text: input.value, createdAt: new Date() });
    input.value = "";
    loadComments(currentViewId);
    // alert("댓글이 등록되었습니다."); // 제거됨
});

loadData();


// 검색 기능 구현
document.getElementById("search-btn").addEventListener("click", () => {
    const keyword = document.getElementById("search-author").value.trim();
    if (!keyword) {
        alert("작성자 이름을 입력하세요.");
        return;
    }
    // allOrders에서 작성자 이름이 포함된 데이터만 필터링
    const filteredOrders = allOrders.filter(order => order.author.includes(keyword));
    
    // 화면 갱신을 위해 데이터 임시 교체
    const originalOrders = [...allOrders]; // 원본 보관
    allOrders = filteredOrders;
    currentPage = 1; // 1페이지부터 다시 시작
    renderTable();
    allOrders = originalOrders; // 다시 원본으로 복구 (다음 검색을 위해)
    
    // 초기화 버튼 보이기
    document.getElementById("search-reset-btn").classList.remove("hidden");
});

// 초기화 기능 구현
document.getElementById("search-reset-btn").addEventListener("click", () => {
    document.getElementById("search-author").value = "";
    document.getElementById("search-reset-btn").classList.add("hidden");
    currentPage = 1;
    renderTable();
});



// app2.js 파일 하단에 추가 댓글기능
async function loadComments(boardId) {
    const commentsList = document.getElementById("comments-list");
    const printBtn = document.getElementById("print-approve-btn"); // 인쇄승인 버튼
    const imgEl = document.querySelector('.auto-refresh-img'); // 상세페이지 내 이미지 태그
    
    // 댓글 쿼리
    const q = query(collection(db, "boards", boardId, "comments"), orderBy("createdAt", "asc"));
    const snapshot = await getDocs(q);
    
    // 1. 댓글 유무에 따른 이미지 및 버튼 제어
    if (imgEl) {
        if (!snapshot.empty) {
            // [댓글 있음] "수정접수완료" 이미지로 교체, 버튼 숨김
            imgEl.src = "https://sowonnamoo1005.cafe24.com/web/1new/수정접수완료.jpg";
            if (printBtn) printBtn.classList.add("hidden");
        } else {
            // [댓글 없음] 원래 이미지로 복구 (현재 시각 쿼리 붙여서 강제 새로고침)
            // 주의: 게시글 정보를 다시 가져오기 번거로우므로, 
            // 상세 열 때의 원래 이미지 규칙을 그대로 적용합니다.
            const timestamp = new Date().getTime();
            // 여기서 imgUrl을 재구성하거나, 처음에 로드했던 주소를 유지하도록 합니다.
            // 카페24에 파일이 갱신되면 아래 코드로 최신 이미지를 불러옵니다.
            const currentBaseUrl = imgEl.src.split('?')[0];
            imgEl.src = `${currentBaseUrl}?t=${timestamp}`;
            
            if (printBtn) printBtn.classList.remove("hidden");
        }
    }

    // 2. 댓글 목록 렌더링
    commentsList.innerHTML = "";
    if (snapshot.empty) {
        commentsList.innerHTML = '<p class="text-gray-400">등록된 댓글이 없습니다.</p>';
    } else {
        snapshot.forEach(doc => {
            const comment = doc.data();
            const date = comment.createdAt ? comment.createdAt.toDate().toLocaleString() : "";
            commentsList.innerHTML += `
                <div class="border-b py-2 flex justify-between items-center">
                    <div>
                        <span>${comment.text}</span>
                        <span class="text-xs text-gray-400 ml-2">${date}</span>
                    </div>
                    <button class="delete-comment-btn text-xs text-red-500 hover:underline" data-id="${doc.id}">삭제</button>
                </div>`;
        });
    }

    // 3. 삭제 이벤트 연결
    document.querySelectorAll(".delete-comment-btn").forEach(btn => {
        btn.onclick = async (e) => {
            if(confirm("댓글을 삭제하시겠습니까?")) {
                const commentId = e.target.getAttribute("data-id");
                await deleteDoc(doc(db, "boards", currentViewId, "comments", commentId));
                loadComments(currentViewId); // 삭제 후 상태 갱신
            }
        };
    });
}
