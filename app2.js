import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
    const q = query(collection(db, "boards"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    allOrders = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.isDeleted) allOrders.push({ id: doc.id, ...data });
    });
    renderTable();
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
            <button onclick="viewDetail('${data.id}')" class="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full mr-2 hover:bg-blue-700">시안보기</button>
            <span class="text-xs text-gray-500">${displayInfo}</span>
        </td>
        <td class="py-3 text-sm text-gray-600">관리자</td>
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

// 비밀번호 모달 로직 연동
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    const data = snap.data();
    const storedPass = String(data.password || "");
    
    const modal = document.getElementById("password-modal");
    const input = document.getElementById("modal-password-input");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    modal.classList.remove("hidden");
    input.value = "";
    input.focus();

    confirmBtn.onclick = () => {
        const inputVal = input.value;
        // 로직: 숫자만 있으면 뒷 4자리, 아니면 전체 비교
        const isNumeric = /^\d+$/.test(storedPass);
        const passToCompare = isNumeric ? storedPass.slice(-4) : storedPass;

        if (inputVal === passToCompare) {
            modal.classList.add("hidden");
            currentViewId = id;
            document.getElementById("detail-title").innerText = `${data.author}님 (${data.productName}/${data.quantity}/${data.size})`;
            document.getElementById("detail-image").innerHTML = `<img src="${data.file1Url}" class="max-w-full mx-auto">`;
            document.getElementById("view-list").classList.add("hidden");
            document.getElementById("view-detail").classList.remove("hidden");
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
    alert("댓글이 등록되었습니다.");
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
