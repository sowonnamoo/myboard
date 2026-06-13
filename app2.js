import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, onSnapshot, updateDoc, addDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// 1. 데이터 로드
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

// 2. 테이블 렌더링
function renderTable(dataToRender = allOrders) {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";
    
    dataToRender.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE).forEach(data => {
        const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : "";
        listBody.innerHTML += `
            <tr class="hover:bg-gray-50 border-b border-gray-100"> 
                <td class="py-3 px-4 text-left font-medium text-gray-900 truncate">
                    <span class="mr-2">🔒 ${data.author}님</span>
                    <button onclick="viewDetail('${data.id}')" class="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full">시안상태보기</button>
                </td>
                <td class="py-3 text-sm text-gray-600">에코그래픽스</td>
                <td class="py-3 text-xs text-gray-400">${dateStr}</td>
            </tr>`;
    });
}

// 3. 상세페이지 진입 및 상태 감시 (리모컨 핵심)
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "boards", id));
    if (!snap.exists()) return alert("게시글이 존재하지 않습니다.");
    
    // 비밀번호 로직 (생략 - 기존과 동일)
    currentViewId = id;
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-detail").classList.remove("hidden");

    // [핵심] 상태 변화 감지 리스너 (관리자가 admin3에서 버튼 누르면 여기로 신호가 옴)
    onSnapshot(doc(db, "boards", id), (doc) => {
        const data = doc.data();
        updateUIByStatus(data);
    });
};

// 4. 상태에 따른 UI 제어
function updateUIByStatus(data) {
    const status = data.status || 'initial';
    const dImage = document.getElementById("detail-image");
    const commentInput = document.getElementById("comment-input");
    const approveBtn = document.getElementById("approve-btn");

    if (status === 'initial') {
        dImage.innerHTML = `<p class="py-20 text-gray-500">시안 제작중입니다.<br>결제확인 되시면 제작후 업로드 됩니다.</p>`;
        commentInput.disabled = true;
        approveBtn.disabled = true;
    } else if (status === 's1') {
        dImage.innerHTML = `<img src="https://sowonnamoo1005.cafe24.com/web/1new/preview_v1.jpg" style="width:100%;">`;
        commentInput.disabled = true;
        approveBtn.disabled = false;
    } else if (status === 'editing') {
        dImage.innerHTML = `
            <div style="position:relative; height:500px; display:flex; justify-content:center;">
                <img src="https://sowonnamoo1005.cafe24.com/web/1new/working_notice.jpg" style="width:100%; height:100%; object-fit:contain;">
                <img src="https://sowonnamoo1005.cafe24.com/web/1new/preview_v1.jpg" style="position:absolute; width:400px; top:50px; z-index:10; border:2px solid #000;">
            </div>`;
        commentInput.disabled = false;
        approveBtn.disabled = true;
    }
}

// 5. 댓글 저장 및 초기화
document.getElementById("save-comment-btn").addEventListener("click", async () => {
    const input = document.getElementById("comment-input");
    if (!input.value) return;
    await addDoc(collection(db, "boards", currentViewId, "comments"), { text: input.value, createdAt: new Date() });
    alert("댓글이 등록되었습니다.");
    input.value = "";
});

document.getElementById("reset-comment-btn").addEventListener("click", async () => {
    if(!confirm("댓글을 초기화하고 다시 승인 대기 상태로 돌릴까요?")) return;
    await updateDoc(doc(db, "boards", currentViewId), { status: 's1' });
});

loadData();
