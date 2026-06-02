// 🔑 구글 앱스 스크립트 웹 앱 URL (이전 방식 그대로 활용)
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw280zJ4s7AjMmkPvPg3g3JmQRbB2qk3t_lgbzm_qLZP-TUWFsa6e4MdHo1FpglaulV3w/exec";
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

let allOrders = [];       
let filteredOrders = [];  
let currentPage = 1;      
const POSTS_PER_PAGE = 8; 

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

// 📁 [수정완료] 파일별 실시간 업로드 퍼센트(%)를 추적하는 XHR 업로드 함수
function uploadToGoogleDriveWithProgress(fileInputId, authorName, onProgress) {
    return new Promise((resolve, reject) => {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput || fileInput.files.length === 0) {
            resolve(null); // 파일이 없으면 즉시 null 반환 (pass)
            return;
        }

        const file = fileInput.files[0];
        const fileName = `${authorName || "익명"}_${file.name}`;
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const base64Data = e.target.result.split(',')[1];
            
            // 실시간 퍼센트 감지를 위해 fetch 대신 XMLHttpRequest(XHR) 사용
            const xhr = new XMLHttpRequest();
            xhr.open("POST", GOOGLE_WEB_APP_URL, true);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

            // 📊 파일 업로드 진행률 실시간 계산 이벤트
            xhr.upload.onprogress = function(event) {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    if (onProgress) onProgress(percentComplete); // 콜백 함수로 퍼센트 전달
                }
            };

            xhr.onload = function() {
                if (xhr.status === 200) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (data && data.url) {
                            resolve(data.url); // 성공 시 진짜 구글 드라이브 주소 반환
                        } else {
                            resolve(null);
                        }
                    } catch (err) {
                        resolve(null);
                    }
                } else {
                    reject(new Error("구글 업로드 실패"));
                }
            };

            xhr.onerror = function() {
                reject(new Error("네트워크 오류 발생"));
            };

            // 구글 웹 앱 양식에 맞춰 데이터 가공 후 전송
            const body = `data=${encodeURIComponent(base64Data)}&filename=${encodeURIComponent(fileName)}&mimetype=${encodeURIComponent(file.type)}`;
            xhr.send(body);
        };

        fr.onerror = function() {
            reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
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

    const pager = document.getElementById("pagination");
    pager.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
        const activeClass = i === currentPage ? "active-page" : "";
        pager.innerHTML += `<span class="page-num ${activeClass}" onclick="goToPage(${i})">${i}</span>`;
    }
}

window.goToPage = function(pageNum) {
    currentPage = pageNum;
    renderTable();
}

// 🔒 비밀글 열람 모달 연동 및 데이터 바인딩 (파일 3개 노출 적용완료)
window.viewDetail = async function(id) {
    const snap = await getDoc(doc(db, "orders", id));
    if (!snap.exists()) return;
    const data = snap.data();
    
    const modal = document.getElementById("password-modal");
    const passwordInput = document.getElementById("modal-password-input");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    passwordInput.value = "";
    modal.classList.remove("hidden");
    passwordInput.focus();

    confirmBtn.onclick = async () => {
        const inputPass = passwordInput.value.trim();
        
        if (inputPass !== data.password) {
            alert("비밀번호가 다릅니다.");
            passwordInput.value = "";
            passwordInput.focus();
            return;
        }

        modal.classList.add("hidden");

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

        // 파일 3개 출력 로직 정돈
        const filesDiv = document.getElementById("detail-files");
        filesDiv.innerHTML = "";
        if(data.file1Url) filesDiv.innerHTML += `<a href="${data.file1Url}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 1 (구글 드라이브)</a>`;
        if(data.file2Url) filesDiv.innerHTML += `<a href="${data.file2Url}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 2 (구글 드라이브)</a>`;
        if(data.file3Url) filesDiv.innerHTML += `<a href="${data.file3Url}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 3 (구글 드라이브)</a>`;
        if(!data.file1Url && !data.file2Url && !data.file3Url) filesDiv.innerHTML = `<span class="text-xs text-gray-400">첨부 없음</span>`;

        document.getElementById("detail-delete-btn").onclick = async () => {
            if (confirm("정말 삭제하시겠습니까?")) {
                await deleteDoc(doc(db, "orders", id));
                switchView('list');
            }
        };
        switchView('detail');
    };

    cancelBtn.onclick = () => {
        modal.classList.add("hidden");
    };

    passwordInput.onkeypress = (e) => {
        if (e.key === 'Enter') confirmBtn.click();
    };
}

// 💾 실시간 통합 퍼센트(%) 연동 저장 프로세스 (파일 3개 대응 완료)
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
    const spinner = document.getElementById("loading-spinner");
    const progressText = document.getElementById("upload-progress");

    saveBtn.innerText = "업로드 및 저장 중...";
    saveBtn.disabled = true;
    
    // 퍼센트 초기화 후 로딩창 띄우기
    if (progressText) progressText.innerText = "0 Grandma%";
    spinner.classList.remove("hidden");

    try {
        // 실제 유저가 선택한 첨부파일 개수 동적 파악
        const hasFile1 = document.getElementById("file-1").files.length > 0;
        const hasFile2 = document.getElementById("file-2").files.length > 0;
        const hasFile3 = document.getElementById("file-3").files.length > 0;
        const totalFiles = [hasFile1, hasFile2, hasFile3].filter(Boolean).length || 1;

        let p1 = 0, p2 = 0, p3 = 0;
        
        // 현재 전송 현황을 계산해 실시간 %를 찍어주는 함수
        const updateDisplay = () => {
            const totalPercent = Math.round((p1 + p2 + p3) / totalFiles);
            if (progressText) progressText.innerText = `${totalPercent}%`;
        };

        // 파일 1 실시간 업로드
        const file1Url = await uploadToGoogleDriveWithProgress("file-1", authorName, (p) => {
            p1 = p; updateDisplay();
        });

        // 파일 2 실시간 업로드
        const file2Url = await uploadToGoogleDriveWithProgress("file-2", authorName, (p) => {
            p2 = p; updateDisplay();
        });

        // 파일 3 실시간 업로드
        const file3Url = await uploadToGoogleDriveWithProgress("file-3", authorName, (p) => {
            p3 = p; updateDisplay();
        });

        if (progressText) progressText.innerText = "100% (DB 저장 중...)";

        // 파이어베이스 최종 저장 데이터 안착
        await addDoc(ordersCollection, {
            author: authorName, productName: pName, quantity: qty, size: size, phone: phone, address: address,
            password: password, message: message, file1Url, file2Url, file3Url, views: 0, createdAt: new Date()
        });

        spinner.classList.add("hidden"); 
        alert("접수되었습니다.");
        
        document.querySelectorAll("#view-write input, #view-write textarea").forEach(el => el.value = "");
        switchView('list');
    } catch (e) { 
        spinner.classList.add("hidden");
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
