import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, getDoc, setDoc, updateDoc, writeBatch, limit, startAfter, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
const ordersCollection = collection(db, "boards");

// ---- 개인정보 조회키(secretId) 계산 ----
// boardId + 작성자명 + 전화번호 뒷4자리를 합쳐 SHA-256 해싱한 값을 문서 ID로 씁니다.
// 이 값을 "정확히" 계산해낼 수 있는 사람(=이름+뒷4자리를 아는 사람)만
// boards/{boardId}/private/{secretId} 문서를 조회할 수 있습니다.
// (브라우저 내장 crypto.subtle 사용 - 별도 라이브러리/서버 불필요, 완전 무료)
async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
// 작성 시/조회 시 항상 같은 방식으로 정규화해야 같은 secretId가 나옵니다.
function normalizeName(name) {
    return String(name || "").trim();
}
function normalizePhoneLast4(phone) {
    return String(phone || "").replace(/[^0-9]/g, "").slice(-4);
}
async function computeSecretId(boardId, author, phone) {
    const key = `${boardId}::${normalizeName(author)}::${normalizePhoneLast4(phone)}`;
    return sha256Hex(key);
}

// ---- 세금계산서(segum.html) 등록 여부 확인용 ID 계산 ----
// segum.html과 반드시 동일한 방식(전체 전화번호 사용, 뒷4자리 아님)이어야 합니다.
function normalizePhoneFull(phone) {
    return String(phone || "").replace(/[^0-9]/g, "");
}
async function computeSegumId(name, phone) {
    return sha256Hex(`segum::${normalizeName(name)}::${normalizePhoneFull(phone)}`);
}

// ---- 방문자마다 파이어베이스 익명 로그인을 자동으로 부여 ----
// 회원가입/로그인 절차 없이, 방문자가 글을 쓰거나 자기 글을 수정/삭제하려 할 때
// 백그라운드에서 조용히 익명 로그인을 해서 고유 uid를 발급받습니다.
// 이 uid는 글 작성 시 문서에 같이 저장되고(uid 필드), Firestore 규칙에서
// "글쓴이 본인(uid가 일치하는 사람)만 수정/삭제 가능"을 검사하는 근거로 쓰입니다.
const auth = getAuth(app);

let resolveAuthReady;
const authReadyPromise = new Promise((resolve) => { resolveAuthReady = resolve; });

onAuthStateChanged(auth, (user) => {
    if (user) {
        resolveAuthReady(user);
    } else {
        signInAnonymously(auth).catch((e) => {
            console.error("익명 로그인 실패:", e);
        });
    }
});

// 익명 로그인이 끝날 때까지(=uid가 확정될 때까지) 기다립니다.
function ensureAnonymousLogin() {
    return authReadyPromise;
}

window.execDaumPostcode = function() {
    new daum.Postcode({
        oncomplete: function(data) {
            document.getElementById("address").value = data.address;
            document.getElementById("address-detail").focus();
            // 주소가 바뀌면(특히 제주/울릉 등 착불 대상 여부가 바뀔 수 있으므로)
            // 장바구니 합계·배송비 표시를 다시 계산합니다.
            renderCombinedCartOrder();
        }
    }).open();
}

let allOrders = [];        
let filteredOrders = [];  
let lastVisible = null; // 마지막 문서 저장용
let hasMoreOrders = true; // Firestore에 더 가져올 문서가 남아있는지 여부
let currentPage = 1;      
let currentViewId = null;
let currentViewAuthor = null; // 현금영수증 신청 시 세금계산서 등록 여부를 확인하는 데 사용
let currentViewPhone = null;
let currentDetailStatus = null; // 현재 상세보기 중인 주문의 접수상태('대기'/'카드결제'/'무통장'/'접수에러' 등)
let currentFile1Url = null;     // 파일교체 시 화면을 즉시 갱신하기 위해 따로 보관
let currentFile2Url = null;
const POSTS_PER_PAGE = 6; 

// ---- 장바구니(01my.html 등에서 담은 여러 상품) 통합 주문작성 ----
// 이 기능은 index1.html에만 있는 #cart-summary-card 요소가 있을 때만 동작합니다.
// index.html에는 이 요소 자체가 없으므로, pendingCartOrders에 값이 남아있더라도
// index.html 쪽 동작(목록 우선 표시 등)에는 절대 영향을 주지 않습니다.
const CART_QUEUE_KEY = 'pendingCartOrders'; // 기존 '장바구니담기'(myCart) 기능과는 별개의 키
// 배송비 계산은 shipping.js의 calculateShippingFee()가 담당합니다.
// (묶음배송 가능 품목/무게 구간별 요금표는 전부 shipping.js에서만 관리하면 됩니다)

// (참고: 예전에는 index1.html 쪽에서 localStorage 신호로 이전 창을 스스로 닫게 하는 방식으로
//  중복 팝업을 막았지만, 지금은 01my.html의 window.open()이 고정된 창 이름("orderCartWindow")을
//  사용해서 브라우저가 알아서 같은 창을 재사용하므로 더 이상 필요 없어 제거했습니다.)

// item의 상품명을 구합니다. productName(또는 name)이 없으면 01my.html이 실제로 보내는
// options 객체(예: {"options1":"명함","options3":"파일접수 (ai, eps, pdf)"})의 값들을 합쳐서 대신 사용합니다.
function getItemProductName(item) {
    if (item.productName) return item.productName;
    if (item.name) return item.name;
    if (item.options && typeof item.options === 'object') {
        const optionValues = Object.values(item.options).filter(Boolean);
        if (optionValues.length) return optionValues.join(' / ');
    }
    if (item.optionsText) return item.optionsText;
    return '상품';
}

// item에 담긴 후가공 + 그 외 추가 선택옵션들을 하나의 문자열로 합칩니다.
function buildExtraOptionsText(item) {
    // productName/name이 없어서 options 값을 이미 상품명으로 대신 썼다면,
    // 여기서 또 넣으면 "명함 파일접수(...) / 명함 파일접수(...)" 처럼 중복되므로 건너뜁니다.
    const optionsAlreadyUsedAsName = !item.productName && !item.name
        && item.options && typeof item.options === 'object'
        && Object.values(item.options).filter(Boolean).length > 0;

    const parts = [];
    if (item.finishings) parts.push(item.finishings);
    if (!optionsAlreadyUsedAsName) {
        if (item.options && typeof item.options === 'object') {
            const optionValues = Object.values(item.options).filter(Boolean);
            if (optionValues.length) parts.push(optionValues.join(', '));
        } else if (item.optionsText) {
            parts.push(item.optionsText);
        }
    }
    return parts.join(', ');
}

// item의 options/finishings 원문을 전부 모읍니다 (상품명으로 이미 쓰였는지 여부와 무관하게).
// 파일 확장자 제한처럼, productName에 옵션이 녹아들어갔더라도 놓치면 안 되는 정보를 찾을 때 씁니다.
function getItemRawOptionsText(item) {
    const parts = [];
    if (item.finishings) parts.push(item.finishings);
    if (item.options && typeof item.options === 'object') {
        const optionValues = Object.values(item.options).filter(Boolean);
        if (optionValues.length) parts.push(optionValues.join(', '));
    } else if (item.optionsText) {
        parts.push(item.optionsText);
    }
    return parts.join(', ');
}

// 옵션/후가공 텍스트에서 "(ai, eps, pdf)" 같은 괄호 안 파일 확장자 목록을 찾아 배열로 반환합니다.
// 예: "파일접수 (ai, eps)" -> ["ai", "eps"]. 없으면 null.
function extractAllowedFileExtensions(text) {
    if (!text) return null;
    const match = String(text).match(/\(([a-zA-Z0-9,\s.]+)\)/);
    if (!match) return null;
    const exts = match[1]
        .split(',')
        .map(s => s.trim().toLowerCase().replace(/^\./, ''))
        .filter(s => /^[a-z0-9]{1,6}$/.test(s)); // 확장자처럼 생긴 것만 (너무 길거나 이상한 값 제외)
    return exts.length ? exts : null;
}

// file-1 / file-2 입력란에 허용 확장자를 적용(또는 해제)합니다.
function applyFileAcceptRestriction(allowedExts) {
    const file1 = document.getElementById('file-1');
    const file2 = document.getElementById('file-2');
    const hint = document.getElementById('file-accept-hint');

    [file1, file2].forEach(input => {
        if (!input) return;
        if (allowedExts && allowedExts.length) {
            input.setAttribute('accept', allowedExts.map(e => `.${e}`).join(','));
            input.dataset.allowedExts = allowedExts.join(',');
        } else {
            input.removeAttribute('accept');
            delete input.dataset.allowedExts;
        }
    });

    if (hint) {
        if (allowedExts && allowedExts.length) {
            hint.textContent = `※ 이 상품은 ${allowedExts.map(e => '.' + e).join(', ')} 파일만 첨부 가능합니다.`;
            hint.classList.remove('hidden');
        } else {
            hint.textContent = '';
            hint.classList.add('hidden');
        }
    }
}

// file-2(뒷면첨부)를 장바구니 상품 내용에 따라 활성화/비활성화합니다.
// "양면"이라는 글자가 포함된 상품이 하나라도 있으면 활성화, 아니면(장바구니가 비어있어도) 비활성화합니다.
// file-2(뒷면첨부)를 장바구니 상품 내용에 따라 활성화/비활성화합니다.
// "양면"이라는 글자가 포함된 상품이 하나라도 있으면 표시(활성화), 아니면 아예 화면에서 숨깁니다(블라인드).
// 단, 간편구입(isSimpleMode)으로 들어온 경우엔 "양면" 여부와 상관없이 항상 켜고,
// 라벨도 "뒷면첨부"가 아니라 "파일첨부2"로 표시합니다.
function applyFileTwoAvailability(enabled, isSimpleMode) {
    const file2 = document.getElementById('file-2');
    const wrap = document.getElementById('file-2-wrap');
    if (!file2) return;

    if (isSimpleMode) {
        enabled = true;
    }

    file2.disabled = !enabled;
    if (!enabled) {
        file2.value = ''; // 비활성화 시 혹시 선택되어 있던 파일은 비워줍니다.
    }

    if (wrap) {
        wrap.classList.toggle('hidden', !enabled); // 흐리게 대신 아예 숨김 처리

        const label = wrap.querySelector('span');
        if (label) {
            label.textContent = isSimpleMode ? '파일첨부2' : '뒷면첨부';
        }
    }
}

// file-1 / file-2에서 파일을 고를 때, 허용된 확장자가 아니면 선택을 취소합니다.
// (accept 속성은 파일 선택창에서 필터로만 동작하고 "전체 파일"로 우회 선택이 가능해서, 실제 첨부 단계에서 한 번 더 막습니다)
function setupFileExtensionGuard() {
    ['file-1', 'file-2'].forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('change', () => {
            const allowedExts = input.dataset.allowedExts ? input.dataset.allowedExts.split(',') : null;
            if (!allowedExts || !allowedExts.length) return;
            const file = input.files[0];
            if (!file) return;
            const ext = file.name.split('.').pop().toLowerCase();
            if (!allowedExts.includes(ext)) {
                alert(`이 상품은 ${allowedExts.map(e => '.' + e).join(', ')} 파일만 첨부할 수 있습니다.\n선택한 파일(.${ext})은 첨부할 수 없어 선택이 취소됩니다.`);
                input.value = '';
            }
        });
    });
}

// 장바구니에 담긴 여러 상품을 하나의 주문으로 합쳐 "담긴 상품" 카드 + 폼에 채워 넣습니다.
function renderCombinedCartOrder() {
    const summaryCard = document.getElementById('cart-summary-card');
    if (!summaryCard) return; // index1.html이 아니면 여기서 조용히 종료

    let cart = [];
    try {
        cart = JSON.parse(localStorage.getItem(CART_QUEUE_KEY) || '[]');
    } catch (e) {
        cart = [];
    }

    const totalLine = document.getElementById('cart-total-line');
    const prodInput = document.getElementById('product-name');
    const qtyInput = document.getElementById('quantity');
    const sizeInput = document.getElementById('size');
    const priceInput = document.getElementById('price');

    if (!Array.isArray(cart) || cart.length === 0) {
        // 장바구니가 비어있으면(또는 전부 삭제됐으면) 카드/합계 숨기고, 폼은 직접 입력 가능하도록 초기화
        summaryCard.classList.add('hidden');
        if (totalLine) totalLine.classList.add('hidden');
        applyFileAcceptRestriction(null); // 파일 확장자 제한도 해제
        applyFileTwoAvailability(false, false); // 장바구니가 비어있으면 뒷면첨부(file-2)도 비활성화

        [prodInput, qtyInput, sizeInput, priceInput].forEach(el => {
            if (!el) return;
            // 장바구니에서 채워졌던(readOnly) 값만 비웁니다.
            // 사용자가 직접 입력한 값(readOnly=false)은 주소찾기 등으로 이 함수가
            // 다시 호출되더라도 절대 지우지 않습니다.
            if (el.readOnly) {
                el.value = '';
            }
            el.readOnly = false;
            el.style.backgroundColor = '';
            el.style.cursor = '';
        });
        return;
    }

    // 이 장바구니가 전부 cart.html "간편구입" 버튼(Order_option 값)에서 온 상품인지 판별.
    // (이 경우에만 상단 장바구니 카드/배송비 로직을 건너뜁니다. 01my.html에서 온 상품이 섞여있으면
    //  평소대로 동작합니다.)
    const isSimpleMode = cart.length > 0 && cart.every(it => it.simpleMode === true);

    // ---- "담긴 상품" 카드 렌더링 (개별 삭제 버튼 포함) ----
    const itemsContainer = document.getElementById('cart-summary-items');
    itemsContainer.innerHTML = '';
    let subtotal = 0;

    cart.forEach((item, idx) => {
        const priceNum = parseInt(String(item.price).replace(/[^0-9]/g, ''), 10) || 0;
        subtotal += priceNum;

        const sizeText = (item.width && item.height) ? `${item.width} x ${item.height}mm` : (item.size || '');
        const weightText = (item.weight !== undefined && item.weight !== '' && item.weight !== null) ? `무게: 약 ${item.weight}kg` : '';

        const row = document.createElement('div');
        row.className = 'cart-summary-row';

        const info = document.createElement('div');
        const metaLine = [sizeText, weightText].filter(Boolean).join(' / ');
        info.innerHTML = `
            <div class="cart-summary-no">No.${String(idx + 1).padStart(2, '0')}</div>
            <div class="cart-summary-name">${getItemProductName(item)}</div>
            <div class="cart-summary-sub">${metaLine}${metaLine ? ' · ' : ''}<span class="cart-summary-price-inline">${priceNum.toLocaleString()}원</span></div>
        `;

        const right = document.createElement('div');
        right.className = 'cart-summary-right';

        const qtyEl = document.createElement('div');
        qtyEl.className = 'cart-summary-qty';
        qtyEl.textContent = `${item.qty || ''}건`;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'cart-summary-remove';
        removeBtn.textContent = '삭제';
        removeBtn.addEventListener('click', () => removePendingCartItem(idx));

        right.appendChild(qtyEl);
        right.appendChild(removeBtn);

        row.appendChild(info);
        row.appendChild(right);
        itemsContainer.appendChild(row);
    });

    if (isSimpleMode) {
        // 간편구입으로 들어온 경우: 상단 장바구니 카드는 계속 숨김
        summaryCard.classList.add('hidden');
    } else {
        summaryCard.classList.remove('hidden');
    }

    // shipping.js의 calculateShippingFee()로 묶음배송 여부 + 무게 구간을 반영해 배송비 계산
    // (주소에 제주/울릉이 포함되면 shipping.js가 착불배송으로 판단해 배송비를 0으로 돌려줌)
    // 단, 간편구입(simpleMode)인 경우엔 배송비 로직을 적용하지 않고 입력된 결제금액을 그대로 총 결제액으로 씁니다.
    const addressForShipping = (document.getElementById('address')?.value || '')
        + ' ' + (document.getElementById('address-detail')?.value || '');
    const shippingResult = isSimpleMode
        ? { totalFee: 0, breakdown: [], cashOnDelivery: false }
        : ((typeof calculateShippingFee === 'function')
            ? calculateShippingFee(cart, addressForShipping)
            : { totalFee: 0, breakdown: [], cashOnDelivery: false });
    const shippingFee = shippingResult.totalFee;
    const total = subtotal + shippingFee;

    if (totalLine) {
        if (isSimpleMode) {
            // 간편구입인 경우엔 상단 합계 라인도 함께 숨김
            totalLine.classList.add('hidden');
        } else if (shippingResult.cashOnDelivery) {
            // 제주/울릉 등 도서산간: 배송비를 미리 청구하지 않고, 상품 도착 시 택배기사에게 별도 지불
            totalLine.textContent = `${subtotal}원 + 배송비 착불(도서산간) 총결제액 : ${total}원 (배송비는 상품 도착 시 별도 결제)`;
            totalLine.classList.remove('hidden');
        } else {
            let shippingText = `배송비 ${shippingFee}`;
            if (shippingResult.breakdown.length > 1) {
                // 묶음배송으로 여러 건으로 나뉜 경우 상세 내역도 함께 표시
                const detail = shippingResult.breakdown.map(b => `${b.label} ${b.fee}원`).join(' + ');
                shippingText = `배송비 ${shippingFee}(${detail})`;
            }
            totalLine.textContent = `${subtotal}원 + ${shippingText} 총결제액 : ${total}원`;
            totalLine.classList.remove('hidden');
        }
    }

    // ---- 폼 필드: 여러 상품 값을 "/"로 구획해서 하나로 합쳐 넣기 ----
    const names = cart.map(it => getItemProductName(it));
    const qtys = cart.map(it => `${it.qty || ''}건`);
    const sizes = cart.map(it => (it.width && it.height) ? `${it.width} x ${it.height}mm` : (it.size || ''));
    const extras = cart.map(it => buildExtraOptionsText(it));

    // 옵션/후가공 텍스트("파일접수 (ai, eps, pdf)" 등)에서 허용 확장자를 찾아 파일첨부에 적용
    // (productName에 옵션이 이미 녹아든 경우까지 놓치지 않도록 원문 옵션 텍스트를 따로 모아서 검사)
    const allowedExts = extractAllowedFileExtensions(cart.map(it => getItemRawOptionsText(it)).join(' '));
    applyFileAcceptRestriction(allowedExts);

    // 장바구니 상품명/옵션 텍스트 중 "양면"이 포함된 상품이 있으면 뒷면첨부(file-2)를 활성화합니다.
    const cartText = names.join(' ') + ' ' + cart.map(it => getItemRawOptionsText(it)).join(' ');
    applyFileTwoAvailability(cartText.includes('양면'), isSimpleMode);

    prodInput.value = names.join(' / ');
    qtyInput.value = qtys.join(' / ');
    sizeInput.value = extras.some(Boolean)
        ? `${sizes.join(' / ')} (후가공: ${extras.join(' / ')})`
        : sizes.join(' / ');
    priceInput.value = `${total}원`;

    [prodInput, qtyInput, sizeInput, priceInput].forEach(el => {
        el.readOnly = true;
        el.style.backgroundColor = "#f3f4f6";
        el.style.cursor = "not-allowed";
    });

    switchView('write');
}

// 상품 하나를 장바구니(pendingCartOrders)에 추가합니다. (렌더링은 호출하는 쪽에서 필요할 때 처리)
function addItemToCart(item) {
    let cart = [];
    try {
        cart = JSON.parse(localStorage.getItem(CART_QUEUE_KEY) || '[]');
    } catch (e) {
        cart = [];
    }
    if (!Array.isArray(cart)) cart = [];
    cart.push(item);
    localStorage.setItem(CART_QUEUE_KEY, JSON.stringify(cart));
    return cart;
}

// 간편구입(simpleMode)으로 상품을 다 받은 뒤 호출됩니다.
// 이 창을 닫거나(새창 닫기), 뒤로가기, 새로고침 등으로 페이지를 벗어나는 순간
// 장바구니(pendingCartOrders)에 담긴 상품을 전부 지웁니다.
// (한 번만 등록되도록 플래그로 중복 등록을 막습니다)
let __simpleModeAutoClearBound = false;
function setupSimpleModeAutoClear() {
    if (__simpleModeAutoClearBound) return;
    __simpleModeAutoClearBound = true;

    const clearSimpleCart = () => {
        localStorage.removeItem(CART_QUEUE_KEY);
    };

    // pagehide: 새로고침/뒤로가기/앞으로가기/탭·창 닫기를 폭넓게 커버 (모바일 bfcache 포함)
    window.addEventListener('pagehide', clearSimpleCart);
    // beforeunload: 구형 브라우저 호환용 보조 수단
    window.addEventListener('beforeunload', clearSimpleCart);
}

// "담긴 상품" 카드에서 개별 상품 삭제 → 저장 후 다시 렌더링
// 마지막 상품까지 다 지워서 장바구니가 완전히 비면, 빈 글쓰기 창을 보여주는 대신 창을 자동으로 닫습니다.
function removePendingCartItem(idx) {
    let cart = [];
    try {
        cart = JSON.parse(localStorage.getItem(CART_QUEUE_KEY) || '[]');
    } catch (e) {
        cart = [];
    }
    cart.splice(idx, 1);
    localStorage.setItem(CART_QUEUE_KEY, JSON.stringify(cart));

    if (cart.length === 0) {
        // 01my.html이 window.open(..., "orderCartWindow", ...)으로 연 창이라 스스로 닫을 수 있습니다.
        // (사용자가 이 페이지를 직접 새 탭으로 연 경우라면 브라우저 정책상 닫히지 않고 무시됩니다)
        window.close();
        return;
    }

    renderCombinedCartOrder();
}



window.switchView = function(viewName) {
    document.getElementById("view-list").classList.add("hidden");
    document.getElementById("view-write").classList.add("hidden");
    document.getElementById("view-detail").classList.add("hidden");
    if (viewName === 'list') { document.getElementById("view-list").classList.remove("hidden"); loadAndRender(); }
    else if (viewName === 'write') { document.getElementById("view-write").classList.remove("hidden"); }
    else if (viewName === 'detail') { document.getElementById("view-detail").classList.remove("hidden"); }
}



// 비밀글
window.viewDetail = function(id) {
    currentViewId = id;
    document.getElementById("password-modal").classList.remove("hidden");
    const nameInput = document.getElementById("modal-name-input");
    const pwdInput = document.getElementById("modal-password-input");
    if (nameInput) nameInput.value = "";
    pwdInput.value = "";
    (nameInput || pwdInput).focus();
};
























// 상세보기의 첨부파일 목록을 그려줍니다.
// 접수상태가 '대기'일 때만 각 파일 옆에 '파일교체' 버튼을 함께 보여주고,
// 다른 상태(카드결제/무통장/접수에러 등)로 바뀌면 교체버튼은 자동으로 사라집니다.
function renderDetailFiles() {
    const filesDiv = document.getElementById("detail-files");
    if (!filesDiv) return;
    filesDiv.innerHTML = "";

    const isWaitingStatus = currentDetailStatus === '대기';

    const buildRow = (url, label, slot) => {
        const row = document.createElement('div');
        row.className = "flex items-center gap-2 mb-1";

        const a = document.createElement('a');
        // 이모지를 회색으로 만들기 위해 grayscale 필터 클래스 추가
        a.innerHTML = `<span class="grayscale inline-block mr-1">📁</span>${label} (다운로드)`;
        a.className = "text-xs text-blue-600 hover:underline cursor-pointer";
        a.onclick = () => window.downloadFile(url, `${slot === 1 ? 'file1' : 'file2'}_download.png`);
        row.appendChild(a);

        if (isWaitingStatus) {
            const replaceBtn = document.createElement('button');
            replaceBtn.type = 'button';
            replaceBtn.textContent = '파일교체';
            replaceBtn.className = "text-xs text-orange-600 border border-orange-300 rounded px-1.5 py-0.5 hover:bg-orange-50";
            replaceBtn.onclick = () => window.triggerFileReplace(slot);
            row.appendChild(replaceBtn);
        }

        filesDiv.appendChild(row);
    };

    if (currentFile1Url) buildRow(currentFile1Url, '첨부파일 1', 1);
    if (currentFile2Url) buildRow(currentFile2Url, '첨부파일 2', 2);
}

// '파일교체' 버튼 클릭 시: 새 파일을 골라 R2에 업로드하고, 성공하면 해당 주문 문서의
// file1Url/file2Url을 새 주소로 덮어씁니다. (접수상태가 '대기'일 때만 버튼이 보이므로
// 여기서도 다시 한 번 상태를 확인해 안전하게 막습니다)
window.triggerFileReplace = function(slot) {
    if (!currentViewId) return;
    if (currentDetailStatus !== '대기') {
        alert("접수상태가 '대기'일 때만 파일을 교체할 수 있습니다.");
        return;
    }

    const tempInput = document.createElement('input');
    tempInput.type = 'file';
    tempInput.id = 'temp-replace-file-input-' + Date.now();
    tempInput.style.display = 'none';
    document.body.appendChild(tempInput);

    tempInput.addEventListener('change', async () => {
        if (!tempInput.files || tempInput.files.length === 0) {
            document.body.removeChild(tempInput);
            return;
        }
        if (!confirm('선택한 파일로 교체하시겠습니까? 기존 첨부파일은 새 파일로 대체됩니다.')) {
            document.body.removeChild(tempInput);
            return;
        }

        try {
            await ensureAnonymousLogin();
            const authorName = currentViewAuthor || '주문자';
            const newUrl = await uploadToR2(tempInput.id, authorName);
            if (!newUrl) {
                alert('업로드에 실패했습니다.');
                return;
            }

            const fieldName = slot === 1 ? 'file1Url' : 'file2Url';
            await updateDoc(doc(db, "boards", currentViewId), { [fieldName]: newUrl });

            if (slot === 1) currentFile1Url = newUrl; else currentFile2Url = newUrl;
            renderDetailFiles();

            alert('파일이 교체되었습니다.');
        } catch (e) {
            if (e.code === "permission-denied") {
                alert("본인이 작성한 글만 파일을 교체할 수 있습니다. (다른 기기/브라우저에서 작성한 글이거나, 브라우저 데이터를 지운 경우 본인 글로 인식되지 않을 수 있습니다.)");
            } else {
                alert('파일 교체 중 오류가 발생했습니다: ' + e.message);
            }
        } finally {
            document.body.removeChild(tempInput);
        }
    });

    tempInput.click();
};

// [R2 업로드 함수] 업로드 및 보안 검사 포함
// onProgress(loaded, total)을 넘기면 실제 업로드된 바이트 수를 실시간으로 알려줍니다.
function uploadToR2(fileInputId, authorName, onProgress) {
    return new Promise((resolve, reject) => {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput || fileInput.files.length === 0) {
            resolve(null);
            return;
        }

        const file = fileInput.files[0];

        // 1. 용량 제한 ( MB = 500 * 1024 * 1024 bytes)
        const MAX_SIZE = 500 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert("⚠️ 파일 용량이 너무 큽니다. 500MB 이하의 파일만 업로드 가능합니다.");
            reject(new Error("파일 크기 초과: " + (file.size / (1024 * 1024)).toFixed(2) + "MB"));
            return;
        }

        // 2. 보안을 위한 확장자 필터링
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'ai', 'psd', 'zip', 'hwp', 'eps', 'gif', 'HEIC', 'WEBP', 'xlsx', 'ppt', 'pptx'];
        const ext = file.name.split('.').pop().toLowerCase();

        if (!allowedExtensions.includes(ext)) {
            alert("⚠️ 허용되지 않는 파일 형식입니다.");
            reject(new Error("보안상 차단된 파일 형식: " + ext));
            return;
        }

        // 3. 중복 방지: 동일 파일명(확장자 포함) 방지
        // 파일명과 현재 시간을 조합하여 고유한 이름을 생성합니다.
        const uniqueFileName = `${authorName}_${Date.now()}_${file.name}`;

        const WORKER_URL = "https://r2.ecogr.workers.dev/";

        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `${WORKER_URL}?name=${encodeURIComponent(uniqueFileName)}`, true);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("X-File-Size", file.size);

        // 실제 업로드된 바이트 수를 실시간으로 전달 (네트워크 진행 상황 그대로)
        if (xhr.upload && typeof onProgress === 'function') {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    onProgress(e.loaded, e.total);
                }
            });
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                if (typeof onProgress === 'function') onProgress(file.size, file.size);
                try {
                    const result = JSON.parse(xhr.responseText);
                    resolve(result.url);
                } catch (e) {
                    reject(new Error("업로드 응답을 처리하지 못했습니다."));
                }
            } else {
                reject(new Error("업로드 실패: " + xhr.statusText));
            }
        };

        xhr.onerror = () => reject(new Error("업로드 중 네트워크 오류가 발생했습니다."));

        xhr.send(file);
    });
}

const PAGE_SIZE = 7; // 화면에 한 번에 보여줄 개수 (기존과 동일, 변경 없음)

// [최적화] 삭제된(isDeleted:true) 글이 섞여 있을 때, 예전에는 매번 PAGE_SIZE(7개)씩만
// 가져와서 부족하면 또 7개, 또 7개... 식으로 Firestore 왕복(round-trip)이 여러 번
// 반복되어 느려졌습니다. (왕복 1번당 네트워크 지연이 그대로 누적됨)
// 이제는 삭제된 글 때문에 목표 개수가 부족할 경우, 두 번째 시도부터는 부족한 개수보다
// 넉넉하게(OVER_FETCH_MULTIPLIER배) 한 번에 가져와서 왕복 횟수를 최소화합니다.
// - 삭제된 글이 아예 없다면: 기존과 동일하게 딱 1번 왕복으로 끝남 (더 느려지지 않음)
// - 삭제된 글이 섞여 있다면: 왕복 횟수가 크게 줄어듦
// - isDeleted 필드가 없는 예전 글도 그대로 유효 처리되므로(data.isDeleted !== true),
//   데이터 유실 위험 없이 안전하게 동작합니다.
const OVER_FETCH_MULTIPLIER = 3;
const MAX_FETCH_LIMIT = 50; // 한 번에 과도하게 많이 읽지 않도록 상한

async function fetchValidOrders(targetCount) {
    const collected = [];
    let exhausted = false;

    while (collected.length < targetCount && !exhausted) {
        const remaining = targetCount - collected.length;
        // 첫 시도는 필요한 만큼만, 그 다음부터는 여유 있게 가져와서 왕복 횟수를 줄입니다.
        const fetchLimit = Math.min(
            collected.length === 0 ? remaining : remaining * OVER_FETCH_MULTIPLIER,
            MAX_FETCH_LIMIT
        );

        const q = lastVisible
            ? query(ordersCollection, orderBy("createdAt", "desc"), startAfter(lastVisible), limit(fetchLimit))
            : query(ordersCollection, orderBy("createdAt", "desc"), limit(fetchLimit));
        const snapshot = await getDocs(q);

        if (snapshot.empty) { exhausted = true; break; }

        for (const docSnap of snapshot.docs) {
            lastVisible = docSnap; // 숨김 처리된 글도 포함해서 커서를 갱신 (중복/누락 방지)
            const data = docSnap.data();
            if (data.isDeleted !== true) {
                collected.push({ id: docSnap.id, ...data });
                if (collected.length >= targetCount) break;
            }
        }

        if (snapshot.docs.length < fetchLimit) {
            exhausted = true; // Firestore에 더 가져올 문서가 없음
        }
    }

    hasMoreOrders = !exhausted;
    return collected;
}

async function loadAndRender() {
    try {
        allOrders = [];
        lastVisible = null;
        allOrders = await fetchValidOrders(PAGE_SIZE);
        renderTable();
    } catch (err) { console.error(err); }
}

// 2. 더보기 클릭 시 유효한 글 8개를 추가로 채우기
window.loadMore = async function() {
    if (!hasMoreOrders) { alert("더 이상 게시글이 없습니다."); return; }
    try {
        const newOnes = await fetchValidOrders(PAGE_SIZE);
        if (newOnes.length === 0) { alert("더 이상 게시글이 없습니다."); return; }
        allOrders = allOrders.concat(newOnes);
        renderTable();
    } catch (err) { console.error(err); }
};




function renderTable() {
    const listBody = document.getElementById("list-body");
    listBody.innerHTML = "";
    
    if (allOrders.length === 0) {
        listBody.innerHTML = `<tr><td colspan="3" class="py-8 text-gray-400 text-center text-sm">내역이 존재하지 않습니다.</td></tr>`;
    } else {
        const now = new Date();
        allOrders.forEach(data => {
            const d = data.createdAt.toDate();
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            
            // 작성자 이름 끝자리 블라인드 처리 로직 (예전엔 3일 지난 글만 가렸는데,
            // 신규로 작성되는 글도 처음부터 똑같이 가려지도록 통일함)
            let author = data.author || "김준혁";
            if (author.length > 1) {
                author = author.substring(0, author.length - 1) + "*(정보보호)";
            }

            const diffInHours = (now - d) / (1000 * 60 * 60);
            const newBadge = diffInHours <= 24 ? '<span class="new-badge">NEW</span>' : '';
            let displayTitle = data.title || data.productName;
            if (displayTitle.length > 5) displayTitle = displayTitle.substring(0, 10) + "***";
            
            listBody.innerHTML += `<tr class="hover:bg-gray-50 border-b cursor-pointer text-center text-gray-700" onclick="viewDetail('${data.id}')">
                <td class="py-3 px-4 text-left font-medium text-gray-900 hover:underline">🔒 ${displayTitle} (접수완료) ${newBadge}</td>
                <td class="py-3 text-sm text-gray-600">${author}</td>
                <td class="py-3 text-xs text-gray-400">${dateStr}</td></tr>`;
        });
    }

    const pager = document.getElementById("pagination");
    pager.innerHTML = "";
    if (allOrders.length > 0 && hasMoreOrders) {
        pager.innerHTML = `
            <button onclick="loadMore()" class="w-full mt-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 py-2 rounded font-bold text-sm transition">
                더보기
            </button>
        `;
    }
}












// 3. 확인 버튼 클릭 시 로직 (비밀번호 10회 실패 시 3시간 차단)
document.getElementById("modal-confirm-btn").addEventListener("click", async () => {
    // 1. 차단 시간 체크
    const blockUntil = localStorage.getItem("blockUntil");
    const now = new Date().getTime();

    if (blockUntil && now < parseInt(blockUntil)) {
        const remainingSec = Math.ceil((parseInt(blockUntil) - now) / 1000);
        const min = Math.floor(remainingSec / 60);
        const sec = remainingSec % 60;
        alert(`비밀번호를 너무 많이 틀려 ${min}분 ${sec}초 동안 접속이 제한됩니다.`);
        return;
    }

    const inputName = document.getElementById("modal-name-input").value.trim();
    const inputPwd = document.getElementById("modal-password-input").value;

    // 공개 문서: 상품명/수량/가격 등 비민감 정보만 들어있음 (비밀번호 검증과 무관하게 먼저 읽어도 안전)
    const snap = await getDoc(doc(db, "boards", currentViewId));
    if (!snap.exists()) {
        alert("데이터를 찾을 수 없습니다.");
        return;
    }
    const data = snap.data();

    // 2. 입력한 이름+뒷4자리로 secretId를 계산해서, 그 문서가 "존재하는지"로 검증합니다.
    //    (틀린 값이면 애초에 그런 경로의 문서가 존재하지 않으므로 exists()가 false가 됩니다)
    const secretId = await computeSecretId(currentViewId, inputName, inputPwd);
    const privateSnap = await getDoc(doc(db, "boards", currentViewId, "private", secretId));

    if (inputName === "" || !privateSnap.exists()) {
        let failCount = parseInt(localStorage.getItem("failCount") || "0") + 1;
        
        if (failCount >= 10) {
            // 3시간 차단 설정
            localStorage.setItem("blockUntil", (now + (3 * 60 * 60 * 1000)).toString());
            localStorage.setItem("failCount", "0");
            alert("비밀번호를 10회 틀려 3시간 동안 접속이 제한됩니다.");
        } else {
            localStorage.setItem("failCount", failCount.toString());
            alert(`작성자명 또는 전화번호가 일치하지 않습니다. (${failCount}/10회)`);
        }
        return;
    }

    const privateData = privateSnap.data(); // phone, address, message - private 문서에서만 얻음
    currentViewAuthor = data.author;
    currentViewPhone = privateData.phone;

    // 양방향 제한: 신청 자체는 openCashPage/segum.html에서 막고,
    // 여기는 "이미 신청/등록된 쪽의 버튼을 즉시 숨기는" UI 노출만 담당
    const segumBtn = document.getElementById('segum-btn-id');
    if (segumBtn) {
        segumBtn.style.display = ''; // 매번 렌더링 시 초기화 후 재판단
        // 이 주문에 현금영수증 신청 기록이 있으면(발행 전이어도) 세금계산서 버튼 숨김
        getDoc(doc(db, "cashReceipt1", currentViewId)).then(cashSnap => {
            if (cashSnap.exists()) {
                segumBtn.style.display = 'none';
            }
        }).catch(() => {});
    }
    const cashBtn = document.getElementById('cash-receipt-btn');
    if (cashBtn) {
        cashBtn.style.display = '';
        // 이 이름+전화번호로 세금계산서가 이미 등록돼 있으면 현금영수증 버튼 숨김
        computeSegumId(currentViewAuthor, currentViewPhone).then(segumId =>
            getDoc(doc(db, "segum1", segumId))
        ).then(segumSnap => {
            if (segumSnap.exists()) {
                cashBtn.style.display = 'none';
            }
        }).catch(() => {});
    }

    // 3. 인증 성공 시 카운트 초기화 및 상세 화면 렌더링
    localStorage.setItem("failCount", "0");
    document.getElementById("password-modal").classList.add("hidden");
    document.getElementById("modal-name-input").value = "";
    document.getElementById("modal-password-input").value = "";
    
    // 기존에 작동하던 상세 렌더링 로직 (데이터 뿌리기, 수정 버튼, 파일, 삭제 등)
    document.getElementById("detail-title").innerText = `${data.productName} 스티커 / 도안 접수`;
    document.getElementById("detail-author").innerText = `작성자: ${data.author}`;

    // 이미 여기서 이름+비밀번호 확인을 마쳤으므로, "시안보기"를 눌렀을 때
    // index2에서 또 비밀번호를 묻지 않고 이 글이 바로 열리도록 autoId와 key(secretId)를 붙여줍니다.
    // (전화번호 자체가 아니라 secretId만 넘기므로 URL에 개인정보가 노출되지 않습니다)
    const sianLink = document.getElementById("sian-view-link");
    if (sianLink) {
        sianLink.href = `https://sowonnamoo.github.io/myboard/index2?autoId=${currentViewId}&key=${secretId}`;
    }
    const d = data.createdAt.toDate();
    document.getElementById("detail-date").innerText = `작성일: ${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
    document.getElementById("detail-qty").innerText = data.quantity;
    document.getElementById("detail-size").innerText = data.size;

    // data.price가 저장 시점 형식에 따라 "10000" 또는 "10000원"처럼 섞여 있을 수 있어서,
    // 항상 숫자만 뽑아낸 뒤 '원'을 한 번만 붙이도록 정규화합니다. (이전엔 이미 '원'이 붙은 값에
    // toLocaleString() + '원'을 또 붙여서 "원원"으로 중복 표시되는 문제가 있었습니다)
    const priceDigits = data.price ? Number(String(data.price).replace(/[^0-9]/g, '')) || 0 : 0;
    document.getElementById("detail-price").innerText = priceDigits.toLocaleString() + '원';
    document.getElementById("detail-phone").innerText = privateData.phone;
    document.getElementById("detail-address").innerText = privateData.address;
    document.getElementById("detail-msg").innerText = privateData.message || "내용 없음";
    window.syncStatusOverlay(data.status);

    // 현재 주문의 접수상태를 기억해둠 (파일교체 버튼 노출 여부 등에서 재사용)
    currentDetailStatus = data.status;

    // 접수상태가 '접수에러'이면 견적서~주문삭제 버튼 영역을 숨기고 안내문구를 대신 보여줍니다.
    const actionButtons = document.getElementById("detail-action-buttons");
    const errorNotice = document.getElementById("error-status-notice");
    if (data.status === '접수에러') {
        if (actionButtons) actionButtons.classList.add('hidden');
        if (errorNotice) errorNotice.classList.remove('hidden');
    } else {
        if (actionButtons) actionButtons.classList.remove('hidden');
        if (errorNotice) errorNotice.classList.add('hidden');
    }

    // 장바구니(01my.html 쿼리 등)로 자동 입력되어 저장된 주문이면 "장바구니담기" 버튼을 숨기고 클릭도 막습니다.
    // 작성자가 제품명/수량/사이즈를 직접 입력해서 작성한 주문일 때만 이 버튼이 보이고 클릭됩니다.
    const addCartBtn = document.getElementById("add-cart-btn");
    if (addCartBtn) {
        if (data.fromCart) {
            addCartBtn.classList.add("hidden");
            addCartBtn.disabled = true;
            addCartBtn.style.pointerEvents = "none";
        } else {
            addCartBtn.classList.remove("hidden");
            addCartBtn.disabled = false;
            addCartBtn.style.pointerEvents = "";
        }
    }
    
    // 배송지 수정하기 기능은 개인정보(전화번호/주소) 보호를 위해 제거되었습니다.
    // 주소 변경이 필요한 경우 관리자에게 별도로 요청해야 합니다.
    
   
 // 파일교체 버튼은 접수상태가 '대기'일 때만(=아직 결제/작업 전) 보여줍니다.
    currentFile1Url = data.file1Url || null;
    currentFile2Url = data.file2Url || null;
    renderDetailFiles();

    // 삭제 버튼 설정 (익명 로그인 확인 후 진행. 실제로 문서를 삭제합니다.
    // 본인 글인지 여부(또는 관리자 이메일 로그인 여부)는 Firestore 규칙이 검사하며,
    // 해당 안 되면 규칙에서 거부됩니다.)
 document.getElementById("detail-delete-btn").onclick = async () => {
    await ensureAnonymousLogin();
    if(confirm("정말로 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.")) { 
        try { 
            await deleteDoc(doc(db, "boards", currentViewId)); 
            
            alert("삭제되었습니다."); 
            location.reload(); 
            
        } catch (e) { 
            if (e.code === "permission-denied") {
                alert("본인이 작성한 글만 삭제할 수 있습니다. (다른 기기/브라우저에서 작성한 글이거나, 브라우저 데이터를 지운 경우 본인 글로 인식되지 않을 수 있습니다.)");
            } else {
                alert("삭제 실패: " + e.message);
            }
            }
        } 
    };

    // 상세화면으로 전환
    switchView('detail');

}); // <--- 이것이 modal-confirm-btn의 click 이벤트 리스너를 닫는 괄호입니다.

// ... 나머지는 기존 코드와 동일 (생략) ...
document.getElementById("modal-cancel-btn").addEventListener("click", () => {
    document.getElementById("password-modal").classList.add("hidden");
    const nameInput = document.getElementById("modal-name-input");
    if (nameInput) nameInput.value = "";
    document.getElementById("modal-password-input").value = "";
});

let textInterval, barInterval; 
document.getElementById("save-btn").addEventListener("click", async () => {
    // [추가] 파일명 중복 확인
    const f1 = document.getElementById("file-1").files[0];
    const f2 = document.getElementById("file-2").files[0];
    if (f1 && f2 && f1.name === f2.name) {
        alert("⚠️ 경고: 파일명이 동일합니다. 다른 이름의 파일로 다시 선택해주세요.");
        return;
    }
    // [추가] 파일명은 달라도 용량이 100% 일치하면 같은 파일을 중복 업로드했을 가능성이 높으므로 차단
    if (f1 && f2 && f1.size === f2.size) {
        alert("⚠️ 경고: 두 파일의 용량이 동일합니다. 같은 파일 중복업로드가 의심됩니다. 다른 용량의 파일로 올려주세요.");
        return;
    }    // 1. 기존 유효성 검사 (침범 안 함)
    const fields = ['input-author', 'product-name', 'quantity', 'size', 'phone', 'address'];
    if (fields.some(id => !document.getElementById(id).value.trim())) { alert("필수 항목을 모두 입력해주세요."); return; }
    const file1 = document.getElementById("file-1");
    if (file1.files.length === 0) { alert("최소 1개의 파일을 첨부해주세요."); return; }
    const phoneVal = document.getElementById('phone').value.replace(/-/g, '');
    if (phoneVal.length !== 11) { alert("전화번호 11자리를 정확히 입력해주세요."); return; }

    // 2. 업로드 진행률 UI 준비
    //    - 더 이상 "3초마다 5% 증가"하는 가짜 타이머가 아니라, XHR의 실제 업로드 바이트 수를 그대로 반영합니다.
    //    - 몇 번째 파일을 올리고 있는지(1/2, 2/2), 몇 MB 중 몇 MB가 올라갔는지까지 보여줍니다.
    const spinner = document.getElementById("loading-spinner");
    const bar = document.getElementById("red-progress-bar");
    const text = document.getElementById("loading-text");
    const percentText = document.getElementById("upload-percent-text");
    const fileInfoText = document.getElementById("upload-file-info");

    const uploadFile1 = f1 || null;
    const uploadFile2 = f2 || null;
    const fileCount = (uploadFile1 ? 1 : 0) + (uploadFile2 ? 1 : 0);
    const totalBytes = (uploadFile1 ? uploadFile1.size : 0) + (uploadFile2 ? uploadFile2.size : 0);

    let uploadedFile1 = 0;
    let uploadedFile2 = 0;
    let currentFileLabel = '';

    const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1) + 'MB';

    function renderUploadProgress() {
        const uploaded = uploadedFile1 + uploadedFile2;
        const percent = totalBytes > 0 ? Math.min(100, Math.round((uploaded / totalBytes) * 100)) : 0;
        bar.style.width = percent + '%';
        percentText.textContent = percent + '%';
        fileInfoText.textContent = totalBytes > 0
            ? `${currentFileLabel} ${formatMB(uploaded)} / ${formatMB(totalBytes)}`.trim()
            : '';
    }

    spinner.classList.remove("hidden");
    text.textContent = "파일 업로드 중...";
    currentFileLabel = fileCount > 1 ? '(1/' + fileCount + ')' : '';
    renderUploadProgress();

    // 3. 기존 글쓰기 로직 (침범 안 함)
  try {
    // 글을 저장하기 전에 익명 로그인이 끝나서 uid가 확정됐는지 확인합니다.
    // (본인 글만 나중에 수정/삭제할 수 있으려면 이 uid가 문서에 같이 저장돼야 합니다.)
    const currentUser = await ensureAnonymousLogin();

    // 장바구니에서 자동으로 채워진 주문인지(제품명/수량/사이즈가 읽기전용이면 장바구니발), 아니면
    // 작성자가 직접 입력한 주문인지 여기서 판별해서 함께 저장합니다.
    const isFromCart = document.getElementById('product-name').readOnly === true;

    // 1. 파일 업로드 실행 (진행 콜백으로 실제 업로드된 바이트 수를 게이지에 반영)
    const file1Url = await uploadToR2("file-1", document.getElementById('input-author').value, (loaded) => {
        uploadedFile1 = loaded;
        currentFileLabel = fileCount > 1 ? '(1/' + fileCount + ')' : '';
        renderUploadProgress();
    });

    currentFileLabel = fileCount > 1 ? '(2/' + fileCount + ')' : '';
    const file2Url = await uploadToR2("file-2", document.getElementById('input-author').value, (loaded) => {
        uploadedFile2 = loaded;
        currentFileLabel = fileCount > 1 ? '(2/' + fileCount + ')' : '';
        renderUploadProgress();
    });

    // 파일 업로드는 끝났지만 서버에 저장하는 단계는 진행률 계산이 불가능한 구간이라
    // 게이지는 100%로 유지한 채 안내 문구만 바꿔서 "멈춘 게 아니라 진행 중"임을 알려줍니다.
    text.textContent = "주문 정보를 저장하는 중...";
    fileInfoText.textContent = "잠시만 기다려주세요.";

// [수정] IP 정보 가져오기
    const userIp = await getUserIp();

    const authorVal = document.getElementById('input-author').value;
    const phoneVal2 = document.getElementById('phone').value; // 원본(하이픈 포함 가능) - private 저장용
    const addressVal = document.getElementById('address').value + " " + document.getElementById('address-detail').value;
    const messageVal = document.getElementById('message').value;

    // 2. 문서 ID를 먼저 발급받고(아직 저장은 안 함), 그 ID로 조회키(secretId)를 계산합니다.
    const boardRef = doc(collection(db, "boards"));
    const boardId = boardRef.id;
    const secretId = await computeSecretId(boardId, authorVal, phoneVal2);

    // 3. 공개 문서: 개인정보(phone/address/message/password) 절대 포함하지 않음
    await setDoc(boardRef, {
    author: authorVal,
    productName: document.getElementById('product-name').value,
    quantity: document.getElementById('quantity').value,
    size: document.getElementById('size').value,
    price: document.getElementById('price').value,
    file1Url: file1Url, // 아까 위에서 선언한 변수 그대로 사용
    file2Url: file2Url, // 아까 위에서 선언한 변수 그대로 사용
    ip: userIp, // <--- IP 주소 저장 추가
    uid: currentUser.uid, // 익명 로그인으로 발급된 고유 ID (본인 글 판별용)
    createdAt: new Date(),
    isDeleted: false,
    status: '대기',
    fromCart: isFromCart // true: 장바구니 자동입력 주문 / false: 작성자가 직접 입력한 주문
    });

    // 4. 개인정보는 boards/{boardId}/private/{secretId} 문서에만 저장.
    //    이 경로는 이름+전화번호 뒷4자리를 정확히 알아야만 다시 계산해서 조회할 수 있습니다.
    await setDoc(doc(db, "boards", boardId, "private", secretId), {
        phone: phoneVal2,
        address: addressVal,
        message: messageVal,
        uid: currentUser.uid
    });

    // 5. 관리자 페이지 전용 조회용으로, 동일한 개인정보를 adminOrders/{boardId}에도 저장.
    //    문서 ID가 boardId라서 secretId 계산 없이 관리자가 바로 단건 조회할 수 있고,
    //    Rules상 isAdmin()만 읽을 수 있어 고객/비관리자에게는 노출되지 않습니다.
    await setDoc(doc(db, "adminOrders", boardId), {
        phone: phoneVal2,
        address: addressVal,
        message: messageVal,
        uid: currentUser.uid
    });

    text.textContent = "접수 완료!";
    fileInfoText.textContent = '';

    alert("접수되었습니다.");

    // 장바구니를 하나의 주문으로 합쳐 접수한 경우, 장바구니 비우기
    localStorage.removeItem('pendingCartOrders');
    switchView('list');
} catch (e) {
    console.error(e);
    alert("오류: " + e.message);
} finally {
    // 4. 로딩바 종료
    spinner.classList.add("hidden");
    bar.style.width = "0%";
    percentText.textContent = "0%";
    fileInfoText.textContent = '';
}
});




document.getElementById("go-write-btn").addEventListener("click", () => {
    renderCombinedCartOrder();
    switchView('write');
});



loadAndRender();




// 장바구니 담기 + 팝업 열기 통합 코드
document.getElementById("add-cart-btn").addEventListener("click", () => {
    if (!currentViewId) {
        alert("주문 정보를 찾을 수 없습니다.");
        return;
    }

    // 상세 페이지에서 현재 정보 가져오기
    const titleText = document.getElementById("detail-title").innerText;
    const dateText = document.getElementById("detail-date").innerText; // 작성일
    const qtyText = document.getElementById("detail-qty").innerText;
    const sizeText = document.getElementById("detail-size").innerText;
    const priceText = document.getElementById("detail-price").innerText.replace(/[^0-9]/g, '');

    let cart = JSON.parse(localStorage.getItem('myCart') || '[]');
    if (!Array.isArray(cart)) cart = [];

    // 작성일(=주문 접수건)이 같은 상품은 중복으로 담을 수 없도록 boardId로 확인합니다.
    // (같은 주문은 항상 같은 boardId를 가지므로, 이 값이 곧 "동일한 작성일의 그 상품"인지 판별하는 기준입니다)
    const alreadyInCart = cart.some(it => it.boardId === currentViewId);
    if (alreadyInCart) {
        alert("이미 장바구니에 담긴 상품입니다. (동일 접수일 상품은 중복으로 담을 수 없습니다)");
        return;
    }

    const item = {
        boardId: currentViewId, // 결제 완료 시 이 주문의 접수상태를 갱신하는 데 사용됩니다.
        name: titleText,
        date: dateText,
        qty: qtyText,
        size: sizeText,
        price: priceText
    };

    // 장바구니에 저장
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

// 세금계산서 버튼: 이 주문의 작성자/전화번호를 함께 넘겨서, segum.html이 열리자마자
// "이미 신청돼 있는지"를 바로 확인해 보여줄 수 있게 함
window.openSegumPage = function() {
    const name = encodeURIComponent(currentViewAuthor || '');
    const phone = encodeURIComponent(currentViewPhone || '');
    openLink(`https://sowonnamoo.github.io/myboard/segum?name=${name}&phone=${phone}`);
};


window.openCashPage = async () => {
    if (!currentViewId || !currentViewAuthor || !currentViewPhone) {
        alert('주문 정보를 찾을 수 없습니다.');
        return;
    }

    // 1. 세금계산서가 이미 등록된 이름+전화번호면 현금영수증 신청 자체를 막습니다.
    try {
        const segumId = await computeSegumId(currentViewAuthor, currentViewPhone);
        const segumSnap = await getDoc(doc(db, "segum1", segumId));
        if (segumSnap.exists()) {
            alert('이미 세금계산서 신청이 등록되셔서 현금영수증 신청은 되지 않습니다.');
            return;
        }
    } catch (e) {
        alert('확인 중 오류가 발생했습니다: ' + e.message);
        return;
    }

    const cashRef = doc(db, "cashReceipt1", currentViewId);
    let snap;
    try {
        snap = await getDoc(cashRef);
    } catch (e) {
        alert('조회 중 오류가 발생했습니다: ' + e.message);
        return;
    }

    if (snap.exists()) {
        const data = snap.data();
        if (data.fileUrl) {
            window.open(data.fileUrl, '_blank');
        } else {
            alert('현금영수증이 신청되셨습니다.\n택배 발송후 1~2일후 본 버튼을 다시 눌러주시면 우클릭 다운로드 가능합니다.');
        }
        return;
    }

    // 2. 최초 신청: 발행희망번호(사업자번호 또는 전화번호) 입력받기
    const cashNumber = prompt('현금영수증 발행희망 번호를 입력해주세요.\n(사업자등록번호 또는 전화번호 중 1개)');
    if (!cashNumber || !cashNumber.trim()) return;

    try {
        await setDoc(cashRef, {
            boardId: currentViewId,
            author: currentViewAuthor,
            cashNumber: cashNumber.trim(),
            fileUrl: '',
            createdAt: serverTimestamp(),
            uid: (await ensureAnonymousLogin()).uid
        });
        // 이름+전화번호 기반 식별자로도 기록 -> segum.html에서 "이미 현금영수증 신청됨"을 확인할 수 있게 함
        // (segum1과 동일한 해싱 방식이라 같은 사람이면 항상 같은 ID가 나옴)
        const cashSecretId = await computeSegumId(currentViewAuthor, currentViewPhone);
        await setDoc(doc(db, "cashSecret", cashSecretId), {
            boardId: currentViewId,
            createdAt: serverTimestamp()
        }, { merge: true });
        const segumBtnNow = document.getElementById('segum-btn-id');
        if (segumBtnNow) segumBtnNow.style.display = 'none';
        alert('현금영수증이 신청되셨습니다.\n택배 발송후 1~2일후 본 버튼을 다시 눌러주시면 우클릭 다운로드 가능합니다.');
    } catch (e) {
        alert('신청 중 오류가 발생했습니다: ' + e.message);
    }
};


    // - cardjun1/{boardId} 문서에 관리자가 fileUrl을 등록해뒀으면 바로 열어줌
    // - 아직 등록 전이면(문서가 없거나 fileUrl이 비어있으면) 안내 메시지만 표시
    // - 고객이 직접 "신청"하는 절차는 없음 (관리자가 발송 후 알아서 등록)
window.openCardPage = async () => {
    if (!currentViewId) {
        alert('주문 정보를 찾을 수 없습니다.');
        return;
    }

    try {
        const snap = await getDoc(doc(db, "cardjun1", currentViewId));
        if (snap.exists() && snap.data().fileUrl) {
            window.open(snap.data().fileUrl, '_blank');
        } else {
            alert('택배물 발송후 등록됩니다.');
        }
    } catch (e) {
        alert('택배물 발송후 등록됩니다.');
    }
};


// 기존 syncStatusOverlay 함수를 이 코드로 덮어쓰세요 (타이밍 보완)
window.syncStatusOverlay = function(status) {
    const targets = [
        { id: 'target-box-notice', imgId: 'img-1' },
        { id: 'target-btn-tax',    imgId: 'img-2' }
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
    // 신뢰할 수 있는 출처(payment.html이 떠 있는 도메인)에서 온 메시지만 처리
    if (event.origin !== 'https://sowonnamoo.github.io') return;
    if (!event.data || event.data.type !== 'PAYMENT_SUCCESS') return;

    if (!currentViewId) {
        console.warn('결제 확인 메시지를 받았지만 현재 열려있는 주문이 없습니다.');
        return;
    }

    // 가격 비교 시 "50,000원" / "50000" / 50000 처럼 표기 형식이 달라도 안전하게 비교되도록
    // 양쪽 모두 숫자만 추출해서 비교합니다.
    const paidPriceDigits = String(event.data.price ?? '').replace(/[^0-9]/g, '');

    try {
        // 1. 현재 상세 페이지에 떠 있는 주문 정보를 가져옵니다.
        const docRef = doc(db, "boards", currentViewId);
        const snap = await getDoc(docRef);

        if (!snap.exists()) return;

        const data = snap.data();
        const dbPriceDigits = String(data.price ?? '').replace(/[^0-9]/g, '');

        // 2. [핵심] 상태가 '대기'이고 금액이 일치할 때만 업데이트!
        if (data.status === '대기' && dbPriceDigits === paidPriceDigits) {

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
            console.log("금액이 일치하지 않습니다.", { dbPriceDigits, paidPriceDigits });
        }
    } catch (e) {
        console.error("결제 상태 반영 실패:", e);
        alert("결제는 완료되었으나 상태 반영 중 오류가 발생했습니다. 새로고침 후 다시 확인해주시거나, 계속되면 관리자에게 문의해주세요.");
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
            // 결제 완료일 때는 이미지 표시
            positionImage('anchor-text', 'img-1', -25, -25);
            positionImage(isBank ? 'card-receipt-btn' : 'segum-btn-id', 'img-2', -8, -10);
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
    setupFileExtensionGuard(); // 첨부파일 확장자 제한 감시 시작 (index.html에는 file-1/file-2가 없어서 조용히 무시됨)

    // 2. 01my.html의 "주문하기"가 쿼리스트링으로 보낸 상품이 있으면 장바구니(pendingCartOrders)에 "추가"합니다.
    //    (01my.html은 매번 새로 이 페이지로 이동/새창 열기를 하며 상품 1개 정보를 통째로 넘겨줄 뿐이라,
    //     여기서 받을 때마다 기존 장바구니에 쌓아야 "여러 상품 담기"가 됩니다.)
    const params = new URLSearchParams(window.location.search);

    if (params.has('productId')) {
        // 01my.html이 실제로 보내는 형식:
        // ?productId=01my&options={"options1":"명함",...}&qty=200&count=1&width=90&height=50&price=5,500원&weight=0.225&finishings=...
        let optionsObj = {};
        try {
            optionsObj = JSON.parse(params.get('options') || '{}');
        } catch (e) {
            optionsObj = {};
        }

        const newItem = {
            productId: params.get('productId') || '',
            options: optionsObj,
            qty: params.get('qty') || '',
            count: params.get('count') || '1',
            width: params.get('width') || '',
            height: params.get('height') || '',
            price: params.get('price') || '',
            weight: params.get('weight') || '',
            finishings: params.get('finishings') || ''
        };

        addItemToCart(newItem);

        // 새로고침해도 같은 상품이 중복으로 다시 담기지 않도록 주소의 쿼리스트링을 제거
        window.history.replaceState(null, '', window.location.pathname);
    } else if (params.has('product')) {
        // 예전 방식(?product=...&size=...) 호환용 - 현재는 cart.html의 "간편구입" 버튼만 이 방식을 사용합니다.
        // simpleMode 표시를 남겨서, renderCombinedCartOrder()에서 상단 장바구니 카드/배송비 로직을
        // 이 경우에만 건너뛸 수 있게 합니다. (01my.html이 쓰는 productId 방식에는 영향 없음)
        const moreComing = params.get('more') === '1'; // cart.html이 상품을 순서대로 이어서 보낼 예정이면 1
        const newItem = {
            productName: params.get('product') || '',
            qty: params.get('qty') || '',
            size: params.get('size') || '',
            price: params.get('price') || '',
            simpleMode: true
        };
        addItemToCart(newItem);
        window.history.replaceState(null, '', window.location.pathname);

        if (!moreComing) {
            // cart.html이 보낼 마지막(또는 유일한) 상품까지 다 받았으면,
            // 이제부터 이 창을 닫거나/뒤로가기/새로고침 등으로 벗어나면 장바구니를 통째로 비웁니다.
            setupSimpleModeAutoClear();
        }
    }

    // 3. 장바구니에 쌓인 상품들을 "담긴 상품" 카드 + 폼에 합쳐서 보여줍니다 (index1.html에만 있는 요소일 때만 동작)
    renderCombinedCartOrder();
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















// [추가] URL 파라미터(autoId) 감지 시, 해당 주문의 비밀번호 확인창을 자동으로 엽니다.
// (기존 viewDetail을 그대로 호출하므로 작성자명+비밀번호 확인과 10회 차단 로직은 동일하게 적용됩니다)
window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    const autoId = params.get('autoId');
    if (!autoId) return;

    const checkInterval = setInterval(() => {
        if (allOrders.length > 0) {
            clearInterval(checkInterval);
            viewDetail(autoId);
        }
    }, 300);
});

async function applyIpSecurity() {
    try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        const userIp = data.ip;
        const docSnap = await getDoc(doc(db, "blocked_ips", userIp));
        if (docSnap.exists()) {
            console.log("차단된 IP입니다. 접수하기 버튼을 제거합니다.");
            // #save-btn (주문작성 화면의 접수하기 버튼)만 숨김
            const style = document.createElement('style');
            style.innerHTML = `
                #save-btn { display: none !important; }
            `;
            document.head.appendChild(style);
        }
    } catch (e) {
        console.error("보안 체크 오류:", e);
    }
}
// 코드 최상단 혹은 적절한 위치에서 실행
applyIpSecurity();
// 페이지 로드 완료 시 실행
window.addEventListener('DOMContentLoaded', applyIpSecurity
);


// 아이피차단글 원천 작성금지
document.getElementById("save-btn").addEventListener("click", async () => {
    // 1. 여기서 다시 한번 IP 확인 (사용자가 버튼을 억지로 살려내서 클릭했더라도 여기서 컷!)
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    const docSnap = await getDoc(doc(db, "blocked_ips", data.ip));
    if (docSnap.exists()) {
        alert("접수가 차단된 IP입니다.");
        return; // 여기서 함수 종료 (데이터 저장 안 됨)
    }
    // 2. 이후 원래 있던 데이터 저장 코드 실행...

});








// IP 주소를 가져오는 함수 추가
async function getUserIp() {
    try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        return data.ip;
    } catch (e) {
        console.error("IP 조회 실패:", e);
        return "unknown";
    }
}


















