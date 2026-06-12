// 🔑 구글 앱스 스크립트 웹 앱 URL
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw280zJ4s7AjMmkPvPg3g3JmQRbB2qk3t_lgbzm_qLZP-TUWFsa6e4MdHo1FpglaulV3w/exec";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, increment, getDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

window.execDaumPostcode = function() {
    new daum.Postcode({
        oncomplete: function(data) {
            document.getElementById("address").value = data.address;
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
    const fileName = `${authorName || ""}_${file.name}`;
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
    const now = new Date();
    filteredOrders.slice(startIndex, startIndex + POSTS_PER_PAGE).forEach(data => {
        const d = data.createdAt.toDate();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const diffInHours = (now - d) / (1000 * 60 * 60);
        const newBadge = diffInHours <= 24 ? '<span class="new-badge">NEW</span>' : '';
        let displayTitle = data.title || data.productName;
        if (displayTitle.length > 5) displayTitle = displayTitle.substring(0, 10) + "***";
        listBody.innerHTML += `<tr class="hover:bg-gray-50 border-b cursor-pointer text-center text-gray-700" onclick="viewDetail('${data.id}')">
            <td class="py-3 px-4 text-left font-medium text-gray-900 hover:underline">🔒 ${displayTitle} (접수완료) ${newBadge}</td>
            <td class="py-3 text-sm text-gray-600">${data.author || "김준혁"}</td>
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
    if (!snap.exists() || inputPwd !== snap.data().password) { alert("비밀번호가 다릅니다."); return; }
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

    document.getElementById("detail-price").innerText = data.price ? data.price.toLocaleString() + '원' : '0원';
    document.getElementById("detail-phone").innerText = data.phone;
    document.getElementById("detail-address").innerText = data.address;
    document.getElementById("detail-msg").innerText = data.message || "내용 없음";
    window.syncStatusOverlay(data.status);
    
    // 수정 버튼 안전하게 연결
    const editBtn = document.getElementById("detail-edit-btn");
    if (editBtn) {
        editBtn.onclick = () => {
            const url = `edit.html?id=${currentViewId}&author=${encodeURIComponent(data.author)}&phone=${encodeURIComponent(data.phone)}&address=${encodeURIComponent(data.address)}`;
            window.open(url, "editWindow", "width=400,height=500");
        };
    }
    
    const filesDiv = document.getElementById("detail-files"); 
    filesDiv.innerHTML = "";
    if(data.file1Url) filesDiv.innerHTML += `<a href="${createDownloadUrl(data.file1Url)}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 1 (다운로드)</a>`;
    if(data.file2Url) filesDiv.innerHTML += `<a href="${createDownloadUrl(data.file2Url)}" target="_blank" class="block text-xs text-blue-600 hover:underline">📁 첨부파일 2 (다운로드)</a>`;
    document.getElementById("detail-delete-btn").onclick = async () => { 
        if(confirm("삭제하시겠습니까?")) { 
            try { await updateDoc(doc(db, "boards", currentViewId), { isDeleted: true, deletedAt: new Date() }); alert("삭제되었습니다."); switchView('list'); } catch (e) { alert("삭제 실패: " + e.message); }
        } 
    };
    switchView('detail');
});

// ... 나머지는 기존 코드와 동일 (생략) ...
document.getElementById("modal-cancel-btn").addEventListener("click", () => {
    document.getElementById("password-modal").classList.add("hidden");
    document.getElementById("modal-password-input").value = "";
});

let textInterval, barInterval; 
document.getElementById("save-btn").addEventListener("click", async () => {
    // 1. 기존 유효성 검사 (침범 안 함)
    const fields = ['input-author', 'product-name', 'quantity', 'size', 'phone', 'address'];
    if (fields.some(id => !document.getElementById(id).value.trim())) { alert("필수 항목을 모두 입력해주세요."); return; }
    const file1 = document.getElementById("file-1");
    if (file1.files.length === 0) { alert("최소 1개의 파일을 첨부해주세요."); return; }
    const phoneVal = document.getElementById('phone').value.replace(/-/g, '');
    if (phoneVal.length !== 11) { alert("전화번호 11자리를 정확히 입력해주세요."); return; }

    // 2. 로딩바 시작 로직 (요청하신 대로 3초마다 5% 증가, 텍스트 변경)
    const spinner = document.getElementById("loading-spinner");
    const bar = document.getElementById("red-progress-bar");
    const text = document.getElementById("loading-text");
    const messages = ["파일 접수중...", "파일이 정상 업로드 중입니다.", "기다려주세요.", "정상 업로드중"];
    
    spinner.classList.remove("hidden");
    bar.style.width = "5%";
    text.innerText = messages[0];
    
    let percent = 5;
    let msgIndex = 0;
    const interval = setInterval(() => {
        if (percent < 90) {
            percent += 5;
            bar.style.width = percent + "%";
        }
        msgIndex = (msgIndex + 1) % messages.length;
        text.innerText = messages[msgIndex];
    }, 3000); // 3초 간격

    // 3. 기존 글쓰기 로직 (침범 안 함)
    try {
        const file1Url = await uploadToGoogleDrive("file-1", document.getElementById('input-author').value);
        const file2Url = await uploadToGoogleDrive("file-2", document.getElementById('input-author').value);
        
        await addDoc(collection(db, "boards"), { 
            author: document.getElementById('input-author').value, 
            productName: document.getElementById('product-name').value, 
            quantity: document.getElementById('quantity').value, 
            size: document.getElementById('size').value, 
            phone: document.getElementById('phone').value, 
            price: document.getElementById('price').value,
            address: document.getElementById('address').value + " " + document.getElementById('address-detail').value, 
            password: phoneVal.slice(-4), 
            message: document.getElementById('message').value, 
            file1Url, file2Url, views: 0, createdAt: new Date(), isDeleted: false
        });
        
        alert("접수되었습니다."); 
        switchView('list');
    } catch (e) { 
        alert("오류: " + e.message); 
    } finally { 
        // 4. 로딩바 종료
        clearInterval(interval);
        spinner.classList.add("hidden");
        bar.style.width = "0%";
    }
});

document.getElementById("go-write-btn").addEventListener("click", () => switchView('write'));
document.getElementById("search-btn").addEventListener("click", applyFilter);
document.getElementById("search-reset-btn").addEventListener("click", () => { document.getElementById("search-author").value = ""; applyFilter(); });
loadAndRender();


// 장바구니 담기 + 팝업 열기 통합 코드
document.getElementById("add-cart-btn").addEventListener("click", () => {
    // 상세 페이지에서 현재 정보 가져오기
    const titleText = document.getElementById("detail-title").innerText;
    const qtyText = document.getElementById("detail-qty").innerText;
    const sizeText = document.getElementById("detail-size").innerText;
    const priceText = document.getElementById("detail-price").innerText.replace(/[^0-9]/g, '');

    const item = {
        name: titleText,
        qty: qtyText,
        size: sizeText,
        price: priceText
    };

    // 장바구니에 저장
    let cart = JSON.parse(localStorage.getItem('myCart') || '[]');
    cart.push(item);
    localStorage.setItem('myCart', JSON.stringify(cart));

    // 알림 후 팝업 열기
    alert("장바구니에 담겼습니다.");
    window.open('cart1.html', 'cartWindow', 'width=470,height=460');
});




// window 객체에 함수를 등록하면 HTML에서 직접 호출 가능합니다. 카드
window.handleCardPay = function() {
    const priceEl = document.getElementById("detail-price");
    if (!priceEl) {
        alert("결제 정보를 찾을 수 없습니다.");
        return;
    }

    const priceValue = priceEl.innerText.replace(/[^0-9]/g, ''); 

    if (!priceValue || parseInt(priceValue) === 0) {
        alert("결제할 금액이 없습니다.");
        return;
    }

    // 811x649 크기의 새 창으로 열기 (top, left는 화면 중앙 근처에 띄우는 옵션입니다)
    const url = `https://sowonnamoo.github.io/myjs/payment?price=${priceValue}`;
    const options = "width=811,height=649,scrollbars=yes,resizable=yes";
    
    window.open(url, 'paymentWindow', options);
};


window.handleBankPay = function() {
    const priceEl = document.getElementById("detail-price");
    if (!priceEl) {
        alert("결제 정보를 찾을 수 없습니다.");
        return;
    }

    const priceValue = priceEl.innerText.replace(/[^0-9]/g, ''); 

    if (!priceValue || parseInt(priceValue) === 0) {
        alert("결제할 금액이 없습니다.");
        return;
    }

    // 무통장입금 안내 페이지로 이동 (494x639 크기)
    const url = `https://sowonnamoo.github.io/myboard/mooto?price=${priceValue}`;
    const options = "width=494,height=639,scrollbars=yes,resizable=yes";
    
    window.open(url, 'bankPaymentWindow', options);
};


// 견적서 및 거래명세서 출력 호출 함수
window.openDoc = function(filename, type) {
    // 1. 상세 화면의 데이터를 가져옵니다. 
    // (id 값들은 현재 사용 중인 상세 보기 HTML의 id와 일치해야 합니다.)
    const product = document.getElementById('detail-title')?.innerText || '';
    const size = document.getElementById('detail-size')?.innerText || '';
    const qty = document.getElementById('detail-qty')?.innerText || '0';
    const priceText = document.getElementById('detail-price')?.innerText || '0';
    
    // 가격에서 숫자만 추출 (예: 50,000원 -> 50000)
    const price = priceText.replace(/[^0-9]/g, '');

    // 2. URL 파라미터로 데이터를 넘깁니다.
    const url = `${filename}?product=${encodeURIComponent(product)}&size=${encodeURIComponent(size)}&qty=${encodeURIComponent(qty)}&price=${encodeURIComponent(price)}`;
    
    // 3. 새 창으로 열기 (인쇄용 페이지)
    window.open(url, '_blank', 'width=850,height=950');
};


/**
 * 간이영수증 팝업 호출 함수
 * 이 함수를 app.js 하단에 추가하세요.
 */
window.openReceipt = function() {
    // 1. 게시판 상세 영역에서 데이터 가져오기 (ID 확인 필요)
    const product = document.getElementById('detail-title')?.innerText || '';
    const size = document.getElementById('detail-size')?.innerText || '';
    const qty = document.getElementById('detail-qty')?.innerText || '1';
    
    // 금액에서 숫자만 추출 (콤마 등 제거)
    const priceRaw = document.getElementById('detail-price')?.innerText || '0';
    const price = priceRaw.replace(/[^0-9]/g, ''); 
    
    // 작성일 가져오기
    const date = document.getElementById('detail-date')?.innerText || ''; 

    // 2. 업태 및 종목 데이터 (고정값이면 아래와 같이 직접 입력, 아니면 위처럼 id에서 가져오기)
    const bizType = '기술서비스'; 
    const bizItem = '광고, 대행';

    // 3. URL 생성 및 팝업창 띄우기
    const url = `print3.html?product=${encodeURIComponent(product)}` +
                `&size=${encodeURIComponent(size)}` +
                `&qty=${encodeURIComponent(qty)}` +
                `&price=${encodeURIComponent(price)}` +
                `&date=${encodeURIComponent(date)}` +
                `&bizType=${encodeURIComponent(bizType)}` +
                `&bizItem=${encodeURIComponent(bizItem)}`;

    // 9cm x 20cm 비율에 맞춘 팝업 크기 설정
    window.open(url, '_blank', 'width=400,height=800,scrollbars=yes');
};

    // 7. 세금계산서
window.openLink = function(url) {
    const width = 501;
    const height = 765;
    // 화면 중앙에 위치하도록 계산
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    
    window.open(url, '_blank', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`);
};


    // 8. 카드영수증
window.openCardPage = () => {
    // 1. 상세 페이지의 날짜 텍스트를 가져옵니다 (예: "작성일: 2026년 6월 12일")
    const dateText = document.getElementById("detail-date").innerText;
    
    // 2. 텍스트에서 모든 숫자를 찾아 배열로 만듭니다 (결과: ["2026", "6", "12"])
    // 텍스트에 "작성일:" 같은 글자가 있어도 숫자만 골라냅니다.
    const matches = dateText.match(/\d+/g);
    
    let targetDate = '2026-01-01'; // 기본값
    if (matches && matches.length >= 3) {
        // 배열의 0, 1, 2번째 숫자를 사용 (년, 월, 일)
        const y = matches[0];
        const m = matches[1].padStart(2, '0');
        const d = matches[2].padStart(2, '0');
        targetDate = `${y}-${m}-${d}`;
    }

    // 나머지 데이터 가져오기
    const product = document.getElementById("detail-title").innerText;
    const qty = document.getElementById("detail-qty").innerText;
    const size = document.getElementById("detail-size").innerText;
    const price = document.getElementById("detail-price").innerText.replace(/[^0-9]/g, '');

    // 3. URL 생성 (작성일이 반영됨)
    const url = `cardf.html?date=${targetDate}&name=${encodeURIComponent(product)}&size=${encodeURIComponent(size)}&qty=${qty}&price=${price}`;
    
    window.open(url, '_blank', 'width=500,height=700');
};

// 기존 syncStatusOverlay 함수를 이 코드로 덮어쓰세요 (타이밍 보완)
window.syncStatusOverlay = function(status) {
    const targets = [
        { id: 'target-box-notice', imgId: 'img-1' },
        { id: 'target-btn-tax',    imgId: 'img-2' },
        { id: 'detail-edit-btn',   imgId: 'img-3' }
    ];

    // 1. 초기화: 일단 다 숨김
    targets.forEach(t => {
        const img = document.getElementById(t.imgId);
        if (img) img.classList.add('hidden');
    });

    // 2. 상태가 '카드결제'일 때만 실행
    if (status === '카드결제') {
        // 화면 렌더링 후 좌표를 잡기 위해 약간의 지연시간을 둠
        setTimeout(() => {
            targets.forEach(t => {
                const targetEl = document.getElementById(t.id);
                const imgEl = document.getElementById(t.imgId);
                
                if (targetEl && imgEl) {
                    const rect = targetEl.getBoundingClientRect();
                    imgEl.style.position = 'absolute';
                    imgEl.style.top = (rect.top + window.scrollY) + 'px';
                    imgEl.style.left = (rect.left + window.scrollX) + 'px';
                    imgEl.style.width = rect.width + 'px';
                    imgEl.style.height = rect.height + 'px';
                    imgEl.style.zIndex = '9999';
                    imgEl.classList.remove('hidden');
                }
            });
        }, 100); 
    }
};

// 앙카 png
window.syncStatusOverlay = function(status) {
    const isBank = (status === '무통장');
    const isCard = (status === '카드결제');

    // 1. 모든 이미지를 일단 화면에 박아둡니다 (상시 노출)
    const targets = [
        { btnId: 'anchor-text',    imgId: 'img-1', dx: -25, dy: -25 }, 
        { btnId: 'segum-btn-id',   imgId: 'img-2', dx: -8, dy: -10 }, // 평소엔 여기에 고정
        { btnId: 'detail-edit-btn', imgId: 'img-3', dx: -8, dy: -10 }
    ];

    // 2. 이미지가 결제 중일 때만 숨겨지도록 설정
    // 카드나 무통장이면 '결제완료 상태'이므로 이미지를 숨기고, 아니면 보여줍니다.
    const isPaid = (isCard || isBank);

    setTimeout(() => {
        targets.forEach(t => {
            const btn = document.getElementById(t.btnId);
            const img = document.getElementById(t.imgId);
            
            if (btn && img) {
                const rect = btn.getBoundingClientRect();
                
                img.style.position = 'absolute';
                img.style.top = (rect.top + window.scrollY + t.dy) + 'px';
                img.style.left = (rect.left + window.scrollX + t.dx) + 'px';
                img.style.zIndex = '9999';
                img.style.pointerEvents = 'auto'; // 항상 클릭 차단
                
                // [핵심] 결제완료 상태면 숨기고, 아니면 보이게 함
                if (isPaid) {
                    img.classList.add('hidden');
                } else {
                    img.classList.remove('hidden');
                }
            }
        });
    }, 150);
};
