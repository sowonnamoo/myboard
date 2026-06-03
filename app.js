// 🔑 구글 앱스 스크립트 웹 앱 URL
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw280zJ4s7AjMmkPvPg3g3JmQRbB2qk3t_lgbzm_qLZP-TUWFsa6e4MdHo1FpglaulV3w/exec";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, increment, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const ordersCollection = collection(db, "boards");

let allOrders = [];        
let filteredOrders = [];  
let currentPage = 1;      
const POSTS_PER_PAGE = 8; 

function createDownloadUrl(url) {
    if (!url) return null;
    try {
        let fileId = "";
        if (url.includes('/d/')) { fileId = url.split('/d/')[1].split('/')[0]; }
        else if (url.includes('id=')) { fileId = url.split('id=')[1].split('&')[0]; }
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    } catch (e) { return url; }
}

window.switchView = function(viewName) {
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-write").classList.add("hidden");
    document.getElementById("view-detail").classList.add("hidden");
    if (viewName === 'list') { document.getElementById("view-list").classList.remove("hidden"); loadAndRender(); }
    else if (viewName === 'write') { document.getElementById("view-write").classList.remove("hidden"); }
    else if (viewName === 'detail') { document.getElementById("view-detail").classList.remove("hidden"); }
}

async function uploadToGoogleDrive(fileInputId, authorName) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || fileInput.files.length === 0) return null;
    const file = fileInput.files[0];
    const fileName = `${authorName || "익명"}_${file.name}`;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const base64Data = e.target.result.split(',')[1];
                const body = new URLSearchParams({ data: base64Data, filename: fileName, mimetype: file.type });
                const res = await fetch(GOOGLE_WEB_APP_URL, { method: 'POST', body });
                const data = await res.json();
                resolve(data && data.url ? data.url : null);
            } catch (error) { resolve(null); }
        };
        reader.readAsDataURL(file);
    });
}

async function loadAndRender() {
    try {
        const q = query(ordersCollection, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        allOrders = [];
        snapshot.forEach(doc => { allOrders.push({ id: doc.id, ...doc.data() }); });
        applyFilter();
    } catch (err) { console.error(err); }
}

function applyFilter() {
    const searchVal = document.getElementById("search-author").value.trim().toLowerCase();
    if (searchVal) {
        filteredOrders = allOrders.filter(order => (order.author || "").toLowerCase().includes(searchVal));
        document.getElementById("search-reset-btn").classList.remove("hidden");
    } else {
        filteredOrders = [...allOrders];
        document.getElementById("search-reset-btn").classList.add("hidden");
    }
    currentPage = 1; 
    renderTable();
}

function renderTable() {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";
    if (filteredOrders.length === 0) {
        listBody.innerHTML = `<tr><td colspan="3" class="py-8 text-gray-400 text-center text-sm">내역이 존재하지 않습니다.</td></tr>`;
        document.getElementById("pagination").innerHTML = "";
        return;
    }
    const totalPages = Math.ceil(filteredOrders.length / POSTS_PER_PAGE);
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    filteredOrders.slice(startIndex, startIndex + POSTS_PER_PAGE).forEach(data => {
        const d = data.createdAt.toDate();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        listBody.innerHTML += `<tr class="hover:bg-gray-50 border-b cursor-pointer text-center text-gray-700" onclick="viewDetail('${data.id}')">
<td class="py-3 px-4 text-left font-medium text-gray-900 hover:underline">🔒 ${data.title || data.productName} (접수완료)</td>
<td class="py-3 text-sm text-gray-600">${data.author || "익명"}</td>
            <td class="py-3 text-xs text-gray-400">${dateStr}</td></tr>`;
    });

    const pager = document.getElementById("pagination");
    pager.innerHTML = "";
    if (currentPage > 1) pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white hover:bg-gray-100 text-sm" onclick="goToPage(${currentPage-1})">이전</span>`;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 5);
    if (endPage - startPage < 5 && totalPages > 5) startPage = Math.max(1, endPage - 5);
    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100";
        pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded text-sm mx-0.5 ${activeClass}" onclick="goToPage(${i})">${i}</span>`;
    }
    if (currentPage < totalPages) pager.innerHTML += `<span class="cursor-pointer px-3 py-1 border rounded bg-white hover:bg-gray-100 text-sm" onclick="goToPage(${currentPage+1})">다음</span>`;
}

window.goToPage = function(pageNum) { currentPage = pageNum; renderTable(); }

let currentViewId = ""; 

window.viewDetail = async function(id) {
    currentViewId = id;
    document.getElementById("password-modal").classList.remove("hidden");
    document.getElementById("modal-password-input").focus();
};

document.getElementById("modal-confirm-btn").addEventListener("click", async () => {
    const inputPwd = document.getElementById("modal-password-input").value;
    const snap = await getDoc(doc(db, "orders", currentViewId));
    
    if (!snap.exists() || inputPwd !== snap.data().password) {
        alert("비밀번호가 다릅니다.");
        return;
    }

    document.getElementById("password-modal").classList.add("hidden");
    document.getElementById("modal-password-input").value = "";
    
    const data = snap.data();
    await updateDoc(doc(db, "orders", currentViewId), { views: increment(1) });
    
    document.getElementById("detail-title").innerText = `${data.productName} 스티커 / 도안 접수`;
    document.getElementById("detail-author").innerText = `작성자: ${data.author}`;
    const d = data.createdAt.toDate();
    document.getElementById("detail-date").innerText = `작성일: ${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
    document.getElementById("detail-views").innerText = `조회: ${data.views + 1}`;
    document.getElementById("detail-qty").innerText = data.quantity;
    document.getElementById("detail-size").innerText = data.size;
    document.getElementById("detail-phone").innerText = data.phone;
    document.getElementById("detail-address").innerText = data.address;
    document.getElementById("detail-msg").innerText = data.message || "내용 없음";
    
    const filesDiv = document.getElementById("detail-files"); 
    filesDiv.innerHTML = "";
    if(data.file1Url) filesDiv.innerHTML += `<a href="${createDownloadUrl(data.file1Url)}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 1 (다운로드)</a>`;
    if(data.file2Url) filesDiv.innerHTML += `<a href="${createDownloadUrl(data.file2Url)}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 2 (다운로드)</a>`;
    
    document.getElementById("detail-delete-btn").onclick = async () => { 
        if(confirm("삭제하시겠습니까?")) { 
            await deleteDoc(doc(db, "orders", currentViewId)); 
            switchView('list'); 
        } 
    };
    switchView('detail');
});

document.getElementById("modal-cancel-btn").addEventListener("click", () => {
    document.getElementById("password-modal").classList.add("hidden");
    document.getElementById("modal-password-input").value = "";
});

document.getElementById("save-btn").addEventListener("click", async () => {
    // 1. 필수 항목 검사 (password 제거됨)
    const fields = ['input-author', 'product-name', 'quantity', 'size', 'phone', 'address'];
    if (fields.some(id => !document.getElementById(id).value.trim())) { 
        alert("필수 항목을 모두 입력해주세요."); 
        return; 
    }
    
    // 2. 전화번호에서 하이픈 제거 후 뒷 4자리 자동 추출
    const phoneVal = document.getElementById('phone').value.replace(/-/g, '');
    const autoPassword = phoneVal.slice(-4); 

    // 3. userIp 변수를 여기서 먼저 선언! (오류 방지)
    let userIp = "알 수 없음";
    try {
        const res = await fetch("https://api.ipify.org?format=json");
        const json = await res.json();
        userIp = json.ip;
    } catch (e) { console.error("IP 수집 실패", e); }

    const saveBtn = document.getElementById("save-btn");
    saveBtn.innerText = "파일 업로드중..."; 
    saveBtn.disabled = true;

    try {
        const file1Url = await uploadToGoogleDrive("file-1", document.getElementById('input-author').value);
        const file2Url = await uploadToGoogleDrive("file-2", document.getElementById('input-author').value);
        
        // 4. Firestore 저장 (컬렉션 이름이 boards 인지 확인하세요)
        await addDoc(collection(db, "boards"), { 
            author: document.getElementById('input-author').value, 
            productName: document.getElementById('product-name').value, 
            quantity: document.getElementById('quantity').value, 
            size: document.getElementById('size').value, 
            phone: document.getElementById('phone').value, 
            address: document.getElementById('address').value, 
            password: autoPassword, 
            message: document.getElementById('message').value, 
            file1Url, 
            file2Url, 
            views: 0, 
            createdAt: new Date(),
            ip: userIp // 이제 여기서 정의된 userIp를 안전하게 사용합니다
        });

        alert("접수되었습니다."); 
        switchView('list');
    } catch (e) { 
        alert("오류: " + e.message); 
    } finally { 
        saveBtn.innerText = "저장하기"; 
        saveBtn.disabled = false; 
    }
});

document.getElementById("go-write-btn").addEventListener("click", () => switchView('write'));
document.getElementById("search-btn").addEventListener("click", applyFilter);
document.getElementById("search-reset-btn").addEventListener("click", () => { document.getElementById("search-author").value = ""; applyFilter(); });
loadAndRender();

// 애니메이션 로직
let textInterval, barInterval;
document.getElementById("save-btn").addEventListener("click", () => {
    const spinner = document.getElementById("loading-spinner"), bar = document.getElementById("red-progress-bar"), text = document.getElementById("loading-text");
    spinner.classList.remove("hidden"); bar.style.width = "10%"; text.innerText = "파일 접수중...";
    let percent = 10;
    barInterval = setInterval(() => { if(percent < 90) { percent += 10; bar.style.width = percent + "%"; } }, 5000);
    textInterval = setInterval(() => { text.innerText = "업로드중입니다..."; }, 3000);
});

const originalSwitchView = window.switchView;
window.switchView = function(viewName) {
    if (viewName === 'list') { document.getElementById("loading-spinner").classList.add("hidden"); document.getElementById("red-progress-bar").style.width = "0%"; clearInterval(barInterval); clearInterval(textInterval); }
    originalSwitchView(viewName);
};
