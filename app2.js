import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ... (firebaseConfig 및 초기화 코드는 동일하게 유지)
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

let allOrders = []; // 원본 데이터
let filteredOrders = []; // 검색된 데이터
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
    filteredOrders = allOrders; // 초기엔 전체 데이터
    renderTable();
}

function renderTable() {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";
    const totalPages = Math.ceil(filteredOrders.length / POSTS_PER_PAGE);
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;

    filteredOrders.slice(startIndex, startIndex + POSTS_PER_PAGE).forEach(data => {
        const title = `${data.author}님 (${data.productName}/${data.quantity}/${data.size})`;
        const dateStr = data.createdAt.toDate().toLocaleDateString();
        listBody.innerHTML += `
    <tr class="hover:bg-gray-50 cursor-pointer border-b border-gray-100" onclick="viewDetail('${data.id}')"> 
        <td class="py-3 px-4 text-left font-medium text-gray-900 truncate">🔒 ${title}</td>
        <td class="py-3 text-sm text-gray-600">관리자</td>
        <td class="py-3 text-xs text-gray-400">${dateStr}</td>
    </tr>`;
    });

    // 페이징 처리 (filteredOrders 기준)
    const pager = document.getElementById("pagination");
    pager.innerHTML = "";
    const range = 5;
    const startPage = Math.floor((currentPage - 1) / range) * range + 1;
    const endPage = Math.min(startPage + range - 1, totalPages);

    if (currentPage > 1) pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white" onclick="goToPage(${currentPage - 1})">이전</span>`;
    for (let i = startPage; i <= endPage; i++) {
        const active = i === currentPage ? "bg-blue-600 text-white" : "bg-white";
        pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded mx-0.5 ${active}" onclick="goToPage(${i})">${i}</span>`;
    }
    if (currentPage < totalPages) pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white" onclick="goToPage(${currentPage + 1})">다음</span>`;
}

// [신규] 검색 로직
document.getElementById("search-btn").addEventListener("click", () => {
    const keyword = document.getElementById("search-author").value.toLowerCase();
    filteredOrders = allOrders.filter(item => item.author.toLowerCase().includes(keyword));
    currentPage = 1;
    document.getElementById("search-reset-btn").classList.remove("hidden");
    renderTable();
});

// [신규] 초기화 로직
document.getElementById("search-reset-btn").addEventListener("click", () => {
    document.getElementById("search-author").value = "";
    filteredOrders = allOrders;
    document.getElementById("search-reset-btn").classList.add("hidden");
    renderTable();
});

window.goToPage = (p) => { currentPage = p; renderTable(); };

// ... (viewDetail 및 댓글 로직은 동일) ...
window.viewDetail = async function(id) { /* ... 기존 모달 로직 ... */ };
loadData();
