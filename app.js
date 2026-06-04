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

// --- 주소 찾기 함수 추가 ---
window.execDaumPostcode = function() {
    new daum.Postcode({
        oncomplete: function(data) {
            // 도로명 주소 또는 지번 주소 넣기
            document.getElementById("address").value = data.address;
            // 상세주소 입력창으로 포커스 이동
            document.getElementById("address-detail").focus();
        }
    }).open();
}

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
        // [수정된 부분] 삭제되지 않은 데이터만 걸러서 담습니다.
        snapshot.forEach(doc => { 
            const data = doc.data();
            if (!data.isDeleted) {
                allOrders.push({ id: doc.id, ...data }); 
            }
        });
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
        
        // --- [수정된 제목 표시 로직] ---
        let displayTitle = data.title || data.productName;
        if (displayTitle.length > 5) {
            displayTitle = displayTitle.substring(0, 5) + "*****";
        }
        // ------------------------------

        listBody.innerHTML += `<tr class="hover:bg-gray-50 border-b cursor-pointer text-center text-gray-700" onclick="viewDetail('${data.id}')">
            <td class="py-3 px-4 text-left font-medium text-gray-900 hover:underline">🔒 ${displayTitle} (접수완료)</td>
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
    const snap = await getDoc(doc(db, "boards", currentViewId));
    
    if (!snap.exists() || inputPwd !== snap.data().password) {
        alert("비밀번호가 다릅니다.");
        return;
    }

    document.getElementById("password-modal").classList.add("hidden");
    document.getElementById("modal-password-input").value = "";
    
    const data = snap.data();
    await updateDoc(doc(db, "boards", currentViewId), { views: increment(1) });
    
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
    if(confirm("삭제하시겠습니까? 삭제된 글은 내역에서 보이지 않게 됩니다.")) { 
        try {
            // 실제 삭제 대신 상태값만 업데이트합니다.
            await updateDoc(doc(db, "boards", currentViewId), {
                isDeleted: true,
                deletedAt: new Date()
            });
            alert("삭제되었습니다.");
            switchView('list');
        } catch (e) {
            alert("삭제 실패: " + e.message);
        }
    } 
};







    
    switchView('detail');
});

document.getElementById("modal-cancel-btn").addEventListener("click", () => {
    document.getElementById("password-modal").classList.add("hidden");
    document.getElementById("modal-password-input").value = "";
});

let textInterval, barInterval; 

document.getElementById("save-btn").addEventListener("click", async () => {
    // 1. 필수 항목 검사 (텍스트 필드)
    const fields = ['input-author', 'product-name', 'quantity', 'size', 'phone', 'address'];
    if (fields.some(id => !document.getElementById(id).value.trim())) { 
        alert("필수 항목을 모두 입력해주세요."); 
        return; 
    }

    // 2. 파일 필수 검사 (최소 1개)
    const file1 = document.getElementById("file-1");
    const file2 = document.getElementById("file-2");
    if (file1.files.length === 0) {
        alert("최소 1개의 파일을 첨부해주세요.");
        return;
    }

    // 3. 파일 이름 중복 검사 (둘 다 있을 때만)
    if (file1.files.length > 0 && file2.files.length > 0) {
        if (file1.files[0].name === file2.files[0].name) {
            alert("1번과 2번에 동일한 파일을 중복으로 첨부할 수 없습니다.");
            return;
        }
    }

    // 4. 전화번호 검사
    const phoneVal = document.getElementById('phone').value.replace(/-/g, '');
    if (phoneVal.length !== 11) {
        alert("전화번호 11자리를 정확히 입력해주세요.");
        return; 
    }

    // 5. 검사 통과 후 애니메이션 시작
    const spinner = document.getElementById("loading-spinner");
    const bar = document.getElementById("red-progress-bar");
    const text = document.getElementById("loading-text");
    spinner.classList.remove("hidden"); 
    bar.style.width = "10%"; 
    text.innerText = "파일 접수중...";
    
    let percent = 10;
    barInterval = setInterval(() => { if(percent < 90) { percent += 10; bar.style.width = percent + "%"; } }, 5000);
    
    const messages = ["웹하드 업로드중..", "잠시 기다려주세요", "정상적으로 업로드 중입니다.", "통상 10MB 용량 기준 50~100초가 소요됩니다"];
    let msgIndex = 0;
    textInterval = setInterval(() => {
        msgIndex = (msgIndex + 1) % messages.length;
        text.innerText = messages[msgIndex];
    }, 3000);

    const autoPassword = phoneVal.slice(-4); 











    
    // 6. IP 수집
    let userIp = "알 수 없음";
    try {
        const res = await fetch("https://api.ipify.org?format=json");
        const json = await res.json();
        userIp = json.ip;
    } catch (e) { console.error("IP 수집 실패", e); }



// [여기에 넣으세요!]
try {
    const blockedSnap = await getDoc(doc(db, "blocked_ips", userIp));
    if (blockedSnap.exists()) {
        alert("접속이 차단된 IP입니다. 글을 작성할 수 없습니다.");
        return; // 여기서 멈추면 저장이 되지 않습니다.
    }
} catch (e) {
    console.log("차단 목록 조회 확인:", e);
}

    



    
    const saveBtn = document.getElementById("save-btn");
    saveBtn.innerText = "파일 업로드중..."; 
    saveBtn.disabled = true;

    try {
        const file1Url = await uploadToGoogleDrive("file-1", document.getElementById('input-author').value);
        const file2Url = await uploadToGoogleDrive("file-2", document.getElementById('input-author').value);
        
        await addDoc(collection(db, "boards"), { 
            author: document.getElementById('input-author').value, 
            productName: document.getElementById('product-name').value, 
            quantity: document.getElementById('quantity').value, 
            size: document.getElementById('size').value, 
            phone: document.getElementById('phone').value, 
            address: document.getElementById('address').value + " " + document.getElementById('address-detail').value, 
            password: autoPassword, 
            message: document.getElementById('message').value, 
            file1Url, 
            file2Url, 
            views: 0, 
  
            
            createdAt: new Date(),
            ip: userIp,
            isDeleted: false // <--- 추가
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










const originalSwitchView = window.switchView;
window.switchView = function(viewName) {
    if (viewName === 'list') { document.getElementById("loading-spinner").classList.add("hidden"); document.getElementById("red-progress-bar").style.width = "0%"; clearInterval(barInterval); clearInterval(textInterval); }
    originalSwitchView(viewName);
};




// 구입 제품명 20글자, 작성자명 5글자 제한
document.getElementById('product-name').addEventListener('input', (e) => {
    if (e.target.value.length > 20) e.target.value = e.target.value.slice(0, 20);
});
document.getElementById('input-author').addEventListener('input', (e) => {
    if (e.target.value.length > 5) e.target.value = e.target.value.slice(0, 5);
});





