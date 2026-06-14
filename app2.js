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
            <button onclick="viewDetail('${data.id}')" class="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full mr-2 hover:bg-blue-700">시안확인</button>
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

window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    if (!snap.exists()) return alert("게시글이 존재하지 않습니다.");
    const data = snap.data();
    
    const modal = document.getElementById("password-modal");
    modal.classList.remove("hidden");
    
    document.getElementById("modal-confirm-btn").onclick = () => {
        if (document.getElementById("modal-password-input").value === (String(data.password || "").slice(-4))) {
            modal.classList.add("hidden");
            currentViewId = id;
            
            // UI 세팅
            document.getElementById("view-list").classList.add("hidden");
            document.getElementById("view-detail").classList.remove("hidden");
            document.getElementById("detail-title").innerText = `${data.author}님 상세정보`;
            
            // 이미지 세팅
            const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
            const timeCode = `${String(createdAt.getFullYear()).slice(-2)}${String(createdAt.getMonth() + 1).padStart(2, '0')}${String(createdAt.getDate()).padStart(2, '0')}${String(createdAt.getHours()).padStart(2, '0')}${String(createdAt.getMinutes()).padStart(2, '0')}`;
            const imgUrl = `https://sowonnamoo1005.cafe24.com/1/${(data.phone || "00000000000").slice(0, -2)}${timeCode}.jpg`;
            
            document.getElementById("detail-image").innerHTML = `
                <img id="main-img" src="${imgUrl}?t=${new Date().getTime()}" style="width:100%; object-fit:contain;" data-original-src="${imgUrl}">
                <div style="font-size: 9pt; margin-top:5px;">이미지번호: ${timeCode}</div>`;
            
            loadComments(id);
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    };
};

async function loadComments(boardId) {
    const commentsList = document.getElementById("comments-list");
    const mainImg = document.getElementById("main-img");
    
    const q = query(collection(db, "boards", boardId, "comments"), orderBy("createdAt", "desc"), limit(1));
    const snapshot = await getDocs(q);
    
    const updateImage = (hasComment) => {
        if (!mainImg) return;
        mainImg.src = hasComment ? "https://sowonnamoo1005.cafe24.com/web/1new/sujung.png" : `${mainImg.dataset.originalSrc}?t=${new Date().getTime()}`;
    };

    commentsList.innerHTML = "";
    if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const comment = docSnap.data();
        commentsList.innerHTML = `
            <div class="border-b py-2 flex justify-between" id="comment-item">
                <span>${comment.text}</span>
                <button class="text-xs text-red-500" onclick="deleteComment('${docSnap.id}')">삭제</button>
            </div>`;
        updateImage(true);
    } else {
        updateImage(false);
    }
}

window.deleteComment = async (commentId) => {
    await deleteDoc(doc(db, "boards", currentViewId, "comments", commentId));
    loadComments(currentViewId); // 삭제 후 다시 로드하여 이미지 상태 갱신
};

document.getElementById("save-comment-btn").addEventListener("click", async () => {
    const input = document.getElementById("comment-input");
    if (!input.value) return;
    await addDoc(collection(db, "boards", currentViewId, "comments"), { text: input.value, createdAt: new Date() });
    input.value = "";
    loadComments(currentViewId);
});

loadData();
