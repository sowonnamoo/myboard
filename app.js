import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, increment, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const ordersCollection = collection(db, "orders");

// 페이징 및 검색 제어 전역 변수
let allOrders = [];       // 서버에서 가져온 원본 전체 데이터
let filteredOrders = [];  // 검색 필터링이 적용된 데이터
let currentPage = 1;      // 현재 활성화된 페이지 번음
const POSTS_PER_PAGE = 10; // 한 페이지당 보여줄 게시글 수

// 🖥️ 화면 전환 단순 제어
window.switchView = function(viewName) {
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-write").classList.add("hidden");
    document.getElementById("view-detail").classList.add("hidden");

    if (viewName === 'list') { 
        document.getElementById("view-list").classList.remove("hidden"); 
        loadAndRender(); 
    }
    else if (viewName === 'write') { document.getElementById("view-write").classList.remove("hidden"); }
    else if (viewName === 'detail') { document.getElementById("view-detail").classList.remove("hidden"); }
}

// 🚀 구글 드라이브 연동 모듈 전용 임시 함수
async function uploadToGoogleDrive(fileInputId) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || fileInput.files.length === 0) return null;
    return "https://drive.google.com/drive/my-drive"; 
}

// 📥 최초 서버 데이터 일괄 다운로드
async function loadAndRender() {
    try {
        const q = query(ordersCollection, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        allOrders = [];
        snapshot.forEach(doc => {
            allOrders.push({ id: doc.id, ...doc.data() });
        });
        
        // 검색어 상태 체크 후 가공 필터링 호출
        applyFilter();
    } catch (err) { console.error(err); }
}

// 🔍 작성자 필터 적용
function applyFilter() {
    const searchVal = document.getElementById("search-author").value.trim().toLowerCase();
    if (searchVal) {
        filteredOrders = allOrders.filter(order => (order.author || "").toLowerCase().includes(searchVal));
        document.getElementById("search-reset-btn").classList.remove("hidden");
    } else {
        filteredOrders = [...allOrders];
        document.getElementById("search-reset-btn").classList.add("hidden");
    }
    currentPage = 1; // 검색 시 첫 페이지로 리셋
    renderTable();
}

// 📥 테이블 및 페이징 출력 (숫자 분류 연산 루프)
function renderTable() {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";

    if (filteredOrders.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" class="py-8 text-gray-400 text-center text-sm">내역이 존재하지 않습니다.</td></tr>`;
        document.getElementById("pagination").innerHTML = "";
        return;
    }

    // 페이징 범위 산출 계산식
    const totalPosts = filteredOrders.length;
    const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);
    
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    const endIndex = Math.min(startIndex + POSTS_PER_PAGE, totalPosts);
    const pageData = filteredOrders.slice(startIndex, endIndex);

    // 가상 고유 번호 (구식 게시판 형태의 넘버링 역순 매핑)
    let virtualNumber = totalPosts - startIndex;

    pageData.forEach((data) => {
        // 📅 년도까지 표기하도록 포맷 수정 (예: 2026-06-02)
        let dateStr = "";
        if (data.createdAt) {
            const d = data.createdAt.toDate();
            dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        // 🎨 제목 텍스트 검은색 수정 완료 (`text-gray-900`)
        listBody.innerHTML += `
            <tr class="hover:bg-gray-50 border-b cursor-pointer text-center text-gray-700" onclick="viewDetail('${data.id}')">
                <td class="py-3 text-xs text-gray-400">${virtualNumber--}</td>
                <td class="py-3 px-4 text-left font-medium text-gray-900 hover:underline">🔒 ${data.productName} 시안입니다.</td>
                <td class="py-3 text-sm text-gray-600">${data.author || "익명"}</td>
                <td class="py-3 text-xs text-gray-400">${dateStr}</td>
            </tr>
        `;
    });

    // 🔢 하단 숫자 링크 바 렌더링
    const pager = document.getElementById("pagination");
    pager.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
        const activeClass = i === currentPage ? "active-page" : "";
        pager.innerHTML += `<span class="page-num ${activeClass}" onclick="goToPage(${i})">${i}</span>`;
    }
}

// 페이지 다이렉트 점프 위임 함수
window.goToPage = function(pageNum) {
    currentPage = pageNum;
    renderTable();
}

// 🔍 단일 주문 상세 열람 (비밀번호 체크)
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "orders", id));
    if (!snap.exists()) return;
    const data = snap.data();
    
    if (prompt("비밀번호를 입력하세요 (핸드폰 뒷자리 4자리):") !== data.password) {
        alert("비밀번호가 다릅니다."); return;
    }

    await updateDoc(doc(db, "orders", id), { views: increment(1) });

    document.getElementById("detail-title").innerText = `${data.productName} 스티커 / 도안 접수`;
    document.getElementById("detail-author").innerText = `작성자: ${data.author}`;
    
    let fullDate = "";
    if (data.createdAt) {
        const d = data.createdAt.toDate();
        fullDate = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}:${d.getMinutes()}`;
    }
    document.getElementById("detail-date").innerText = `작성일: ${fullDate}`;
    document.getElementById("detail-views").innerText = `조회: ${data.views + 1}`;
    
    document.getElementById("detail-qty").innerText = data.quantity;
    document.getElementById("detail-size").innerText = data.size;
    document.getElementById("detail-phone").innerText = data.phone;
    document.getElementById("detail-address").innerText = data.address;
    document.getElementById("detail-msg").innerText = data.message || "내용 없음";

    const filesDiv = document.getElementById("detail-files");
    filesDiv.innerHTML = "";
    if(data.file1Url) filesDiv.innerHTML += `<a href="${data.file1Url}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 1 (구글 드라이브)</a>`;
    if(data.file2Url) filesDiv.innerHTML += `<a href="${data.file2Url}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 2 (구글 드라이브)</a>`;
    if(!data.file1Url && !data.file2Url) filesDiv.innerHTML = `<span class="text-xs text-gray-400">첨부 없음</span>`;

    document.getElementById("detail-delete-btn").onclick = async () => {
        if (confirm("정말 삭제하시겠습니까?")) {
            await deleteDoc(doc(db, "orders", id));
            switchView('list');
        }
    };
    switchView('detail');
}

// 💽 주문 데이터 DB 저장
document.getElementById("save-btn").addEventListener("click", async () => {
    const authorName = document.getElementById("input-author").value.trim();
    const pName = document.getElementById("product-name").value.trim();
    const qty = document.getElementById("quantity").value.trim();
    const size = document.getElementById("size").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const address = document.getElementById("address").value.trim();
    const password = document.getElementById("password").value.trim();
    const message = document.getElementById("message").value;

    if (!authorName || !pName || !qty || !size || !phone || !address || !password) {
        alert("필수 항목을 모두 입력해주세요."); return;
    }

    try {
        const file1Url = await uploadToGoogleDrive("file-1");
        const file2Url = await uploadToGoogleDrive("file-2");

        await addDoc(ordersCollection, {
            author: authorName, productName: pName, quantity: qty, size: size, phone: phone, address: address,
            password: password, message: message, file1Url, file2Url, views: 0, createdAt: new Date()
        });

        alert("접수되었습니다.");
        document.querySelectorAll("#view-write input, #view-write textarea").forEach(el => el.value = "");
        switchView('list');
    } catch (e) { alert(e.message); }
});

// 이벤트 리스너 세팅
document.getElementById("go-write-btn").addEventListener("click", () => switchView('write'));
document.getElementById("search-btn").addEventListener("click", applyFilter);
document.getElementById("search-author").addEventListener("keypress", (e) => { if(e.key === 'Enter') applyFilter(); });
document.getElementById("search-reset-btn").addEventListener("click", () => {
    document.getElementById("search-author").value = "";
    applyFilter();
});

// 최초 실행
loadAndRender();
