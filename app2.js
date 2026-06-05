import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    // [중요] 기존 index1의 firebaseConfig 내용을 그대로 복사해 넣으세요!
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
    const totalPages = Math.ceil(allOrders.length / POSTS_PER_PAGE);
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;

    allOrders.slice(startIndex, startIndex + POSTS_PER_PAGE).forEach(data => {
        const title = `${data.author}님 (${data.productName}/${data.quantity}/${data.size})`;
        const dateStr = data.createdAt.toDate().toLocaleDateString();
        
listBody.innerHTML += `
    <tr class="hover:bg-gray-50 cursor-pointer border-b border-gray-100" onclick="viewDetail('${data.id}')"> 
        <td class="py-3 px-4 text-left font-medium text-gray-900 truncate">🔒 ${title}</td>
        <td class="py-3 text-sm text-gray-600">관리자</td>
        <td class="py-3 text-xs text-gray-400">${dateStr}</td>
    </tr>`;
    });

// 페이징 로직 부분 (기존 코드 삭제 후 교체)
    const pager = document.getElementById("pagination");
    pager.innerHTML = "";
    
    // 5개씩 끊어서 보여주기 위한 범위 계산
    const range = 5;
    const startPage = Math.floor((currentPage - 1) / range) * range + 1;
    const endPage = Math.min(startPage + range - 1, totalPages);

    if (currentPage > 1) {
        pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white" onclick="goToPage(${currentPage - 1})">이전</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        const active = i === currentPage ? "bg-blue-600 text-white" : "bg-white";
        pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded mx-0.5 ${active}" onclick="goToPage(${i})">${i}</span>`;
    }

    if (currentPage < totalPages) {
        pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white" onclick="goToPage(${currentPage + 1})">다음</span>`;
    
    }
    if (currentPage < totalPages) pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white" onclick="goToPage(${currentPage+1})">다음</span>`;
}

window.goToPage = (p) => { currentPage = p; renderTable(); };

window.viewDetail = async function(id) {
    currentViewId = id;
    const snap = await getDoc(doc(db, "boards", id));
    const data = snap.data();
    
    document.getElementById("detail-title").innerText = `${data.author}님 (${data.productName}/${data.quantity}/${data.size})`;
    document.getElementById("detail-image").innerHTML = `<img src="${data.file1Url}" class="max-w-full mx-auto">`;
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-detail").classList.remove("hidden");
};

document.getElementById("save-comment-btn").addEventListener("click", async () => {
    const input = document.getElementById("comment-input");
    if (!input.value) return;
    await addDoc(collection(db, "boards", currentViewId, "comments"), { text: input.value, createdAt: new Date() });
    input.value = "";
    alert("댓글이 등록되었습니다.");
});

loadData();
