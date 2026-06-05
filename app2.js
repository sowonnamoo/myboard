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

function renderTable() {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    
allOrders.slice(startIndex, startIndex + POSTS_PER_PAGE).forEach(data => {
    const title = `${data.author}님 (확인하기)`; // 요청하신 제목 형식
    
    listBody.innerHTML += `
        <tr class="hover:bg-gray-50 border-b cursor-pointer text-center" onclick="viewDetail('${data.id}')">
            <td class="py-3 px-4 text-left font-medium text-gray-900">${title}</td>
            <td class="py-3 text-sm text-gray-600 font-bold">관리자</td> <td class="py-3 text-xs text-gray-400">${data.createdAt.toDate().toLocaleDateString()}</td>
        </tr>`;
});

    // 페이징: 최대 5개 노출
    const totalPages = Math.ceil(allOrders.length / POSTS_PER_PAGE);
    const pager = document.getElementById("pagination");
    pager.innerHTML = "";
    
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        const active = i === currentPage ? "bg-gray-800 text-white" : "bg-gray-100";
        pager.innerHTML += `<span class="cursor-pointer px-3 py-1 rounded ${active}" onclick="goToPage(${i})">${i}</span>`;
    }
}

window.goToPage = (p) => { currentPage = p; renderTable(); };

window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    const data = snap.data();
    
    // 비밀번호 검증 (문자열 그대로 비교)
    const inputPwd = prompt("비밀번호를 입력하세요.");
    if (inputPwd !== data.password) return alert("비밀번호 불일치");

    currentViewId = id;
    // 상단 제품 정보
    document.getElementById("detail-header").innerText = 
        `${data.productName} / ${data.quantity} / ${data.size}`;
    document.getElementById("detail-image").innerHTML = `<img src="${data.file1Url}" class="mx-auto">`;
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-detail").classList.remove("hidden");
};

// ... 댓글 저장 로직 동일
loadData();
