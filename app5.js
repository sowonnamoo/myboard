import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    
    // 1. 자동 입력값 처리
    const gaa = params.get('width') || 0;
    const seee = params.get('height') || 0;
    
    document.getElementById('productName').value = params.get('product') || '';
    document.getElementById('sizeCombined').value = `${gaa} x ${seee}`;
    document.getElementById('gaa').value = gaa;
    document.getElementById('seee').value = seee;
    document.getElementById('quantity').value = (params.get('qty') || 0) + '개';
    document.getElementById('price').value = (params.get('price') || 0) + '원';
    document.getElementById('hoo').value = params.get('hoo') || '';
    document.getElementById('message').value = params.get('message') || '';

    // 2. 시안 링크 처리
    if(params.get('f1')) { document.getElementById('file1Link').href = params.get('f1'); document.getElementById('file1Link').style.display = 'inline-block'; }
    if(params.get('f2')) { document.getElementById('file2Link').href = params.get('f2'); document.getElementById('file2Link').style.display = 'inline-block'; }
});

window.submitOrder = async function() {
    const phone = document.getElementById('phone').value;
    const author = document.getElementById('author').value;
    const params = new URLSearchParams(window.location.search);

    if(!author || !phone) return alert("성함과 연락처는 필수입니다.");

    const data = {
        createdAt: serverTimestamp(),
        productName: params.get('product'),
        size: document.getElementById('sizeCombined').value,
        gaa: parseInt(document.getElementById('gaa').value),
        seee: parseInt(document.getElementById('seee').value),
        quantity: parseInt(params.get('qty')),
        price: parseInt(params.get('price')),
        hoo: params.get('hoo'),
        message: document.getElementById('message').value, // 사용자가 수정한 메시지 반영
        file1Url: params.get('f1'),
        file2Url: params.get('f2'),
        author: author,
        phone: phone,
        address: document.getElementById('address').value,
        password: phone.slice(-4),
        paymentMethod: document.getElementById('paymentMethod').value,
        status: "대기"
    };

    try {
        await addDoc(collection(db, "iiii"), data);
        alert("접수가 완료되었습니다.");
        window.location.reload();
    } catch (e) {
        alert("저장 실패: " + e.message);
    }
};

window.execDaumPostcode = function() {
    new daum.Postcode({ oncomplete: (data) => document.getElementById('address').value = data.address }).open();
};


function renderCart() {
    // localStorage에서 데이터를 가져옴
    const cart = JSON.parse(localStorage.getItem("cart")) || [];
    const list = document.getElementById("cart-list");
    let total = 0;
    
    list.innerHTML = ""; // 기존 내용 초기화
    
    cart.forEach(item => {
        const price = Number(item.price) || 0;
        total += price;
        
        list.innerHTML += `
        <div class="cart-item">
            <div style="font-weight:bold;">${item.item || "상품명 없음"}</div>
            <div style="font-size:0.9rem; color:#666; margin-top:5px;">
                사이즈: ${item.width || 0} x ${item.height || 0}mm | 
                수량: ${item.qty || 0}개 | 
                금액: ${price.toLocaleString()}원
            </div>
        </div>`;
    });
    
    document.getElementById("total-price").innerText = "총 결제금액 : " + total.toLocaleString() + "원";
}

