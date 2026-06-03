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
const ordersCollection = collection(db, "orders");

let allOrders = [];       
let filteredOrders = [];  
let currentPage = 1;      
const POSTS_PER_PAGE = 8; 

// 🔗 [추가] 링크를 무조건 다운로드 가능하게 변환하는 함수
function createDownloadUrl(url) {
    if (!url) return null;
    try {
        let fileId = "";
        if (url.includes('/d/')) {
            fileId = url.split('/d/')[1].split('/')[0];
        } else if (url.includes('id=')) {
            fileId = url.split('id=')[1].split('&')[0];
        }
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    } catch (e) {
        return url;
    }
}

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
                const body = new URLSearchParams({
                    data: base64Data,
                    filename: fileName,
                    mimetype: file.type
                });

                const res = await fetch(GOOGLE_WEB_APP_URL, { method: 'POST', body });
                const data = await res.json();
                
                if (data && data.url) {
                    resolve(data.url);
                } else {
                    resolve(null);
                }
            } catch (error) {
                console.error("구글 드라이브 업로드 실패:", error);
                resolve(null);
            }
        };
        reader.readAsDataURL(file);
    });
}

async function loadAndRender() {
    try {
        const q = query(ordersCollection, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        allOrders = [];
        snapshot.forEach(doc => {
            allOrders.push({ id: doc.id, ...doc.data() });
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

    const totalPosts = filteredOrders.length;
    const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);
    
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    const endIndex = Math.min(startIndex + POSTS_PER_PAGE, totalPosts);
    const pageData = filteredOrders.slice(startIndex, endIndex);

    pageData.forEach((data) => {
        let dateStr = "";
        if (data.createdAt) {
            const d = data.createdAt.toDate();
            dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        listBody.innerHTML += `
            <tr class="hover:bg-gray-50 border-b cursor-pointer text-center text-gray-700" onclick="viewDetail('${data.id}')">
                <td class="py-3 px-4 text-left font-medium text-gray-900 hover:underline">🔒 ${data.productName} 시안입니다.</td>
                <td class="py-3 text-sm text-gray-600">${data.author || "익명"}</td>
                <td class="py-3 text-xs text-gray-400">${dateStr}</td>
            </tr>
        `;
    });

    // 페이지네이션 부분
    const pager = document.getElementById("pagination");
    pager.innerHTML = "";

    if (totalPages <= 0) return;

    // [이전] 버튼 디자인
    if (currentPage > 1) {
        pager.innerHTML += `
            <span class="cursor-pointer px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-100 text-sm text-gray-700" 
                  onclick="goToPage(${currentPage - 1})">이전</span>`;
    }

    // 숫자 버튼 디자인
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 5);
    if (endPage - startPage < 5 && totalPages > 5) {
        startPage = Math.max(1, endPage - 5);
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage 
            ? "bg-blue-600 text-white border-blue-600" 
            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100";
            
        pager.innerHTML += `
            <span class="cursor-pointer px-3 py-1 border ${activeClass} rounded text-sm mx-0.5" 
                  onclick="goToPage(${i})">${i}</span>`;
    }

    // [다음] 버튼 디자인
    if (currentPage < totalPages) {
        pager.innerHTML += `
            <span class="cursor-pointer px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-100 text-sm text-gray-700" 
                  onclick="goToPage(${currentPage + 1})">다음</span>`;
    }

window.goToPage = function(pageNum) {
    currentPage = pageNum;
    renderTable();
}

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

    // 📁 수정된 다운로드 로직 적용
    if(data.file1Url) {
        filesDiv.innerHTML += `<a href="${createDownloadUrl(data.file1Url)}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 1 (다운로드)</a>`;
    }
    if(data.file2Url) {
        filesDiv.innerHTML += `<a href="${createDownloadUrl(data.file2Url)}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 2 (다운로드)</a>`;
    }
    if(!data.file1Url && !data.file2Url) filesDiv.innerHTML = `<span class="text-xs text-gray-400">첨부 없음</span>`;

    document.getElementById("detail-delete-btn").onclick = async () => {
        if (confirm("정말 삭제하시겠습니까?")) {
            await deleteDoc(doc(db, "orders", id));
            switchView('list');
        }
    };
    switchView('detail');
}

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

    const saveBtn = document.getElementById("save-btn");
    saveBtn.innerText = "파일 업로드중...잠시 기다려주세요";
    saveBtn.disabled = true;

    try {
        const file1Url = await uploadToGoogleDrive("file-1", authorName);
        const file2Url = await uploadToGoogleDrive("file-2", authorName);

        await addDoc(ordersCollection, {
            author: authorName, productName: pName, quantity: qty, size: size, phone: phone, address: address,
            password: password, message: message, file1Url, file2Url, views: 0, createdAt: new Date()
        });

        alert("접수되었습니다.");
        document.querySelectorAll("#view-write input, #view-write textarea").forEach(el => el.value = "");
        switchView('list');
    } catch (e) { 
        alert("오류가 발생했습니다: " + e.message); 
    } finally {
        saveBtn.innerText = "저장하기";
        saveBtn.disabled = false;
    }
});

document.getElementById("go-write-btn").addEventListener("click", () => switchView('write'));
document.getElementById("search-btn").addEventListener("click", applyFilter);
document.getElementById("search-author").addEventListener("keypress", (e) => { if(e.key === 'Enter') applyFilter(); });
document.getElementById("search-reset-btn").addEventListener("click", () => {
    document.getElementById("search-author").value = "";
    applyFilter();
});

loadAndRender();

let textInterval;
let barInterval;

document.getElementById("save-btn").addEventListener("click", () => {
    const spinner = document.getElementById("loading-spinner");
    const bar = document.getElementById("red-progress-bar");
    const text = document.getElementById("loading-text");
    
    spinner.classList.remove("hidden");
    bar.style.transition = "width 0.5s linear";
    bar.style.width = "10%"; 
    text.innerText = "파일 접수중...";
    
    let percent = 10;
    const messages = [
        "파일 접수중...", 
        "잠시 기다려주세요", 
        "파일이 정상적으로 업로드중 입니다", 
        "업로드시간 10MB기준 약50~100초 걸립니다."
    ];
    let msgIndex = 0;

    barInterval = setInterval(() => {
        if (percent < 90) {
            percent += 10;
            bar.style.width = percent + "%";
        } else {
            clearInterval(barInterval);
        }
    }, 5000);

    textInterval = setInterval(() => {
        if (msgIndex < messages.length - 1) {
            msgIndex++;
            text.innerText = messages[msgIndex];
        } else {
            text.innerText = messages[messages.length - 1];
        }
    }, 3000);
});

const originalSwitchView = window.switchView;
window.switchView = function(viewName) {
    if (viewName === 'list') {
        document.getElementById("loading-spinner").classList.add("hidden");
        document.getElementById("red-progress-bar").style.width = "0%";
        clearInterval(barInterval);
        clearInterval(textInterval);
    }
    originalSwitchView(viewName);
};
