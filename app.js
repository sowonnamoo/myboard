import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, increment, getDoc, updateDoc, writeBatch, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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



window.switchView = function(viewName) {
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-write").classList.add("hidden");
    document.getElementById("view-detail").classList.add("hidden");
    if (viewName === 'list') { document.getElementById("view-list").classList.remove("hidden"); loadAndRender(); }
    else if (viewName === 'write') { document.getElementById("view-write").classList.remove("hidden"); }
    else if (viewName === 'detail') { document.getElementById("view-detail").classList.remove("hidden"); }
}


// [R2 업로드 함수] 업로드
async function uploadToR2(fileInputId, authorName) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || fileInput.files.length === 0) return null;

    const file = fileInput.files[0];
    const fileName = `${authorName || "user"}_${Date.now()}_${file.name}`;
    
    // [중요] 여기를 본인의 Workers & Pages 대시보드 상단에 있는 
    // "https://이름.아이디.workers.dev" 주소로 바꾸세요!
    const WORKER_URL = "https://r2.ecogr.workers.dev/"; 

    const response = await fetch(`${WORKER_URL}?name=${encodeURIComponent(fileName)}`, {
        method: "PUT",
        body: file
    });

    if (!response.ok) {
        throw new Error("업로드 실패: " + response.statusText);
    }

    const result = await response.json();
    return result.url;
}

async function loadAndRender() {
    try {
        // 최근 20개만 불러오도록 limit(20) 추가 쿼리아끼기
        const q = query(ordersCollection, orderBy("createdAt", "desc"), limit(20)); 
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
    
    if(data.file1Url) {
        const a = document.createElement('a');
        a.innerText = "📁 첨부파일 1 (다운로드)";
        a.className = "block text-xs text-blue-600 hover:underline cursor-pointer";
        a.onclick = () => window.downloadFile(data.file1Url, "file1_download.png");
        filesDiv.appendChild(a);
    }
    if(data.file2Url) {
        const a = document.createElement('a');
        a.innerText = "📁 첨부파일 2 (다운로드)";
        a.className = "block text-xs text-blue-600 hover:underline cursor-pointer";
        a.onclick = () => window.downloadFile(data.file2Url, "file2_download.png");
        filesDiv.appendChild(a);
    }

    // 삭제 버튼 설정
    document.getElementById("detail-delete-btn").onclick = async () => { 
        if(confirm("삭제하시겠습니까?")) { 
            try { 
                await updateDoc(doc(db, "boards", currentViewId), { isDeleted: true, deletedAt: new Date() }); 
                alert("삭제되었습니다."); 
                switchView('list'); 
            } catch (e) { 
                alert("삭제 실패: " + e.message); 
            }
        } 
    };

    // 상세화면으로 전환
    switchView('detail');

}); // <--- 이것이 modal-confirm-btn의 click 이벤트 리스너를 닫는 괄호입니다.

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
    // 1. 파일 업로드 실행
    const file1Url = await uploadToR2("file-1", document.getElementById('input-author').value);
    const file2Url = await uploadToR2("file-2", document.getElementById('input-author').value);
        
    // 2. 파이어베이스에 모든 정보 저장 (누락 없이 합침)
  await addDoc(collection(db, "boards"), { 
    author: document.getElementById('input-author').value,
    productName: document.getElementById('product-name').value,
    quantity: document.getElementById('quantity').value,
    size: document.getElementById('size').value,
    phone: document.getElementById('phone').value,
    price: document.getElementById('price').value,
    address: document.getElementById('address').value + " " + document.getElementById('address-detail').value,
    password: document.getElementById('phone').value.slice(-4),
    message: document.getElementById('message').value,
    file1Url: file1Url, // 아까 위에서 선언한 변수 그대로 사용
    file2Url: file2Url, // 아까 위에서 선언한 변수 그대로 사용
    views: 0,
    createdAt: new Date(),
    isDeleted: false,
    status: '대기'
    });

    alert("접수되었습니다.");
    switchView('list');
} catch (e) {
    console.error(e);
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



// 카결창 끝나면 자동 부모값이전
window.addEventListener('load', () => {
    // 1. 현재 로드된 주문 데이터에서 status를 가져옵니다 (예: 전역변수나 DOM에서 추출)
    // 예시: const currentStatus = document.getElementById('status-hidden').value;
    
    // 2. 만약 데이터를 불러온 상태라면 즉시 갱신
    if (typeof currentStatus !== 'undefined') {
        syncStatusOverlay(currentStatus);
    }
});

// 혹시 모를 상황 대비: 창 활성화 시에도 체크
window.onfocus = () => {
    // 상세 페이지라면 데이터를 다시 불러오는 함수를 여기에 넣으세요
    // 예: fetchAndRenderDetail(); 
    console.log("창 복귀 - 데이터 재확인 중");
};



// 카드결제 결제 완료 후 부모창 상태 업데이트 로직 (app.js 하단)
window.addEventListener("message", async (event) => {
    if (event.data && event.data.type === 'PAYMENT_SUCCESS') {
        const paidPrice = event.data.price;

        // 1. 현재 상세 페이지에 떠 있는 주문 정보를 가져옵니다.
        const docRef = doc(db, "boards", currentViewId);
        const snap = await getDoc(docRef);
        
        if (!snap.exists()) return;

        const data = snap.data();

        // 2. [핵심] 상태가 '대기'이고 금액이 일치할 때만 업데이트!
        if (data.status === '대기' && data.price === paidPrice) {
            
            // DB 상태 변경
            await updateDoc(docRef, {
                status: '카드결제'
            });

            alert("결제가 정상적으로 확인되었습니다.");
            
            // 3. 화면 상태 즉시 갱신 (이미지 변경)
            // 상세 정보를 다시 불러와서 status 필드가 '카드결제'로 바뀐 것을 반영합니다.
            window.syncStatusOverlay('카드결제');
            
            // viewDetail을 다시 호출하면 DB에서 바뀐 status를 다시 읽어와 화면을 갱신합니다.
            // (만약 팝업 닫기나 화면 리로드가 필요하면 여기서 처리하세요)
            location.reload(); 
        } else if (data.status !== '대기') {
            console.log("이미 처리된 주문입니다.");
        } else {
            console.log("금액이 일치하지 않습니다.");
        }
    }
});






// 앙카 png 주문내용 강제 링크 막음소스
window.syncStatusOverlay = function(status) {
    const isBank = (status === '무통장');
    const isCard = (status === '카드결제');
    const isWaiting = (status === '대기');

    const positionImage = (btnId, imgId, dx, dy) => {
        const btn = document.getElementById(btnId);
        const img = document.getElementById(imgId);
        
        if (!btn || !img) return false;

        const rect = btn.getBoundingClientRect();
        if (rect.top === 0 && rect.left === 0) return false;

        img.style.position = 'absolute';
        img.style.top = (rect.top + window.scrollY + dy) + 'px';
        img.style.left = (rect.left + window.scrollX + dx) + 'px';
        img.style.display = 'block'; 
        img.style.zIndex = '9999';
        img.style.pointerEvents = 'auto'; // 버튼 클릭 차단 (링크 막음)
        
        return true;
    };

    const updatePositions = () => {
        // 1. 모든 이미지 숨김
        ['img-1', 'img-2', 'img-3'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });

        // 2. 상태별 배치
        if (isWaiting) {
            // 대기일 때는 '세금계산서 버튼(segum-btn-id)' 위에 'img-3'을 띄움
            positionImage('segum-btn-id', 'img-3', -8, -10);
        } else if (isCard || isBank) {
            // 결제 완료일 때는 3개 이미지 모두 표시
            positionImage('anchor-text', 'img-1', -25, -25);
            positionImage(isBank ? 'card-receipt-btn' : 'segum-btn-id', 'img-2', -8, -10);
            positionImage('detail-edit-btn', 'img-3', -8, -10);
        }
    };

    updatePositions();
    
    // 렌더링 지연 대비 반복 체크
    let checkTimes = [100, 300, 600, 1000];
    checkTimes.forEach(time => setTimeout(updatePositions, time));

    window.removeEventListener('resize', updatePositions);
    window.addEventListener('resize', updatePositions);
};



// [추가] 페이지 로드 시 데이터를 딱 한 번만 불러오게 설정 용량 아끼기
let isLoaded = false;
function initBoard() {
    if (isLoaded) return;
    loadAndRender(); // 여기서 데이터를 처음으로 불러옴
    isLoaded = true;
}

// 페이지가 다 로드되면 실행
initBoard();

// 맨 하단 이벤트 리스너들을 이렇게 하나로 합치세요
window.addEventListener('DOMContentLoaded', () => {
    // 1. 기존 데이터 로드 실행
    initBoard();

    // 2. 쿼리스트링 상품 정보 처리
    const params = new URLSearchParams(window.location.search);
    if (params.has('product')) {
        const prodInput = document.getElementById('product-name');
        const qtyInput = document.getElementById('quantity');
        const sizeInput = document.getElementById('size');
        const priceInput = document.getElementById('price');
        
        prodInput.value = params.get('product');
        qtyInput.value = params.get('qty');
        sizeInput.value = params.get('size');
        priceInput.value = params.get('price');
        
        [prodInput, qtyInput, sizeInput, priceInput].forEach(el => {
            el.readOnly = true;
            el.style.backgroundColor = "#f3f4f6";
            el.style.cursor = "not-allowed";
        });
        
        switchView('write');
    }
});


// 파일 다운로드 강제 실행 함수
window.downloadFile = async (url, filename) => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
    } catch (e) {
        alert("다운로드 중 오류가 발생했습니다.");
        console.error(e);
    }
};



